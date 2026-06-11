/**
 * `ak_session_batch_execute` MCP tool.
 *
 * Runs multiple shell commands (sequentially or in parallel up to concurrency=8),
 * indexes large outputs into session memory FTS5, and optionally searches the
 * newly indexed content for cross-command queries in a single round trip.
 *
 * This is the primary replacement for `ctx_batch_execute`. One call replaces
 * many: run lint + typecheck + tests, index all outputs, search for errors.
 *
 * Auto-discovered by `src/mcp/server.ts` — no manual registration needed.
 */
import { execa } from 'execa'
import PQueue from 'p-queue'

import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { getStore } from '#session-memory/store'
import { computeRepoHash } from '#session-memory/repo-hash'
import { resolveDbPath } from '#session-memory/session'
import { splitIntoChunks } from '#session-memory/fetch-index'

const LARGE_OUTPUT_THRESHOLD = 2 * 1024 // 2KB
const SUMMARY_LENGTH = 500
const MAX_CONCURRENCY = 8
const COMMAND_TIMEOUT_MS = 60_000 // 60s per command in batch

const commandSchema = z.object({
  label: z.string().min(1).describe('Human-readable label for this command (used as FTS5 source key)'),
  command: z.string().min(1).describe('Shell command to execute'),
})

const inputSchema = z.object({
  commands: z.array(commandSchema).min(1).describe('Commands to run (each with a label)'),
  queries: z
    .array(z.string().min(1))
    .optional()
    .describe('After all commands complete, run these search queries across all newly indexed output'),
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(MAX_CONCURRENCY)
    .optional()
    .default(1)
    .describe('Number of commands to run in parallel (max 8; default 1 = sequential)'),
  cwd: z.string().optional().describe('Working directory for all commands (defaults to CLAUDE_PROJECT_DIR or cwd)'),
})

export type AkSessionBatchExecuteInput = z.infer<typeof inputSchema>

const commandResultSchema = z.object({
  label: z.string(),
  exitCode: z.number(),
  outputBytes: z.number(),
  indexed: z.boolean(),
  summary: z.string(),
  error: z.string().optional(),
})

const outputSchema = z.object({
  results: z.array(commandResultSchema),
  queryHits: z.record(z.string(), z.array(z.object({
    content: z.string(),
    source: z.string(),
    tier: z.enum(['porter', 'trigram', 'levenshtein']),
    rank: z.number(),
  }))).optional(),
  totalIndexed: z.number(),
  totalCommands: z.number(),
})

interface CommandResult {
  label: string
  exitCode: number
  outputBytes: number
  indexed: boolean
  summary: string
  error?: string
}

async function runSingleCommand(
  label: string,
  command: string,
  workDir: string,
): Promise<{ output: string; result: CommandResult }> {
  let fullOutput = ''
  let exitCode = 0

  try {
    const subprocess = execa(command, {
      shell: true,
      cwd: workDir,
      all: true,
      reject: false,
      env: process.env as Record<string, string>,
      timeout: COMMAND_TIMEOUT_MS,
    })

    if (subprocess.all) {
      for await (const chunk of subprocess.all) {
        fullOutput += typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
      }
    }

    const result = await subprocess
    exitCode = result.exitCode
  } catch (err) {
    const errorMsg = (err as Error).message
    return {
      output: '',
      result: { label, exitCode: -1, outputBytes: 0, indexed: false, summary: '', error: errorMsg },
    }
  }

  const outputBytes = Buffer.byteLength(fullOutput, 'utf-8')

  return {
    output: fullOutput,
    result: {
      label,
      exitCode,
      outputBytes,
      indexed: false,
      summary: fullOutput.slice(0, SUMMARY_LENGTH),
    },
  }
}

const tool: ToolDescriptor = {
  name: 'ak_session_batch_execute',
  description:
    'Run multiple shell commands, index large outputs into session memory FTS5, and optionally search results in a single round trip. Replaces ctx_batch_execute. Use for parallel test+lint+typecheck, or any workflow that produces large outputs you need to search later.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session Batch Execute',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async handler(rawInput) {
    const input = inputSchema.parse(rawInput)
    const workDir = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
    const concurrency = Math.min(input.concurrency ?? 1, MAX_CONCURRENCY)

    // Determine the store once — shared across all commands in this batch
    const repoHash = computeRepoHash(workDir)
    const dbPath = resolveDbPath(repoHash)

    const results: CommandResult[] = []
    const indexedLabels: string[] = []

    // p-queue handles concurrency + per-task timeout
    const queue = new PQueue({
      concurrency,
      timeout: COMMAND_TIMEOUT_MS,
      throwOnTimeout: false,
    })

    const settled = await Promise.all(
      input.commands.map(({ label, command }) =>
        queue.add(() => runSingleCommand(label, command, workDir))
          .then((r: { output: string; result: CommandResult } | undefined) => {
            if (r != null) return r
            process.stderr.write(`[ak-session-batch] task "${label}" timed out after ${COMMAND_TIMEOUT_MS / 1000}s\n`)
            return { output: '', result: { label, exitCode: -1, outputBytes: 0, indexed: false, summary: '[timeout after 60s]' } }
          })
      )
    )

    // Index large outputs — sequential to avoid WAL contention
    for (const { output, result } of settled) {
      if (output.length > LARGE_OUTPUT_THRESHOLD) {
        try {
          const store = getStore(dbPath)
          const chunks = splitIntoChunks(output)
          store.insertChunks(chunks.map((content) => ({ content, source: result.label })))
          result.indexed = true
          indexedLabels.push(result.label)
        } catch (err) {
          process.stderr.write(
            `ak_session_batch_execute: index error for "${result.label}": ${(err as Error).message}\n`,
          )
        }
      }
      results.push(result)
    }

    // Run cross-command queries if requested and any output was indexed
    let queryHits: Record<string, Array<{ content: string; source: string; tier: 'porter' | 'trigram' | 'levenshtein'; rank: number }>> | undefined
    if (input.queries && input.queries.length > 0 && indexedLabels.length > 0) {
      try {
        const store = getStore(dbPath)
        queryHits = {}
        for (const query of input.queries) {
          const hits = store.search({ query, limit: 10 })
          queryHits[query] = hits.map((h) => ({
            content: h.content,
            source: h.source,
            tier: h.tier,
            rank: h.rank,
          }))
        }
      } catch (err) {
        process.stderr.write(
          `ak_session_batch_execute: query error: ${(err as Error).message}\n`,
        )
      }
    }

    const payload = {
      results,
      totalIndexed: indexedLabels.length,
      totalCommands: input.commands.length,
      ...(queryHits !== undefined ? { queryHits } : {}),
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    }
  },
}

export default tool
