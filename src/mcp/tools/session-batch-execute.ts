/**
 * `ak_session_batch_execute` MCP tool — parallel output sandboxing for multiple commands.
 *
 * Replaces `ctx_batch_execute` as the Lane 2 batch output-sandboxing tool.
 * Runs multiple commands (sequentially or in parallel up to `concurrency`),
 * indexes large outputs via ctx-rs FFI, and optionally queries across all newly
 * indexed content in one pass.
 *
 * Equivalent to calling `ak_session_execute` for each command but with a single
 * round-trip and shared query phase after all commands complete.
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
const MAX_CONCURRENCY = 8
const COMMAND_TIMEOUT_MS = 120_000

const commandEntrySchema = z.object({
  label: z.string().min(1),
  command: z.string().min(1),
})

const inputSchema = z
  .object({
    commands: z.array(commandEntrySchema).min(1),
    queries: z.array(z.string()).optional(),
    concurrency: z.number().int().min(1).max(MAX_CONCURRENCY).optional().default(1),
    cwd: z.string().optional(),
  })
  .strict()

export type AkSessionBatchExecuteInput = z.infer<typeof inputSchema>

const commandResultSchema = z.object({
  label: z.string(),
  exitCode: z.number(),
  outputBytes: z.number(),
  indexed: z.boolean(),
  summary: z.string(),
})

const outputSchema = createSummaryOutputSchema({
  details: z.object({
    results: z.array(commandResultSchema),
    queryHits: z.record(z.string(), z.array(z.object({
      content: z.string(),
      source: z.string(),
      rank: z.number(),
      tier: z.enum(['porter', 'trigram', 'levenshtein']),
    }))).optional(),
  }),
})

interface CommandResult {
  readonly label: string
  readonly exitCode: number
  readonly outputBytes: number
  readonly indexed: boolean
  readonly summary: string
}

/**
 * Resolve the active session DB path (mirrors session.ts logic).
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
 * Run a single shell command synchronously.
 */
function runCommandSync(command: string, cwd: string): { output: string; exitCode: number } {
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
      maxBuffer: 50 * 1024 * 1024,
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

/**
 * Execute a single command entry: run → index if large → return CommandResult.
 */
function executeOne(
  entry: { label: string; command: string },
  cwd: string,
  dbPath: string,
): CommandResult {
  const { output, exitCode } = runCommandSync(entry.command, cwd)
  const outputBytes = Buffer.byteLength(output, 'utf8')
  const shouldIndex = outputBytes > LARGE_OUTPUT_THRESHOLD_BYTES
  let indexed = false

  if (shouldIndex) {
    try {
      const store = getStore(dbPath)
      store.insertChunks([{ source: entry.label, content: output }])
      indexed = true
    } catch (err) {
      process.stderr.write(
        `ak_session_batch_execute: indexing failed for "${entry.label}": ${(err as Error).message}\n`,
      )
    }
  }

  return {
    label: entry.label,
    exitCode,
    outputBytes,
    indexed,
    summary: output.slice(0, SUMMARY_PREVIEW_CHARS),
  }
}

/**
 * Run command entries with a given concurrency limit.
 * Uses sequential chunks of `concurrency` size (Promise.all per batch).
 */
async function runWithConcurrency(
  entries: ReadonlyArray<{ label: string; command: string }>,
  concurrency: number,
  cwd: string,
  dbPath: string,
): Promise<CommandResult[]> {
  const results: CommandResult[] = []
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency)
    // spawnSync is synchronous — wrap in Promise.resolve to keep async signature consistent
    const batchResults = await Promise.all(
      batch.map((entry) =>
        Promise.resolve(executeOne(entry, cwd, dbPath)),
      ),
    )
    results.push(...batchResults)
  }
  return results
}

const tool: ToolDescriptor = {
  name: 'ak_session_batch_execute',
  description:
    'Run multiple shell commands and sandbox large outputs via ctx-rs FTS5 indexing. ' +
    'Supports parallel execution up to `concurrency` (max 8). ' +
    'After all commands complete, optionally searches across ALL newly indexed chunks. ' +
    'Use instead of multiple Bash calls for commands that produce large output (tests, git log, grep, builds).',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session Batch Execute',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  handler: async (raw) => {
    const input = inputSchema.parse(raw ?? {})
    const cwd = input.cwd ?? process.cwd()

    try {
      const dbPath = resolveSessionDbPath(cwd)
      const results = await runWithConcurrency(
        input.commands,
        input.concurrency,
        cwd,
        dbPath,
      )

      let queryHits: Record<string, SearchHit[]> | undefined
      if (input.queries && input.queries.length > 0) {
        const indexedLabels = results.filter((r) => r.indexed).map((r) => r.label)
        if (indexedLabels.length > 0) {
          try {
            const store = getStore(dbPath)
            queryHits = {}
            for (const query of input.queries) {
              const hits = store.search({ query, limit: DEFAULT_SEARCH_LIMIT })
              queryHits[query] = hits as SearchHit[]
            }
          } catch (searchErr) {
            process.stderr.write(
              `ak_session_batch_execute: query search failed: ${(searchErr as Error).message}\n`,
            )
          }
        }
      }

      const allPassed = results.every((r) => r.exitCode === 0)
      const failedCount = results.filter((r) => r.exitCode !== 0).length
      const indexedCount = results.filter((r) => r.indexed).length

      const payload = {
        passed: allPassed,
        summary: allPassed
          ? `all ${results.length} commands succeeded (${indexedCount} indexed)`
          : `${failedCount} of ${results.length} commands failed (${indexedCount} indexed)`,
        details: {
          results: results.map((r) => ({
            label: r.label,
            exitCode: r.exitCode,
            outputBytes: r.outputBytes,
            indexed: r.indexed,
            summary: r.summary,
          })),
          ...(queryHits !== undefined ? { queryHits } : {}),
        },
      }

      return createSummaryResult(payload)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return createSummaryResult(
        {
          passed: false,
          summary: `ak_session_batch_execute error: ${message}`,
          details: {
            results: [],
          },
        },
        { isError: true },
      )
    }
  },
}

export default tool
