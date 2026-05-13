/**
 * `ak_session_execute` MCP tool — output sandboxing for large command output.
 *
 * Replaces `ctx_execute` as the Lane 2 output-sandboxing tool.
 * When a command produces more than 2KB of output, the content is automatically
 * indexed via the ctx-rs Rust FFI (getStore().insertChunks) and only a compact
 * summary is returned to Claude. Optional query triggers an immediate FTS5 search
 * over the newly indexed content.
 *
 * This is the core mechanism that achieves token savings equivalent to
 * context-mode's 98% output sandboxing — without the ctx_* dependency.
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { getStore } from '#session-memory/store'
import type { SearchHit } from '#session-memory/types'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'

const LARGE_OUTPUT_THRESHOLD_BYTES = 2048
const SUMMARY_PREVIEW_CHARS = 500
const DEFAULT_SEARCH_LIMIT = 10
const COMMAND_TIMEOUT_MS = 120_000

const inputSchema = z
  .object({
    command: z.string().min(1),
    label: z.string().optional(),
    query: z.string().optional(),
    cwd: z.string().optional(),
  })
  .strict()

export type AkSessionExecuteInput = z.infer<typeof inputSchema>

const outputSchema = createSummaryOutputSchema({
  details: z.object({
    label: z.string().optional(),
    exitCode: z.number(),
    outputBytes: z.number(),
    indexed: z.boolean(),
    summary: z.string(),
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

/**
 * Resolve the active session DB path (mirrors session.ts logic).
 * Falls back to a temp path when no repo-hash env is set.
 */
function resolveSessionDbPath(_cwd: string): string {
  const { homedir } = require('node:os') as typeof import('node:os')
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  const repoHash = process.env['CLAUDE_REPO_HASH'] ?? process.env['AK_REPO_HASH'] ?? 'default'
  const dbDir = join(homedir(), '.webpresso', 'sessions')
  mkdirSync(dbDir, { recursive: true })
  return join(dbDir, `${repoHash}.db`)
}

/**
 * Run a shell command synchronously and return stdout+stderr combined.
 */
function runCommandSync(
  command: string,
  cwd: string,
): { output: string; exitCode: number } {
  const PATH_SEP = process.platform === 'win32' ? ';' : ':'
  const localBin = join(cwd, 'node_modules', '.bin')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: [localBin, process.env.PATH].filter(Boolean).join(PATH_SEP),
  }

  try {
    const result = spawnSync('sh', ['-c', command], {
      cwd,
      env,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 50 * 1024 * 1024, // 50MB
      encoding: 'utf8',
    })
    const stdout = result.stdout ?? ''
    const stderr = result.stderr ?? ''
    const output = stdout + (stderr.length > 0 ? '\n' + stderr : '')
    const exitCode = result.status ?? (result.signal != null ? 1 : 0)
    return { output, exitCode }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { output: `[spawn error] ${message}`, exitCode: 1 }
  }
}

const tool: ToolDescriptor = {
  name: 'ak_session_execute',
  description:
    'Run a shell command and sandbox large output via ctx-rs FTS5 indexing. ' +
    'When output exceeds 2KB, stores it in the session knowledge-base and returns a compact summary. ' +
    'Optionally accepts a `query` to search the newly indexed content immediately. ' +
    'Use instead of raw Bash for commands that produce large output (tests, git log, grep, build output).',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session Execute',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (raw) => {
    const input = inputSchema.parse(raw ?? {})
    const cwd = input.cwd ?? process.cwd()
    const label = input.label ?? input.command

    try {
      const { output, exitCode } = runCommandSync(input.command, cwd)
      const outputBytes = Buffer.byteLength(output, 'utf8')
      const shouldIndex = outputBytes > LARGE_OUTPUT_THRESHOLD_BYTES

      let indexed = false
      let hits: readonly SearchHit[] | undefined

      if (shouldIndex) {
        try {
          const dbPath = resolveSessionDbPath(cwd)
          const store = getStore(dbPath)
          store.insertChunks([{ source: label, content: output }])
          indexed = true

          if (input.query) {
            hits = store.search({ query: input.query, limit: DEFAULT_SEARCH_LIMIT, source: label })
          }
        } catch (indexErr) {
          // Indexing failure is non-fatal — still return command output
          process.stderr.write(
            `ak_session_execute: indexing failed: ${(indexErr as Error).message}\n`,
          )
        }
      }

      const summary = output.slice(0, SUMMARY_PREVIEW_CHARS)
      const passed = exitCode === 0

      const payload = {
        passed,
        summary: passed
          ? `command succeeded (${outputBytes} bytes${indexed ? ', indexed' : ''})`
          : `command failed with exit code ${exitCode} (${outputBytes} bytes${indexed ? ', indexed' : ''})`,
        exitCode,
        details: {
          label,
          exitCode,
          outputBytes,
          indexed,
          summary,
          ...(hits !== undefined ? { hits: hits as SearchHit[] } : {}),
        },
      }

      return createSummaryResult(payload)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return createSummaryResult(
        {
          passed: false,
          summary: `ak_session_execute error: ${message}`,
          exitCode: -1,
          details: {
            label,
            exitCode: -1,
            outputBytes: 0,
            indexed: false,
            summary: message,
          },
        },
        { isError: true },
      )
    }
  },
}

export default tool
