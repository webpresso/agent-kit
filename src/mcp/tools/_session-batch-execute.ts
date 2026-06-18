import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { resolveProjectRoot } from './_shared/project-root.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import { createGainSummaryResult } from './_session-gain.js'
import { runSessionCommand, searchSessionCommandOutput } from './_session-command.js'
import { defaultIndexDbPath } from './session-restore.js'
import type { SearchHit } from '#session-memory/types'

const MAX_CONCURRENCY = 8
const DEFAULT_TIMEOUT_MS = 30_000

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = Array.from({ length: items.length }, () => undefined as R)
  let next = 0
  async function runOne(): Promise<void> {
    while (true) {
      const index = next
      next += 1
      if (index >= items.length) return
      results[index] = await worker(items[index]!, index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => runOne()),
  )
  return results
}

const inputSchema = z
  .object({
    commands: z.array(z.object({ label: z.string().min(1), command: z.string().min(1) })).min(1),
    queries: z.array(z.string()).optional(),
    concurrency: z.number().int().min(1).max(MAX_CONCURRENCY).optional().default(1),
    execute: z.boolean().optional().default(false),
    timeoutMs: z.number().int().min(1).max(300_000).optional().default(DEFAULT_TIMEOUT_MS),
    cwd: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>()
    for (const [index, command] of value.commands.entries()) {
      if (seen.has(command.label)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'commands labels must be unique within one batch',
          path: ['commands', index, 'label'],
        })
      }
      seen.add(command.label)
    }
  })
  .strict()

const outputSchema = createSummaryOutputSchema({
  details: z.object({
    results: z.array(
      z.object({
        label: z.string(),
        exitCode: z.number(),
        outputBytes: z.number(),
        indexed: z.boolean(),
        summary: z.string(),
      }),
    ),
    queryHits: z
      .record(
        z.string(),
        z.array(
          z.object({
            content: z.string(),
            source: z.string(),
            rank: z.number(),
            tier: z.enum(['porter', 'trigram', 'levenshtein']),
          }),
        ),
      )
      .optional(),
  }),
})

const tool: ToolDescriptor = {
  name: 'wp_session_batch_execute',
  description:
    'Run multiple shell commands and index bounded outputs into the local session-memory store, then optionally search the indexed results.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session Batch Execute',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (rawInput) => {
    const input = inputSchema.parse(rawInput)
    if (!input.execute) {
      return createSummaryResult(
        {
          passed: false,
          summary: 'wp_session_batch_execute requires execute=true before running shell commands',
          details: {
            results: [] as Array<{
              label: string
              exitCode: number
              outputBytes: number
              indexed: boolean
              summary: string
            }>,
          },
        },
        { isError: true },
      )
    }
    if (process.platform === 'win32') {
      return createSummaryResult(
        {
          passed: false,
          summary: 'wp_session_batch_execute is not supported on win32 yet',
          details: {
            results: [] as Array<{
              label: string
              exitCode: number
              outputBytes: number
              indexed: boolean
              summary: string
            }>,
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
      const results = await mapWithConcurrency(
        input.commands,
        input.concurrency,
        async ({ label, command }) =>
          runSessionCommand({
            command,
            label,
            timeoutMs: input.timeoutMs,
            cwd: effectiveCwd,
            projectRoot,
            dbPath,
          }),
      )

      let queryHits: Record<string, SearchHit[]> | undefined
      if (input.queries && input.queries.length > 0) {
        const indexedLabels = results
          .filter((result) => result.indexed)
          .map((result) => result.label)
        if (indexedLabels.length > 0) {
          queryHits = Object.fromEntries(
            input.queries.map((query) => [
              query,
              searchSessionCommandOutput(dbPath, indexedLabels, query),
            ]),
          )
        }
      }

      const failedCount = results.filter((result) => result.exitCode !== 0).length
      return createGainSummaryResult(
        {
          passed: failedCount === 0,
          summary:
            failedCount === 0
              ? `${results.length} command${results.length === 1 ? '' : 's'} completed`
              : `${failedCount}/${results.length} command${failedCount === 1 ? '' : 's'} failed`,
          details: {
            results,
            ...(queryHits ? { queryHits } : {}),
          },
        },
        failedCount === 0 ? {} : { isError: true },
        {
          toolName: tool.name,
          dbPath,
          rawBasisBytes: results.reduce((sum, result) => sum + result.outputBytes, 0),
          rawBytesBasis: 'batch_command_output_total',
        },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return createSummaryResult(
        {
          passed: false,
          summary: `wp_session_batch_execute failed: ${message}`,
          details: {
            results: [] as Array<{
              label: string
              exitCode: number
              outputBytes: number
              indexed: boolean
              summary: string
            }>,
          },
        },
        { isError: true },
      )
    }
  },
}

export default tool
