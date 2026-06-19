import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import envPaths from 'env-paths'
import lockfile from 'proper-lockfile'

import {
  SESSION_MEMORY_NATIVE_ADDON_FILENAME,
  resolveSessionMemoryNativeTarget,
} from './native-targets.js'

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
  readonly truncated?: boolean
  readonly capturedBytes?: number
  readonly maxCaptureBytes?: number
  readonly timedOut?: boolean
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
const BUILD_LOCK_STALE_MS = 10 * 60 * 1000
const BUILD_LOCK_WAIT_MS = 10 * 60 * 1000
const BUILD_LOCK_POLL_MS = 250

let cachedModule: NativeSessionMemoryModule | null = null

export class NativeSessionMemoryUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NativeSessionMemoryUnavailableError'
  }
}

export class NativeSessionMemoryLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NativeSessionMemoryLoadError'
  }
}

export function resetNativeSessionMemoryEngineForTests(): void {
  cachedModule = null
}

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

function optionalNativePackageCandidate(): string | null {
  const target = resolveSessionMemoryNativeTarget()
  if (!target) return null
  try {
    return requireFromHere.resolve(`${target.packageName}/${SESSION_MEMORY_NATIVE_ADDON_FILENAME}`)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return null
    throw error
  }
}

function packagedNativeCandidates(): string[] {
  const packageRoot = resolvePackageRoot()
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const platformArch = `${process.platform}-${process.arch}`
  return [
    optionalNativePackageCandidate(),
    join(moduleDir, `${MODULE_BASENAME}.${platformArch}.node`),
    join(moduleDir, `${MODULE_BASENAME}.node`),
    join(packageRoot, 'prebuilds', platformArch, `${MODULE_BASENAME}.node`),
    join(packageRoot, 'native', 'prebuilds', platformArch, `${MODULE_BASENAME}.node`),
  ].filter((candidate): candidate is string => typeof candidate === 'string')
}

function resolvePrebuiltNativeModulePath(): string | null {
  const explicitPath = process.env['WP_NATIVE_SESSION_MEMORY_PATH']
  if (explicitPath) return existsSync(explicitPath) ? explicitPath : null
  for (const candidate of packagedNativeCandidates()) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function isRepoCheckout(): boolean {
  const packageRoot = resolvePackageRoot()
  return existsSync(join(packageRoot, '.git')) && existsSync(buildManifestPath())
}

function nativeBuildFromSourceEnabled(): boolean {
  return process.env['WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE'] === '1'
}

function describePrebuiltLookup(): string {
  const explicitPath = process.env['WP_NATIVE_SESSION_MEMORY_PATH']
  const candidates = explicitPath ? [explicitPath] : packagedNativeCandidates()
  return candidates.map((candidate) => `- ${candidate}`).join('\n')
}

function resolveNativeModulePath(): string {
  const prebuiltPath = resolvePrebuiltNativeModulePath()
  if (prebuiltPath !== null) return prebuiltPath

  if (!nativeBuildFromSourceEnabled()) {
    throw new NativeSessionMemoryUnavailableError(
      `native session-memory engine unavailable: no prebuilt addon found for ${process.platform}-${process.arch}. ` +
        `First-use cargo builds are disabled; set WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE=1 in an agent-kit repo checkout to build from source. Searched:\n${describePrebuiltLookup()}`,
    )
  }
  if (!isRepoCheckout()) {
    throw new NativeSessionMemoryUnavailableError(
      'native session-memory engine unavailable: WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE=1 was set, but this installation is not an agent-kit repo checkout with native sources',
    )
  }
  return ensureNativeModuleBuilt()
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

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function acquireNativeBuildLock(lockTarget: string): () => void {
  const started = Date.now()

  while (true) {
    try {
      return lockfile.lockSync(lockTarget, {
        realpath: false,
        stale: BUILD_LOCK_STALE_MS,
        update: 30_000,
      })
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== 'ELOCKED') throw error
      if (Date.now() - started > BUILD_LOCK_WAIT_MS) {
        throw new Error(`Timed out waiting for native session-memory build lock at ${lockTarget}`)
      }
      sleepSync(BUILD_LOCK_POLL_MS)
    }
  }
}

function withNativeBuildLock<T>(cacheRoot: string, build: () => T): T {
  const lockTarget = join(cacheRoot, '.build.lock')
  const release = acquireNativeBuildLock(lockTarget)
  try {
    return build()
  } finally {
    release()
  }
}

function ensureNativeModuleBuilt(): string {
  const workspaceRoot = buildWorkspaceRoot()
  const manifestPath = buildManifestPath()
  const nodePath = compiledNodePath()
  if (!shouldRebuild(nodePath, workspaceRoot)) return nodePath

  return withNativeBuildLock(sessionMemoryNativeCacheRoot(), () => {
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
  })
}

export function loadNativeSessionMemoryEngine(): NativeSessionMemoryModule {
  if (cachedModule !== null) return cachedModule
  const nodePath = resolveNativeModulePath()
  let loaded: unknown
  try {
    loaded = requireFromHere(nodePath)
  } catch (error) {
    throw new NativeSessionMemoryLoadError(
      `native session-memory engine failed to load from ${nodePath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
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
    throw new NativeSessionMemoryLoadError(
      `native session-memory engine loaded from ${nodePath} but did not expose the expected API`,
    )
  }
  cachedModule = candidate as NativeSessionMemoryModule
  return cachedModule
}
