import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { resolveProjectRoot } from './_shared/project-root.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import { createGainSummaryResult } from './_session-gain.js'
import { runSessionCommand, searchSessionCommandOutput } from './_session-command.js'
import { defaultIndexDbPath } from './session-restore.js'
import { sessionElisionSchema } from '#mcp/_session-elision.js'
import type { SearchHit } from '#session-memory/types'

const DEFAULT_TIMEOUT_MS = 30_000

const inputSchema = z
  .object({
    command: z.string().min(1),
    label: z.string().optional(),
    query: z.string().optional(),
    execute: z.boolean().optional().default(false),
    timeoutMs: z.number().int().min(1).max(300_000).optional().default(DEFAULT_TIMEOUT_MS),
    cwd: z.string().optional(),
  })
  .strict()

const outputSchema = createSummaryOutputSchema({
  details: z.object({
    label: z.string(),
    exitCode: z.number(),
    outputBytes: z.number(),
    indexed: z.boolean(),
    summary: z.string(),
    backend: z.enum(['native', 'typescript']),
    fallbackReason: z.string().optional(),
    truncated: z.boolean().optional(),
    capturedBytes: z.number().optional(),
    maxCaptureBytes: z.number().optional(),
    timedOut: z.boolean().optional(),
    signal: z.string().optional(),
    elisions: z.array(sessionElisionSchema).optional(),
    warnings: z.array(z.string()).optional(),
    hits: z
      .array(
        z.object({
          content: z.string(),
          source: z.string(),
          rank: z.number(),
          tier: z.enum(['porter', 'trigram', 'levenshtein']),
        }),
      )
      .optional(),
  }),
})

const tool: ToolDescriptor = {
  name: 'wp_session_execute',
  description:
    'Run one shell command through session-memory execution, using the native backend when available and TypeScript fallback otherwise; index output for search.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session Execute',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (rawInput) => {
    const input = inputSchema.parse(rawInput)
    const label = input.label ?? input.command
    if (!input.execute) {
      return createSummaryResult(
        {
          passed: false,
          summary: 'wp_session_execute requires execute=true before running a shell command',
          exitCode: -1,
          details: {
            label,
            exitCode: -1,
            outputBytes: 0,
            indexed: false,
            summary: 'set execute=true to opt into shell execution',
            backend: 'typescript' as const,
          },
        },
        { isError: true },
      )
    }
    if (process.platform === 'win32') {
      return createSummaryResult(
        {
          passed: false,
          summary: 'wp_session_execute is not supported on win32 yet',
          exitCode: -1,
          details: {
            label,
            exitCode: -1,
            outputBytes: 0,
            indexed: false,
            summary: 'session execute shells through sh -c and rejects win32',
            backend: 'typescript' as const,
          },
        },
        { isError: true },
      )
    }
    try {
      const trustedRootAnchor = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()
      const projectRoot = resolveProjectRoot({ cwd: trustedRootAnchor })
      const effectiveCwd = input.cwd ?? trustedRootAnchor
      const dbPath = defaultIndexDbPath(effectiveCwd)
      const result = await runSessionCommand({
        command: input.command,
        label,
        timeoutMs: input.timeoutMs,
        cwd: effectiveCwd,
        projectRoot,
        dbPath,
      })
      let hits: readonly SearchHit[] | undefined
      if (input.query && result.indexed) {
        hits = searchSessionCommandOutput(dbPath, [label], input.query)
      }
      const passed = result.exitCode === 0
      return createGainSummaryResult(
        {
          passed,
          summary: passed
            ? `command succeeded (${result.outputBytes} bytes${result.indexed ? ', indexed' : ''})`
            : `command failed with exit code ${result.exitCode} (${result.outputBytes} bytes${result.indexed ? ', indexed' : ''})`,
          exitCode: result.exitCode,
          details: {
            label,
            exitCode: result.exitCode,
            outputBytes: result.outputBytes,
            indexed: result.indexed,
            summary: result.summary,
            backend: result.backend,
            ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
            ...(result.truncated === undefined ? {} : { truncated: result.truncated }),
            ...(result.capturedBytes === undefined ? {} : { capturedBytes: result.capturedBytes }),
            ...(result.maxCaptureBytes === undefined
              ? {}
              : { maxCaptureBytes: result.maxCaptureBytes }),
            ...(result.timedOut === undefined ? {} : { timedOut: result.timedOut }),
            ...(result.signal ? { signal: result.signal } : {}),
            ...(result.elisions ? { elisions: [...result.elisions] } : {}),
            ...(result.warnings ? { warnings: [...result.warnings] } : {}),
            ...(hits ? { hits: [...hits] } : {}),
          },
          ...(result.elisions ? { elisions: [...result.elisions] } : {}),
          ...(result.warnings ? { warnings: [...result.warnings] } : {}),
        },
        passed ? {} : { isError: true },
        {
          toolName: tool.name,
          dbPath,
          rawBasisBytes: result.outputBytes,
          rawBytesBasis: 'command_output_total',
        },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return createSummaryResult(
        {
          passed: false,
          summary: `wp_session_execute failed: ${message}`,
          exitCode: -1,
          details: {
            label,
            exitCode: -1,
            outputBytes: 0,
            indexed: false,
            summary: message,
            backend: 'typescript' as const,
          },
        },
        { isError: true },
      )
    }
  },
}

export default tool
