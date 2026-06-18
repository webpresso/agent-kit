import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js'

import { SessionMemoryStore } from '#session-memory/store.js'
import type { SessionMemoryChunk } from '#session-memory/types.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import { createGainSummaryResult } from './_session-gain.js'

const MAX_CHUNKS_PER_CALL = 100
const MAX_CHUNK_BYTES = 64 * 1024
const MAX_METADATA_BYTES = 4 * 1024
const MAX_SOURCE_LENGTH = 240
const MAX_RETURNED_IDS = 100

const chunkSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9:_./-]+$/u)
      .optional(),
    source: z.string().min(1).max(MAX_SOURCE_LENGTH).optional(),
    text: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

const inputSchema = z
  .object({
    cwd: z.string().optional(),
    dbPath: z.string().optional(),
    source: z.string().min(1).max(MAX_SOURCE_LENGTH).optional().default('mcp:direct'),
    chunks: z.array(chunkSchema).min(1).max(MAX_CHUNKS_PER_CALL),
  })
  .strict()

type SessionIndexInput = z.infer<typeof inputSchema>

const outputSchema = createSummaryOutputSchema({
  counts: z.object({
    inputChunks: z.number(),
    indexedChunks: z.number(),
    warningCount: z.number(),
  }),
  details: z.object({
    sources: z.array(z.string()),
    chunkIds: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
}).extend({
  sources: z.array(z.string()),
  chunkIds: z.array(z.string()),
  warnings: z.array(z.string()),
})

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

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

function stableChunkId(source: string, text: string, index: number): string {
  return createHash('sha256').update(`${source}\n${index}\n${text}`).digest('hex').slice(0, 24)
}

function metadataIsBounded(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return true
  try {
    return byteLength(JSON.stringify(metadata)) <= MAX_METADATA_BYTES
  } catch {
    return false
  }
}

function toSessionChunks(input: SessionIndexInput): {
  chunks: SessionMemoryChunk[]
  warnings: string[]
} {
  const chunks: SessionMemoryChunk[] = []
  const warnings: string[] = []
  input.chunks.forEach((chunk, index) => {
    const text = chunk.text.trim()
    if (!text) {
      warnings.push(`chunk[${index}] empty text skipped`)
      return
    }
    if (byteLength(text) > MAX_CHUNK_BYTES) {
      warnings.push(`chunk[${index}] exceeds ${MAX_CHUNK_BYTES} bytes skipped`)
      return
    }
    if (!metadataIsBounded(chunk.metadata)) {
      warnings.push(`chunk[${index}] metadata exceeds ${MAX_METADATA_BYTES} bytes skipped`)
      return
    }
    const source = chunk.source ?? input.source
    chunks.push({
      id: chunk.id ?? stableChunkId(source, text, index),
      source,
      text,
      metadata: { ...chunk.metadata, source, index, ingestion: 'mcp:direct' },
    })
  })
  return { chunks, warnings }
}

function boundedPayload(
  input: SessionIndexInput,
  chunks: readonly SessionMemoryChunk[],
  warnings: readonly string[],
) {
  const sources = [...new Set(chunks.map((chunk) => chunk.source))].sort()
  const chunkIds = chunks.slice(0, MAX_RETURNED_IDS).map((chunk) => chunk.id)
  const passed = chunks.length > 0
  return {
    passed,
    summary: passed
      ? `session index stored ${chunks.length} chunk${chunks.length === 1 ? '' : 's'}`
      : 'session index stored no chunks',
    counts: {
      inputChunks: input.chunks.length,
      indexedChunks: chunks.length,
      warningCount: warnings.length,
    },
    sources,
    chunkIds,
    warnings: [...warnings],
    details: { sources, chunkIds, warnings: [...warnings] },
  }
}

const tool: ToolDescriptor = {
  name: 'wp_session_index',
  description: 'Index caller-provided bounded text chunks into the local session-memory index.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Session index',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw) => {
    const input = inputSchema.parse(raw ?? {})
    const { chunks, warnings } = toSessionChunks(input)
    if (chunks.length === 0) {
      const payload = boundedPayload(input, chunks, warnings)
      return createSummaryResult(payload, { isError: true })
    }
    const dbPath = input.dbPath ?? defaultDbPath(input.cwd)
    const store = new SessionMemoryStore(dbPath)
    try {
      store.indexChunks(chunks)
    } finally {
      store.close()
    }
    return createGainSummaryResult(boundedPayload(input, chunks, warnings), {}, {
      toolName: tool.name,
      dbPath,
      rawBasisBytes: chunks.reduce((sum, chunk) => sum + byteLength(chunk.text), 0),
      rawBytesBasis: 'index_accepted_text',
    })
  },
}

export default tool
