/**
 * `ak_session_execute` MCP tool — output sandboxing for large command output.
 *
 * Replaces `ctx_execute` as the Lane 2 output-sandboxing tool.
 * When a command produces more than 2 KB of output, the content is automatically
 * indexed via the ctx-rs Rust FFI (`executeSandboxed`) and only a compact
 * summary is returned to Claude. Optional `query` triggers an immediate FTS5
 * search over the newly indexed content.
 *
 * v2: execution + indexing live entirely in Rust. This module is a thin napi shim.
 */

import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { getStore } from '#session-memory/store'
import type { SearchHit } from '#session-memory/types'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'

const DEFAULT_SEARCH_LIMIT = 10

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

type CtxRsImporter = () => Promise<Record<string, unknown>>

let ctxRsImporterForTests: CtxRsImporter | null = null

async function tryLoadCtxRs(): Promise<CtxRsModule | null> {
  try {
    const mod = (await (ctxRsImporterForTests?.() ?? import('@webpresso/ctx-rs'))) as Record<
      string,
      unknown
    >
    const candidate = (() => {
      if ('executeSandboxed' in mod && typeof mod.executeSandboxed === 'function') {
        return mod
      }
      if (
        'default' in mod &&
        typeof mod.default === 'object' &&
        mod.default !== null &&
        'executeSandboxed' in mod.default &&
        typeof mod.default.executeSandboxed === 'function'
      ) {
        return mod.default
      }
      return null
    })()
    return candidate as CtxRsModule | null
  } catch (err: unknown) {
    process.stderr.write(
      `ak_session_execute: ctx-rs load failed: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return null
  }
}

export function setCtxRsImporterForTests(importer: CtxRsImporter | null): void {
  ctxRsImporterForTests = importer
}

// ── Session DB path ───────────────────────────────────────────────────────────

function resolveSessionDbPath(): string {
  const repoHash = process.env['CLAUDE_REPO_HASH'] ?? process.env['AK_REPO_HASH'] ?? 'default'
  const dbDir = join(homedir(), '.webpresso', 'sessions')
  mkdirSync(dbDir, { recursive: true })
  return join(dbDir, `${repoHash}.db`)
}

// ── Schema ────────────────────────────────────────────────────────────────────

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

// ── Tool descriptor ───────────────────────────────────────────────────────────

const tool: ToolDescriptor = {
  name: 'ak_session_execute',
  description:
    'Run a shell command and sandbox large output via ctx-rs FTS5 indexing. ' +
    'When output exceeds 2 KB, stores it in the session knowledge-base and returns a compact summary. ' +
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
    const label = input.label ?? input.command

    const ctxRs = await tryLoadCtxRs()

    if (ctxRs === null) {
      return createSummaryResult(
        {
          passed: false,
          summary: 'ak_session_execute: ctx-rs unavailable — run ak setup to install',
          exitCode: -1,
          details: {
            label,
            exitCode: -1,
            outputBytes: 0,
            indexed: false,
            summary: 'ctx-rs prebuilt not available',
          },
        },
        { isError: true },
      )
    }

    try {
      const dbPath = resolveSessionDbPath()

      const result = await ctxRs.executeSandboxed(dbPath, input.command, label)

      let hits: readonly SearchHit[] | undefined
      if (input.query && result.indexed) {
        try {
          const store = getStore(dbPath)
          hits = store.search({ query: input.query, limit: DEFAULT_SEARCH_LIMIT, source: label })
        } catch (searchErr: unknown) {
          process.stderr.write(
            `ak_session_execute: search failed: ${searchErr instanceof Error ? searchErr.message : String(searchErr)}\n`,
          )
        }
      }

      const passed = result.exitCode === 0

      const payload = {
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
