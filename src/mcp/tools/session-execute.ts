/**
 * `ak_session_execute` MCP tool.
 *
 * Runs a shell command, captures full stdout+stderr into session memory FTS5
 * (when output exceeds 2KB), and returns a compact summary. This is the primary
 * replacement for `ctx_execute` in the lane-2 output-sandboxing model.
 *
 * Output sandboxing: full output never returns to Claude — only the first 500
 * chars (summary) + optional search hits. Claude can retrieve any part later
 * via `ak_session_search` or the `query` parameter.
 *
 * Auto-discovered by `src/mcp/server.ts` — no manual registration needed.
 */
import { execa } from 'execa'

import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { getStore } from '#session-memory/store'
import { computeRepoHash } from '#session-memory/repo-hash'
import { resolveDbPath } from '#session-memory/session'
import { splitIntoChunks } from '#session-memory/fetch-index'

const LARGE_OUTPUT_THRESHOLD = 2 * 1024 // 2KB
const SUMMARY_LENGTH = 500
const COMMAND_TIMEOUT_MS = 5 * 60 * 1_000 // 5 minutes

const inputSchema = z.object({
  command: z.string().min(1).describe('Shell command to execute'),
  label: z.string().optional().describe('Label for indexing (defaults to the command string)'),
  query: z.string().optional().describe('If provided, search the indexed output for this query and return top hits'),
  cwd: z.string().optional().describe('Working directory (defaults to CLAUDE_PROJECT_DIR or cwd)'),
})

export type AkSessionExecuteInput = z.infer<typeof inputSchema>

const hitSchema = z.object({
  content: z.string(),
  source: z.string(),
  tier: z.enum(['porter', 'trigram', 'levenshtein']),
  rank: z.number(),
})

const outputSchema = z.object({
  label: z.string(),
  exitCode: z.number(),
  outputBytes: z.number(),
  indexed: z.boolean(),
  summary: z.string(),
  hits: z.array(hitSchema).optional(),
  error: z.string().optional(),
})

const tool: ToolDescriptor = {
  name: 'ak_session_execute',
  description:
    'Run a shell command and capture full output into session memory FTS5. Returns a compact summary (first 500 chars) and optional search hits. Use instead of raw Bash for any command that may produce more than 2KB of output (tests, git log, grep, build, lint). Output is indexed and searchable later via ak_session_search.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session Execute',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async handler(rawInput) {
    const input = inputSchema.parse(rawInput)
    const workDir = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
    const label = input.label ?? input.command

    // Accumulated output for streaming sandbox
    let fullOutput = ''
    let exitCode = 0

    try {
      const subprocess = execa(input.command, {
        shell: true,
        cwd: workDir,
        all: true,
        reject: false,
        env: process.env as Record<string, string>,
        timeout: COMMAND_TIMEOUT_MS,
      })

      // Collect all output — streaming avoids a single large buffer allocation
      // because execa reads in chunks internally; we concat here for indexing.
      if (subprocess.all) {
        for await (const chunk of subprocess.all) {
          fullOutput += typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
        }
      }

      const result = await subprocess
      exitCode = result.exitCode ?? -1
    } catch (err) {
      const errorMsg = (err as Error).message
      const payload = {
        label,
        exitCode: -1,
        outputBytes: 0,
        indexed: false,
        summary: '',
        error: errorMsg,
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    }

    const outputBytes = Buffer.byteLength(fullOutput, 'utf-8')
    const summary = fullOutput.slice(0, SUMMARY_LENGTH)
    let indexed = false
    let hits: Array<{ content: string; source: string; tier: 'porter' | 'trigram' | 'levenshtein'; rank: number }> | undefined

    if (outputBytes > LARGE_OUTPUT_THRESHOLD) {
      try {
        const repoHash = computeRepoHash(workDir)
        const dbPath = resolveDbPath(repoHash)
        const store = getStore(dbPath)
        const chunks = splitIntoChunks(fullOutput)
        store.insertChunks(chunks.map((content) => ({ content, source: label })))
        indexed = true

        if (input.query) {
          const searchHits = store.search({ query: input.query, limit: 10, source: label })
          hits = searchHits.map((h) => ({
            content: h.content,
            source: h.source,
            tier: h.tier,
            rank: h.rank,
          }))
        }
      } catch (err) {
        // Indexing failure is non-fatal — still return the summary
        process.stderr.write(
          `ak_session_execute: index error: ${(err as Error).message}\n`,
        )
      }
    }

    const payload = {
      label,
      exitCode,
      outputBytes,
      indexed,
      summary,
      ...(hits !== undefined ? { hits } : {}),
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    }
  },
}

export default tool
