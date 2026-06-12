import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CtxRsBinding {
  index: (dbPath: string, source: string, content: string, replace: boolean) => void
  search: (
    dbPath: string,
    query: string,
    limit: number,
    source: string | null,
  ) => Array<{ content: string; source: string; rank: number }>
  captureEvent: (
    dbPath: string,
    sessionId: string,
    eventId: string,
    toolName: string,
    content: string,
  ) => void
  flushEvents: () => number
  snapshot: (
    dbPath: string,
    agentId: string,
    maxMs: number,
  ) => {
    snapshot_id?: string
    snapshotId?: string
    event_count?: number
    eventCount?: number
    complete: boolean
  }
  restore: (
    dbPath: string,
    agentId: string,
    query: string,
    limit: number,
  ) => Array<{
    session_id?: string
    sessionId?: string
    event_id?: string
    eventId?: string
    ts: number
    tool_name?: string
    toolName?: string
    content: string
  }>
  fetchAndIndex: (
    dbPath: string,
    url: string,
  ) => Promise<{ url: string; chunkCount: number; sourceLabel: string }>
  executeSandboxed: (
    dbPath: string,
    command: string,
    label: string,
  ) => Promise<{ exitCode: number; outputBytes: number; indexed: boolean; summary: string }>
}

interface TargetSpec {
  readonly id: string
  readonly cargoTarget: string
  readonly artifactFile: string
}

const TARGETS: Record<string, TargetSpec> = {
  'darwin-arm64': {
    id: 'darwin-arm64',
    cargoTarget: 'aarch64-apple-darwin',
    artifactFile: 'libctx_rs_napi.dylib',
  },
  'darwin-x64': {
    id: 'darwin-x64',
    cargoTarget: 'x86_64-apple-darwin',
    artifactFile: 'libctx_rs_napi.dylib',
  },
  'linux-arm64-gnu': {
    id: 'linux-arm64-gnu',
    cargoTarget: 'aarch64-unknown-linux-gnu',
    artifactFile: 'libctx_rs_napi.so',
  },
  'linux-x64-gnu': {
    id: 'linux-x64-gnu',
    cargoTarget: 'x86_64-unknown-linux-gnu',
    artifactFile: 'libctx_rs_napi.so',
  },
  'linux-arm64-musl': {
    id: 'linux-arm64-musl',
    cargoTarget: 'aarch64-unknown-linux-musl',
    artifactFile: 'libctx_rs_napi.so',
  },
  'linux-x64-musl': {
    id: 'linux-x64-musl',
    cargoTarget: 'x86_64-unknown-linux-musl',
    artifactFile: 'libctx_rs_napi.so',
  },
  'win32-arm64-msvc': {
    id: 'win32-arm64-msvc',
    cargoTarget: 'aarch64-pc-windows-msvc',
    artifactFile: 'ctx_rs_napi.dll',
  },
  'win32-x64-msvc': {
    id: 'win32-x64-msvc',
    cargoTarget: 'x86_64-pc-windows-msvc',
    artifactFile: 'ctx_rs_napi.dll',
  },
}

let nativeBinding: CtxRsBinding | null = null
const requireFn = createRequire(import.meta.url)

function resolvePackageRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url))
  while (true) {
    if (existsSync(join(current, 'package.json'))) return current
    const parent = dirname(current)
    if (parent === current) {
      throw new Error(`Could not find agent-kit package root from ${import.meta.url}`)
    }
    current = parent
  }
}

function readPackageVersion(packageRoot: string): string {
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    version: string
  }
  return pkg.version
}

function isMusl(): boolean {
  if (process.platform !== 'linux') return false
  try {
    const result = spawnSync('ldd', ['--version'], { encoding: 'utf8' })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    return output.includes('musl')
  } catch {
    return false
  }
}

function resolveCurrentTarget(): TargetSpec {
  const key =
    process.platform === 'linux'
      ? `linux-${process.arch}-${isMusl() ? 'musl' : 'gnu'}`
      : process.platform === 'darwin'
        ? `darwin-${process.arch}`
        : process.platform === 'win32'
          ? `win32-${process.arch}-msvc`
          : ''
  const target = TARGETS[key]
  if (!target) {
    throw new Error(`ctx-rs runtime is unsupported on ${process.platform}/${process.arch}`)
  }
  return target
}

function runtimeCacheDir(packageVersion: string, target: TargetSpec): string {
  return join(homedir(), '.webpresso', 'ctx-rs-runtime', packageVersion, target.id)
}

function runtimeCacheBinary(packageVersion: string, target: TargetSpec): string {
  return join(runtimeCacheDir(packageVersion, target), 'ctx_rs_napi.node')
}

function ensureNativeBinary(): string {
  const packageRoot = resolvePackageRoot()
  const target = resolveCurrentTarget()
  const version = readPackageVersion(packageRoot)
  const cacheBinary = runtimeCacheBinary(version, target)
  if (existsSync(cacheBinary)) return cacheBinary

  const vendorRoot = join(packageRoot, 'vendor', 'ctx-rs')
  const targetDir = join(runtimeCacheDir(version, target), 'target')
  mkdirSync(dirname(cacheBinary), { recursive: true })
  mkdirSync(targetDir, { recursive: true })

  const build = spawnSync(
    'cargo',
    [
      'build',
      '--release',
      '--manifest-path',
      join(vendorRoot, 'Cargo.toml'),
      '-p',
      'ctx-rs-napi',
      '--target',
      target.cargoTarget,
    ],
    {
      cwd: vendorRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        CARGO_TARGET_DIR: targetDir,
      },
    },
  )

  if (build.status !== 0) {
    const output = `${build.stdout ?? ''}${build.stderr ?? ''}`.trim().slice(-4000)
    throw new Error(
      `ctx-rs vendor build failed for ${target.cargoTarget} (exit ${build.status ?? 1})${output ? `\n${output}` : ''}`,
    )
  }

  const builtArtifact = join(targetDir, target.cargoTarget, 'release', target.artifactFile)
  if (!existsSync(builtArtifact)) {
    throw new Error(`ctx-rs vendor build succeeded but artifact is missing: ${builtArtifact}`)
  }

  copyFileSync(builtArtifact, cacheBinary)
  return cacheBinary
}

export function loadNativeBinding(): CtxRsBinding | null {
  if (nativeBinding !== null) return nativeBinding
  const binaryPath = ensureNativeBinary()
  nativeBinding = requireFn(binaryPath) as CtxRsBinding
  return nativeBinding
}
