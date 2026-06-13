import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { resolveProjectRoot } from '#mcp/tools/_shared/project-root.js'
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js'

import { runNativeFileOperation } from '#session-memory/native-runtime.js'
import { SessionMemoryStore } from '#session-memory/store.js'
import type { NativeFileRuntimeResult } from '#session-memory/types.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'

const MAX_PREVIEW_BYTES = 4 * 1024
const MAX_FILE_BYTES = 256 * 1024

const inputSchema = z
  .object({
    cwd: z.string().optional(),
    repoRoot: z.string().optional(),
    dbPath: z.string().optional(),
    path: z.string().min(1).max(1024),
    operation: z.string().min(1).max(32).default('read_text'),
    maxPreviewBytes: z
      .number()
      .int()
      .positive()
      .max(MAX_PREVIEW_BYTES)
      .optional()
      .default(MAX_PREVIEW_BYTES),
    maxFileBytes: z
      .number()
      .int()
      .positive()
      .max(MAX_FILE_BYTES)
      .optional()
      .default(MAX_FILE_BYTES),
  })
  .strict()

type SessionExecuteFileInput = z.infer<typeof inputSchema>

const outputSchema = createSummaryOutputSchema({
  counts: z.object({
    previewBytes: z.number(),
    warningCount: z.number(),
    indexedChunkCount: z.number(),
  }),
  details: z.object({
    operation: z.string(),
    path: z.string(),
    preview: z.string(),
    truncated: z.boolean(),
    overflowIndexed: z.boolean(),
    indexedChunkIds: z.array(z.string()),
    warnings: z.array(z.string()),
    metadata: z
      .object({
        sizeBytes: z.number(),
        lineCount: z.number(),
        extension: z.string(),
      })
      .optional(),
  }),
}).extend({
  operation: z.string(),
  path: z.string(),
  preview: z.string(),
  truncated: z.boolean(),
  overflowIndexed: z.boolean(),
  indexedChunkIds: z.array(z.string()),
  warnings: z.array(z.string()),
  code: z.string().optional(),
})

function defaultDbPath(cwd?: string): string {
  if (process.env.WP_SESSION_MEMORY_INDEX_DB) return process.env.WP_SESSION_MEMORY_INDEX_DB
  try {
    return getSurfacePath('session-memory/index.sqlite', 'worktree', cwd)
  } catch (error) {
    if (
      error instanceof NotInGitRepoError ||
      (error as Error | undefined)?.name === 'NotInGitRepoError'
    ) {
      return join(tmpdir(), 'webpresso-session-memory', 'index.sqlite')
    }
    throw error
  }
}

function payloadFrom(result: NativeFileRuntimeResult) {
  const summary = result.passed
    ? result.operation === 'metadata'
      ? `session file metadata derived for ${result.path}`
      : `session file read ${result.previewBytes} preview byte${result.previewBytes === 1 ? '' : 's'} for ${result.path}`
    : `session file operation denied for ${result.path}`
  return {
    passed: result.passed,
    summary,
    operation: result.operation,
    path: result.path,
    preview: result.preview,
    truncated: result.truncated,
    overflowIndexed: result.overflowIndexed,
    indexedChunkIds: result.indexedChunkIds,
    warnings: result.warnings,
    ...(result.passed ? {} : { code: result.code }),
    counts: {
      previewBytes: result.previewBytes,
      warningCount: result.warnings.length,
      indexedChunkCount: result.indexedChunkIds.length,
    },
    details: {
      operation: result.operation,
      path: result.path,
      preview: result.preview,
      truncated: result.truncated,
      overflowIndexed: result.overflowIndexed,
      indexedChunkIds: result.indexedChunkIds,
      warnings: result.warnings,
      ...(result.metadata ? { metadata: result.metadata } : {}),
    },
  }
}

const tool: ToolDescriptor = {
  name: 'wp_session_execute_file',
  description:
    'Run explicit bounded local file read/metadata operations under repo-root validation and index overflow into session memory.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session execute file',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw) => {
    const input: SessionExecuteFileInput = inputSchema.parse(raw ?? {})
    const repoRoot = input.repoRoot ?? resolveProjectRoot(input.cwd ? { cwd: input.cwd } : {})
    const store = new SessionMemoryStore(input.dbPath ?? defaultDbPath(repoRoot))
    try {
      const runtimeResult = await runNativeFileOperation({
        repoRoot,
        path: input.path,
        operation: input.operation,
        store,
        maxPreviewBytes: input.maxPreviewBytes,
        maxFileBytes: input.maxFileBytes,
      })
      return createSummaryResult(
        payloadFrom(runtimeResult),
        runtimeResult.passed ? {} : { isError: true },
      )
    } finally {
      store.close()
    }
  },
}

export default tool
