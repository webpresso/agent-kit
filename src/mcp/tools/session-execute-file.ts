import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { resolveProjectRoot } from '#mcp/tools/_shared/project-root.js'

import { SessionMemoryStore } from '#session-memory/store.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import { createGainSummaryResult } from './_session-gain.js'
import { createSessionElisionRecorder, sessionElisionSchema } from '#mcp/_session-elision.js'
import { defaultIndexDbPath } from './session-restore.js'

const MAX_PREVIEW_BYTES = 4 * 1024
const MAX_FILE_BYTES = 256 * 1024
const SECRET_PATH_PATTERNS = [
  /(^|[/\\])\.env($|[.\-/\\])/u,
  /(^|[/\\])\.ssh($|[/\\])/u,
  /\.pem$/iu,
  /id_rsa$/iu,
  /id_ed25519$/iu,
]
const SUPPORTED_OPERATIONS = new Set(['read_text', 'metadata'])

function readFilePrefix(absolutePath: string, byteLength: number): Buffer {
  const fd = openSync(absolutePath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(byteLength)
    const bytesRead = readSync(fd, buffer, 0, byteLength, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    closeSync(fd)
  }
}

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
type FileResultCode =
  | 'ok'
  | 'denied_path'
  | 'secret_path'
  | 'unsupported_operation'
  | 'not_found'
  | 'not_file'
  | 'binary_file'
  | 'read_failed'

interface FileOperationResult {
  readonly passed: boolean
  readonly code: FileResultCode
  readonly operation: string
  readonly path: string
  readonly preview: string
  readonly previewBytes: number
  readonly truncated: boolean
  readonly overflowIndexed: boolean
  readonly indexedChunkIds: readonly string[]
  readonly elisions: readonly z.infer<typeof sessionElisionSchema>[]
  readonly warnings: readonly string[]
  readonly rawBasisBytes?: number
  readonly metadata?: {
    readonly sizeBytes: number
    readonly lineCount: number
    readonly extension: string
  }
}

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
    elisions: z.array(sessionElisionSchema),
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
  elisions: z.array(sessionElisionSchema),
  warnings: z.array(z.string()),
  code: z.string().optional(),
})

function errorResult(
  input: Pick<SessionExecuteFileInput, 'operation' | 'path'>,
  code: Exclude<FileResultCode, 'ok'>,
  warning: string,
): FileOperationResult {
  return {
    passed: false,
    code,
    operation: input.operation,
    path: input.path,
    preview: '',
    previewBytes: 0,
    truncated: false,
    overflowIndexed: false,
    indexedChunkIds: [],
    elisions: [],
    warnings: [warning],
  }
}

function normalizeRepoPath(
  repoRoot: string,
  path: string,
): { absolute: string; relative: string } | null {
  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) return null
  if (!existsSync(join(repoRoot, 'package.json')) && !existsSync(join(repoRoot, '.git')))
    return null
  if (path.startsWith('/') || path.includes('\0')) return null
  const absolute = resolve(repoRoot, path)
  const relativePath = relative(repoRoot, absolute)
  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    relativePath.split(sep).includes('..')
  ) {
    return null
  }
  if (!existsSync(absolute)) return { absolute, relative: relativePath.replaceAll('\\', '/') }
  const realRoot = realpathSync(repoRoot)
  const realTarget = realpathSync(absolute)
  const realRelative = relative(realRoot, realTarget)
  if (
    realRelative === '' ||
    realRelative.startsWith('..') ||
    realRelative.split(sep).includes('..')
  ) {
    return null
  }
  return { absolute, relative: relativePath.replaceAll('\\', '/') }
}

function isSecretPath(path: string): boolean {
  return SECRET_PATH_PATTERNS.some((pattern) => pattern.test(path))
}

function isBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, Math.min(buffer.length, 8_192)).includes(0)
}

function utf8Preview(buffer: Buffer, maxBytes: number): string {
  return buffer.subarray(0, maxBytes).toString('utf8')
}

function lineCount(text: string): number {
  if (text.length === 0) return 0
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length
}

function fileChunkId(path: string, content: Buffer): string {
  return createHash('sha256').update(path).update('\0').update(content).digest('hex').slice(0, 32)
}

async function runFileOperation(
  input: SessionExecuteFileInput,
  repoRoot: string,
  store: SessionMemoryStore,
  dbPath: string,
): Promise<FileOperationResult> {
  if (!SUPPORTED_OPERATIONS.has(input.operation)) {
    return errorResult(input, 'unsupported_operation', `unsupported operation ${input.operation}`)
  }
  const normalized = normalizeRepoPath(repoRoot, input.path)
  if (!normalized) return errorResult(input, 'denied_path', 'path must stay inside the repo root')
  if (isSecretPath(normalized.relative)) {
    return errorResult(input, 'secret_path', 'secret-bearing paths are blocked')
  }
  if (!existsSync(normalized.absolute)) return errorResult(input, 'not_found', 'file not found')
  const stats = statSync(normalized.absolute)
  if (!stats.isFile()) return errorResult(input, 'not_file', 'path is not a regular file')
  const warnings: string[] = []
  const metadata = {
    sizeBytes: stats.size,
    lineCount: 0,
    extension: extname(normalized.relative),
  }
  const readLimit = Math.min(input.maxFileBytes + 1, MAX_FILE_BYTES + 1)
  let content: Buffer
  try {
    content = readFilePrefix(normalized.absolute, readLimit)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResult(input, 'read_failed', message)
  }
  if (isBinary(content)) return errorResult(input, 'binary_file', 'binary files are not previewed')
  const text = content.toString('utf8')
  metadata.lineCount = lineCount(text)
  if (input.operation === 'metadata') {
    return {
      passed: true,
      code: 'ok',
      operation: input.operation,
      path: normalized.relative,
      preview: '',
      previewBytes: 0,
      truncated: false,
      overflowIndexed: false,
      indexedChunkIds: [],
      elisions: [],
      warnings,
      rawBasisBytes: stats.size,
      metadata,
    }
  }
  if (stats.size > input.maxFileBytes) {
    warnings.push(`file exceeds maxFileBytes=${input.maxFileBytes}; response contains preview only`)
  }
  const preview = utf8Preview(content, input.maxPreviewBytes)
  const previewBytes = Buffer.byteLength(preview, 'utf8')
  const truncated = stats.size > previewBytes
  const indexedChunkIds: string[] = []
  const elisions: z.infer<typeof sessionElisionSchema>[] = []
  if (truncated) {
    const id = `file:${fileChunkId(normalized.relative, content)}`
    store.indexChunk({
      id,
      source: `file:${normalized.relative}`,
      text,
      metadata: { kind: 'session_file_read', path: normalized.relative, sizeBytes: stats.size },
    })
    indexedChunkIds.push(id)
    const recorded = createSessionElisionRecorder({
      cwd: repoRoot,
      sourcePrefix: 'wp_session_execute_file',
      dbPath,
    }).record({
      source: `file:${normalized.relative}`,
      kind: 'file_overflow',
      text,
      returnedText: preview,
      rawBytes: stats.size,
      returnedBytes: previewBytes,
      metadata: { path: normalized.relative, sizeBytes: stats.size },
    })
    if (recorded.elision) elisions.push(recorded.elision)
    if (recorded.warning) warnings.push(recorded.warning)
  }
  return {
    passed: true,
    code: 'ok',
    operation: input.operation,
    path: normalized.relative,
    preview,
    previewBytes,
    truncated,
    overflowIndexed: indexedChunkIds.length > 0,
    indexedChunkIds,
    elisions,
    warnings,
    rawBasisBytes: stats.size,
    metadata,
  }
}

function payloadFrom(result: FileOperationResult) {
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
    indexedChunkIds: [...result.indexedChunkIds],
    elisions: [...result.elisions],
    warnings: [...result.warnings],
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
      indexedChunkIds: [...result.indexedChunkIds],
      elisions: [...result.elisions],
      warnings: [...result.warnings],
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
    const dbPath = input.dbPath ?? defaultIndexDbPath(repoRoot)
    mkdirSync(dirname(dbPath), { recursive: true })
    const store = new SessionMemoryStore(dbPath)
    try {
      const runtimeResult = await runFileOperation(input, repoRoot, store, dbPath)
      const payload = payloadFrom(runtimeResult)
      const resultOptions = runtimeResult.passed ? {} : { isError: true }
      if (runtimeResult.passed && typeof runtimeResult.rawBasisBytes === 'number') {
        return createGainSummaryResult(payload, resultOptions, {
          toolName: tool.name,
          dbPath,
          rawBasisBytes: runtimeResult.rawBasisBytes,
          rawBytesBasis:
            runtimeResult.operation === 'metadata' ? 'file_metadata_buffer' : 'file_read_buffer',
          recordGainEvent: (gain) => store.recordGainEvent({ ...gain, toolName: tool.name }),
        })
      }
      return createSummaryResult(payload, resultOptions)
    } finally {
      store.close()
    }
  },
}

export default tool
