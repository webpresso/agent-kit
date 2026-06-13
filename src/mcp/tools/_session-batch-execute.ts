import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import { resolveSessionRepoHash } from '#session-memory/repo-hash'
import { loadNativeSessionMemoryEngine } from '#session-memory/native-runtime'
import { getStore } from '#session-memory/store'
import type { SearchHit } from '#session-memory/types'

const DEFAULT_SEARCH_LIMIT = 10
const MAX_CONCURRENCY = 8
const DEFAULT_TIMEOUT_MS = 30_000

function resolveSessionDbPath(cwd?: string): string {
  const repoHash = resolveSessionRepoHash(cwd)
  const dbDir = join(homedir(), '.webpresso', 'sessions')
  mkdirSync(dbDir, { recursive: true })
  return join(dbDir, `${repoHash}.db`)
}

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

function rankHits(hits: readonly SearchHit[]): SearchHit[] {
  return [...hits].sort((left, right) => left.rank - right.rank)
}

function searchIndexedLabels(
  store: ReturnType<typeof getStore>,
  labels: readonly string[],
  query: string,
): SearchHit[] {
  const merged = labels.flatMap(
    (label) => store.search({ query, limit: DEFAULT_SEARCH_LIMIT, source: label }) as SearchHit[],
  )
  const deduped = new Map<string, SearchHit>()
  for (const hit of rankHits(merged)) {
    const key = `${hit.source}\u0000${hit.content}`
    if (!deduped.has(key)) deduped.set(key, hit)
  }
  return rankHits([...deduped.values()]).slice(0, DEFAULT_SEARCH_LIMIT)
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
    'Run multiple shell commands and sandbox large outputs through the built-in native session-memory engine, then optionally search the indexed results.',
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
    const effectiveCwd = input.cwd ?? process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()
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
      const dbPath = resolveSessionDbPath(effectiveCwd)
      mkdirSync(dirname(dbPath), { recursive: true })
      const runtime = loadNativeSessionMemoryEngine()
      const results = await mapWithConcurrency(
        input.commands,
        input.concurrency,
        async ({ label, command }) => {
          const result = await runtime.executeSandboxed(
            dbPath,
            command,
            label,
            input.timeoutMs,
            effectiveCwd,
          )
          return {
            label,
            exitCode: result.exitCode,
            outputBytes: result.outputBytes,
            indexed: result.indexed,
            summary: result.summary,
          }
        },
      )

      let queryHits: Record<string, SearchHit[]> | undefined
      if (input.queries && input.queries.length > 0) {
        const store = getStore(dbPath)
        const indexedLabels = results
          .filter((result) => result.indexed)
          .map((result) => result.label)
        if (indexedLabels.length > 0) {
          queryHits = Object.fromEntries(
            input.queries.map((query) => [query, searchIndexedLabels(store, indexedLabels, query)]),
          )
        }
      }

      const failedCount = results.filter((result) => result.exitCode !== 0).length
      return createSummaryResult(
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
