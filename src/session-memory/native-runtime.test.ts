import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import envPaths from 'env-paths'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFileSyncMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', async (importActual) => ({
  ...(await importActual<typeof import('node:child_process')>()),
  execFileSync: execFileSyncMock,
}))

let tmpDir: string
let previousNativePath: string | undefined
let previousBuildFromSource: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wp-native-runtime-test-'))
  previousNativePath = process.env.WP_NATIVE_SESSION_MEMORY_PATH
  previousBuildFromSource = process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE
  delete process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE
  execFileSyncMock.mockReset()
  vi.resetModules()
})

afterEach(() => {
  if (previousNativePath === undefined) delete process.env.WP_NATIVE_SESSION_MEMORY_PATH
  else process.env.WP_NATIVE_SESSION_MEMORY_PATH = previousNativePath
  if (previousBuildFromSource === undefined) delete process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE
  else process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE = previousBuildFromSource
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('native session-memory runtime availability', () => {
  it('does not run cargo on first use when no prebuilt addon is available', async () => {
    process.env.WP_NATIVE_SESSION_MEMORY_PATH = join(tmpDir, 'missing.node')
    const { loadNativeSessionMemoryEngine, NativeSessionMemoryUnavailableError } = await import(
      './native-runtime.js'
    )

    expect(() => loadNativeSessionMemoryEngine()).toThrow(NativeSessionMemoryUnavailableError)
    expect(() => loadNativeSessionMemoryEngine()).toThrow(/First-use cargo builds are disabled/u)
    expect(execFileSyncMock).not.toHaveBeenCalled()
  })

  it('reports addon load failures separately from missing-prebuilt availability', async () => {
    const invalidAddon = join(tmpDir, 'invalid.node')
    writeFileSync(invalidAddon, 'not a native addon')
    process.env.WP_NATIVE_SESSION_MEMORY_PATH = invalidAddon
    const { loadNativeSessionMemoryEngine, NativeSessionMemoryLoadError } = await import(
      './native-runtime.js'
    )

    expect(() => loadNativeSessionMemoryEngine()).toThrow(NativeSessionMemoryLoadError)
    expect(() => loadNativeSessionMemoryEngine()).toThrow(/failed to load from/u)
    expect(execFileSyncMock).not.toHaveBeenCalled()
  })

  it('does not load cached source-built addons without the explicit source-build flag', async () => {
    delete process.env.WP_NATIVE_SESSION_MEMORY_PATH
    const packageRoot = resolve(import.meta.dirname, '../..')
    const workspaceRoot = join(packageRoot, 'native', 'session-memory-engine')
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
    const cachedAddon = join(
      envPaths('webpresso-agent-kit').cache,
      'session-memory-engine',
      `session_memory_napi.${packageJson.version ?? '0'}-${fingerprint}.${process.platform}-${process.arch}.node`,
    )
    const createdCachedAddon = !existsSync(cachedAddon)
    if (createdCachedAddon) {
      mkdirSync(dirname(cachedAddon), { recursive: true })
      writeFileSync(cachedAddon, 'stale cached source build')
    }

    try {
      const { loadNativeSessionMemoryEngine, NativeSessionMemoryUnavailableError } = await import(
        './native-runtime.js'
      )

      expect(() => loadNativeSessionMemoryEngine()).toThrow(NativeSessionMemoryUnavailableError)
      expect(() => loadNativeSessionMemoryEngine()).not.toThrow(/failed to load from/u)
      expect(execFileSyncMock).not.toHaveBeenCalled()
    } finally {
      if (createdCachedAddon) rmSync(cachedAddon, { force: true })
    }
  })
})
