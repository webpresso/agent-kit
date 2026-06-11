/**
 * `ak_session_batch_execute` MCP tool — parallel output sandboxing for multiple commands.
 *
 * Replaces `ctx_batch_execute` as the Lane 2 batch output-sandboxing tool.
 * Runs multiple commands in parallel up to `concurrency` using p-queue to control
 * JS-side concurrency over the async napi calls. Each command's execution and
 * indexing are handled entirely in Rust via ctx-rs `executeSandboxed`.
 *
 * v2: no execa — execution + indexing happen in the Rust napi binding.
 */

import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import PQueue from 'p-queue'
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { getStore } from '#session-memory/store'
import type { SearchHit } from '#session-memory/types'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'

const DEFAULT_SEARCH_LIMIT = 10
const MAX_CONCURRENCY = 8
const TASK_TIMEOUT_MS = 60_000

// ── ctx-rs napi binding ───────────────────────────────────────────────────────

interface CtxRsExecuteResult {
  readonly exitCode: number
  readonly outputBytes: number
  readonly indexed: boolean
  readonly summary: string
}

interface CtxRsModule {
  readonly executeSandboxed: (
    dbPath: string,
    command: string,
    label: string,
  ) => Promise<CtxRsExecuteResult>
}

function tryLoadCtxRs(): CtxRsModule | null {
  try {
    const requireFn = createRequire(import.meta.url)
    return requireFn('@webpresso/ctx-rs') as CtxRsModule
  } catch {
    return null
  }
}

// ── Session DB path ───────────────────────────────────────────────────────────

function resolveSessionDbPath(): string {
  const repoHash = process.env['CLAUDE_REPO_HASH'] ?? process.env['AK_REPO_HASH'] ?? 'default'
  const dbDir = join(homedir(), '.webpresso', 'sessions')
  mkdirSync(dbDir, { recursive: true })
  return join(dbDir, `${repoHash}.db`)
}

// ── Schema ────────────────────────────────────────────────────────────────────

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

interface CommandResult {
  readonly label: string
  readonly exitCode: number
  readonly outputBytes: number
  readonly indexed: boolean
  readonly summary: string
}

// ── Tool descriptor ───────────────────────────────────────────────────────────

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

    const ctxRs = tryLoadCtxRs()

    if (ctxRs === null) {
      return createSummaryResult(
        {
          passed: false,
          summary: 'ak_session_batch_execute: ctx-rs unavailable — run ak setup to install',
          details: { results: [] },
        },
        { isError: true },
      )
    }

    try {
      const dbPath = resolveSessionDbPath()

      const queue = new PQueue({
        concurrency: Math.min(input.concurrency, MAX_CONCURRENCY),
        timeout: TASK_TIMEOUT_MS,
        throwOnTimeout: false,
      })

      const results: CommandResult[] = await Promise.all(
        input.commands.map(({ label, command }) =>
          queue
            .add(async () => {
              let execResult: CtxRsExecuteResult
              let indexed = false
              try {
                execResult = await ctxRs.executeSandboxed(dbPath, command, label)
                indexed = execResult.indexed
              } catch (execErr) {
                const msg = execErr instanceof Error ? execErr.message : String(execErr)
                process.stderr.write(
                  `ak_session_batch_execute: executeSandboxed failed for "${label}": ${msg}\n`,
                )
                return {
                  label,
                  exitCode: -1,
                  outputBytes: 0,
                  indexed: false,
                  summary: `[execute error] ${msg}`,
                } satisfies CommandResult
              }
              return {
                label,
                exitCode: execResult.exitCode,
                outputBytes: execResult.outputBytes,
                indexed,
                summary: execResult.summary,
              } satisfies CommandResult
            })
            .then((r) => {
              if (r !== null && r !== undefined) return r
              process.stderr.write(
                `ak_session_batch_execute: command "${label}" timed out after ${TASK_TIMEOUT_MS / 1000}s\n`,
              )
              return {
                label,
                exitCode: -1,
                outputBytes: 0,
                indexed: false,
                summary: '[timeout after 60s]',
              } satisfies CommandResult
            }),
        ),
      )

      let queryHits: Record<string, SearchHit[]> | undefined
      if (input.queries && input.queries.length > 0) {
        const indexedLabels = results.filter((r) => r.indexed).map((r) => r.label)
        if (indexedLabels.length > 0) {
          try {
            const store = getStore(dbPath)
            queryHits = {}
            await Promise.all(
              input.queries.map(async (query) => {
                const hits = store.search({ query, limit: DEFAULT_SEARCH_LIMIT })
                queryHits![query] = hits as SearchHit[]
              }),
            )
          } catch (searchErr: unknown) {
            process.stderr.write(
              `ak_session_batch_execute: query search failed: ${searchErr instanceof Error ? searchErr.message : String(searchErr)}\n`,
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
