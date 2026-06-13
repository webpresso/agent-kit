import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'

import { SessionMemoryStore } from './store.js'
import { NATIVE_FILE_OPERATIONS } from './types.js'
import type {
  NativeFileRuntimeCode,
  NativeFileRuntimeMetadata,
  NativeFileRuntimeResult,
  SessionMemoryChunk,
} from './types.js'

export interface NativeFileOperationOptions {
  readonly repoRoot: string
  readonly path: string
  readonly operation: string
  readonly store: SessionMemoryStore
  readonly maxPreviewBytes?: number
  readonly maxFileBytes?: number
  readonly platform?: NodeJS.Platform | string
}

const DEFAULT_MAX_PREVIEW_BYTES = 4 * 1024
const DEFAULT_MAX_FILE_BYTES = 256 * 1024
const SUPPORTED_PLATFORMS = new Set(['darwin', 'linux', 'win32'])
const ALLOWED_OPERATIONS = new Set<string>(NATIVE_FILE_OPERATIONS)
const SECRET_PATH_PATTERNS = [
  /(^|[/\\])\.env(?:$|[.][^/\\]+$)/iu,
  /(^|[/\\])\.ssh(?:$|[/\\])/iu,
  /(^|[/\\])credentials?(?:$|[./_-])/iu,
  /(^|[/\\])secrets?(?:$|[./_-])/iu,
  /\.(?:pem|key)$/iu,
  /npmrc$/iu,
]

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  if (maxBytes < 0 || byteLength(value) <= maxBytes) return { value, truncated: false }
  let bytes = 0
  let output = ''
  for (const char of value) {
    const charBytes = byteLength(char)
    if (bytes + charBytes > maxBytes) break
    output += char
    bytes += charBytes
  }
  return { value: output, truncated: true }
}

function normalizedLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback
  return Math.trunc(value)
}

function isSecretPath(relativePath: string): boolean {
  return SECRET_PATH_PATTERNS.some((pattern) => pattern.test(relativePath))
}

function deniedPathResult(options: NativeFileOperationOptions): NativeFileRuntimeResult {
  return failure(options, 'denied_path', 'path must be relative and stay inside repo root')
}

function failure(
  options: Pick<NativeFileOperationOptions, 'operation' | 'path'>,
  code: Exclude<NativeFileRuntimeCode, 'ok'>,
  warning: string,
): NativeFileRuntimeResult {
  return {
    passed: false,
    code,
    operation: options.operation,
    path: options.path,
    preview: '',
    previewBytes: 0,
    truncated: false,
    overflowIndexed: false,
    indexedChunkIds: [],
    warnings: [warning],
  }
}

function success(
  options: Pick<NativeFileOperationOptions, 'operation' | 'path'>,
  data: Omit<NativeFileRuntimeResult, 'passed' | 'code' | 'operation' | 'path'>,
): NativeFileRuntimeResult {
  return {
    passed: true,
    code: 'ok',
    operation: options.operation,
    path: options.path,
    ...data,
  }
}

function hasProjectMarker(repoRoot: string): boolean {
  return ['.git', 'pnpm-workspace.yaml', 'package.json'].some((marker) =>
    existsSync(resolve(repoRoot, marker)),
  )
}

function staysInside(root: string, target: string): boolean {
  const relativePath = relative(root, target)
  return Boolean(relativePath) && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

function resolveRepoPath(
  repoRoot: string,
  inputPath: string,
): { relativePath: string; absolutePath: string } | null {
  if (!repoRoot || !isAbsolute(repoRoot) || !hasProjectMarker(repoRoot)) return null
  if (!inputPath || isAbsolute(inputPath) || inputPath.includes('\0')) return null
  const normalizedRoot = resolve(repoRoot)
  const absolutePath = resolve(normalizedRoot, inputPath)
  const relativePath = relative(normalizedRoot, absolutePath)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) return null
  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(`${normalizedRoot}${sep}`))
    return null
  return { relativePath, absolutePath }
}

function isBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8 * 1024))
  return sample.includes(0)
}

function metadataFor(
  text: string,
  sizeBytes: number,
  absolutePath: string,
): NativeFileRuntimeMetadata {
  const withoutTrailingFinalNewline = text.endsWith('\n') ? text.slice(0, -1) : text
  return {
    sizeBytes,
    lineCount:
      withoutTrailingFinalNewline.length === 0 ? 0 : withoutTrailingFinalNewline.split('\n').length,
    extension: extname(absolutePath),
  }
}

function stableChunkId(source: string, text: string): string {
  return createHash('sha256').update(`${source}\n${text}`).digest('hex').slice(0, 24)
}

function indexOverflow(
  options: NativeFileOperationOptions,
  relativePath: string,
  text: string,
): string[] {
  const source = `native-runtime:${relativePath}`
  const chunk: SessionMemoryChunk = {
    id: stableChunkId(source, text),
    source,
    text,
    metadata: { path: relativePath, operation: options.operation, overflow: true },
  }
  options.store.indexChunk(chunk)
  return [chunk.id]
}

export async function runNativeFileOperation(
  options: NativeFileOperationOptions,
): Promise<NativeFileRuntimeResult> {
  if (!ALLOWED_OPERATIONS.has(options.operation)) {
    return failure(
      options,
      'unsupported_operation',
      'operation is not in the allowed local file operation set',
    )
  }

  if (!SUPPORTED_PLATFORMS.has(options.platform ?? process.platform)) {
    return failure(
      options,
      'unsupported_platform',
      'native file runtime is not supported on this platform',
    )
  }

  const resolved = resolveRepoPath(options.repoRoot, options.path)
  if (!resolved) return deniedPathResult(options)
  if (isSecretPath(resolved.relativePath)) {
    return failure(
      options,
      'secret_path',
      'secret-bearing paths are not readable through this tool',
    )
  }

  if (!existsSync(resolved.absolutePath))
    return failure(options, 'not_found', 'file does not exist')

  try {
    const realRoot = realpathSync(resolve(options.repoRoot))
    const realTarget = realpathSync(resolved.absolutePath)
    if (!staysInside(realRoot, realTarget)) return deniedPathResult(options)
  } catch {
    return failure(options, 'read_failed', 'file realpath could not be resolved')
  }

  let stat
  try {
    stat = statSync(resolved.absolutePath)
  } catch {
    return failure(options, 'read_failed', 'file metadata could not be read')
  }
  if (!stat.isFile()) return failure(options, 'not_file', 'path is not a regular file')

  const maxFileBytes = normalizedLimit(options.maxFileBytes, DEFAULT_MAX_FILE_BYTES)
  if (stat.size > maxFileBytes) {
    return failure(options, 'file_too_large', `file exceeds ${maxFileBytes} bytes`)
  }

  let buffer: Buffer
  try {
    buffer = readFileSync(resolved.absolutePath)
  } catch {
    return failure(options, 'read_failed', 'file could not be read')
  }

  if (isBinary(buffer)) return failure(options, 'binary_file', 'binary files are not supported')

  const text = buffer.toString('utf8')
  const metadata = metadataFor(text, stat.size, resolved.absolutePath)
  if (options.operation === 'metadata') {
    return success(options, {
      preview: '',
      previewBytes: 0,
      truncated: false,
      overflowIndexed: false,
      indexedChunkIds: [],
      warnings: [],
      metadata,
    })
  }

  const preview = truncateUtf8(
    text,
    normalizedLimit(options.maxPreviewBytes, DEFAULT_MAX_PREVIEW_BYTES),
  )
  const indexedChunkIds = preview.truncated
    ? indexOverflow(options, resolved.relativePath, text)
    : []
  return success(options, {
    preview: preview.value,
    previewBytes: byteLength(preview.value),
    truncated: preview.truncated,
    overflowIndexed: preview.truncated,
    indexedChunkIds,
    warnings: [],
    metadata,
  })
}
