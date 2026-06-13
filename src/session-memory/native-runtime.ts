import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import envPaths from 'env-paths'

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

export interface NativeSearchHit {
  readonly content: string
  readonly source: string
  readonly rank: number
  readonly tier: 'porter' | 'trigram' | 'levenshtein' | string
}

export interface NativeSnapshotResult {
  readonly snapshotId: string
  readonly eventCount: number
  readonly complete: boolean
}

export interface NativeSessionEvent {
  readonly sessionId: string
  readonly eventId: string
  readonly ts: number
  readonly toolName: string
  readonly content: string
}

export interface NativeExecuteResult {
  readonly exitCode: number
  readonly outputBytes: number
  readonly indexed: boolean
  readonly summary: string
}

export interface NativeSessionMemoryModule {
  readonly index: (dbPath: string, sourceLabel: string, payload: string, isHtml?: boolean) => number
  readonly search: (
    dbPath: string,
    query: string,
    limit: number,
    sourceFilter?: string | null,
  ) => NativeSearchHit[]
  readonly captureEvent: (
    dbPath: string,
    repoHash: string,
    sessionId: string,
    eventId: string,
    toolName: string,
    content: string,
  ) => void
  readonly flushEvents: () => number
  readonly flushEventsForDb?: (dbPath: string) => number
  readonly snapshot: (
    dbPath: string,
    repoHash: string,
    agentId: string,
    maxMs: number,
  ) => NativeSnapshotResult
  readonly restore: (
    dbPath: string,
    repoHash: string,
    agentId: string,
    query: string,
    limit: number,
  ) => NativeSessionEvent[]
  readonly executeSandboxed: (
    dbPath: string,
    command: string,
    label: string,
    timeoutMs: number,
    cwd?: string | null,
  ) => Promise<NativeExecuteResult>
}

const requireFromHere = createRequire(import.meta.url)
const NATIVE_WORKSPACE_DIRNAME = join('native', 'session-memory-engine')
const BUILD_PACKAGE = 'session-memory-napi'
const MODULE_BASENAME = 'session_memory_napi'

let cachedModule: NativeSessionMemoryModule | null = null

function resolvePackageRoot(): string {
  let cursor = resolve(dirname(fileURLToPath(import.meta.url)))
  while (true) {
    const packageJsonPath = join(cursor, 'package.json')
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string }
        if (pkg.name === '@webpresso/agent-kit') return cursor
      } catch {
        // keep walking
      }
    }
    const parent = dirname(cursor)
    if (parent === cursor) {
      throw new Error(
        'native session-memory engine could not locate the @webpresso/agent-kit package root',
      )
    }
    cursor = parent
  }
}

function sessionMemoryNativeCacheRoot(): string {
  const cacheDir = envPaths('webpresso-agent-kit').cache
  const root = join(cacheDir, 'session-memory-engine')
  mkdirSync(root, { recursive: true })
  return root
}

function buildWorkspaceRoot(): string {
  return join(resolvePackageRoot(), NATIVE_WORKSPACE_DIRNAME)
}

function buildManifestPath(): string {
  return join(buildWorkspaceRoot(), 'Cargo.toml')
}

function platformLibraryName(): string {
  switch (process.platform) {
    case 'darwin':
      return `lib${MODULE_BASENAME}.dylib`
    case 'linux':
      return `lib${MODULE_BASENAME}.so`
    case 'win32':
      return `${MODULE_BASENAME}.dll`
    default:
      throw new Error(`native session-memory engine does not support platform ${process.platform}`)
  }
}

function compiledNodePath(): string {
  const cacheRoot = sessionMemoryNativeCacheRoot()
  const packageRoot = resolvePackageRoot()
  const workspaceRoot = buildWorkspaceRoot()
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    version?: string
  }
  const cargoLock = readFileSync(join(workspaceRoot, 'Cargo.lock'), 'utf8')
  const fingerprint = createHash('sha256')
    .update(packageRoot)
    .update('\n')
    .update(workspaceRoot)
    .update('\n')
    .update(packageJson.version ?? '0')
    .update('\n')
    .update(cargoLock)
    .digest('hex')
    .slice(0, 16)
  const buildIdentity = `${packageJson.version ?? '0'}-${fingerprint}`
  return join(
    cacheRoot,
    `${MODULE_BASENAME}.${buildIdentity}.${process.platform}-${process.arch}.node`,
  )
}

function cargoTargetDir(): string {
  return join(sessionMemoryNativeCacheRoot(), 'cargo-target')
}

function newestNativeWorkspaceMtimeMs(nativeWorkspaceRoot: string): number {
  let newest = 0
  const stack = [nativeWorkspaceRoot]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'target' || entry.name === '.git') continue
      const entryPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(entryPath)
      } else {
        newest = Math.max(newest, statSync(entryPath).mtimeMs)
      }
    }
  }
  return newest
}

function shouldRebuild(nodePath: string, nativeWorkspaceRoot: string): boolean {
  if (!existsSync(nodePath)) return true
  const builtAt = statSync(nodePath).mtimeMs
  return newestNativeWorkspaceMtimeMs(nativeWorkspaceRoot) > builtAt
}

function ensureNativeModuleBuilt(): string {
  const workspaceRoot = buildWorkspaceRoot()
  const manifestPath = buildManifestPath()
  const nodePath = compiledNodePath()
  if (!shouldRebuild(nodePath, workspaceRoot)) return nodePath

  const targetDir = cargoTargetDir()
  mkdirSync(targetDir, { recursive: true })

  try {
    execFileSync(
      process.env['CARGO'] || 'cargo',
      [
        'build',
        '--manifest-path',
        manifestPath,
        '--package',
        BUILD_PACKAGE,
        '--release',
        '--locked',
      ],
      {
        cwd: workspaceRoot,
        stdio: 'pipe',
        encoding: 'utf8',
        env: {
          ...process.env,
          CARGO_TARGET_DIR: targetDir,
          TMPDIR: process.env['TMPDIR'] || tmpdir(),
        },
      },
    )
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string }
    const detail = [failure.message, failure.stdout, failure.stderr].filter(Boolean).join('\n')
    throw new Error(
      `native session-memory engine build failed. Expected cargo to build ${BUILD_PACKAGE} from ${manifestPath}. ${detail}`,
    )
  }

  const builtLibraryPath = join(targetDir, 'release', platformLibraryName())
  if (!existsSync(builtLibraryPath)) {
    throw new Error(
      `native session-memory engine build completed but did not produce ${builtLibraryPath}`,
    )
  }

  mkdirSync(dirname(nodePath), { recursive: true })
  copyFileSync(builtLibraryPath, nodePath)
  return nodePath
}

export function loadNativeSessionMemoryEngine(): NativeSessionMemoryModule {
  if (cachedModule !== null) return cachedModule
  const nodePath = ensureNativeModuleBuilt()
  const loaded = requireFromHere(nodePath) as unknown
  const loadedRecord =
    typeof loaded === 'object' && loaded !== null ? (loaded as Record<string, unknown>) : null
  const defaultRecord =
    loadedRecord !== null &&
    typeof loadedRecord['default'] === 'object' &&
    loadedRecord['default'] !== null
      ? (loadedRecord['default'] as Record<string, unknown>)
      : null
  const candidate = (
    loadedRecord !== null && typeof loadedRecord['index'] === 'function'
      ? loadedRecord
      : defaultRecord !== null && typeof defaultRecord['index'] === 'function'
        ? defaultRecord
        : null
  ) as Partial<NativeSessionMemoryModule> | null

  const requiredKeys = [
    'index',
    'search',
    'captureEvent',
    'flushEvents',
    'snapshot',
    'restore',
    'executeSandboxed',
  ] as const
  if (candidate === null || requiredKeys.some((key) => typeof candidate[key] !== 'function')) {
    throw new Error(
      `native session-memory engine loaded from ${nodePath} but did not expose the expected API`,
    )
  }
  cachedModule = candidate as NativeSessionMemoryModule
  return cachedModule
}

export function resetNativeSessionMemoryEngineForTests(): void {
  cachedModule = null
}
