/**
 * Tests for the deferred-install scheduler.
 *
 * - `child_process.spawn` is mocked — we assert call args + detached/unref
 *   semantics without forking a real process.
 * - `getSurfacePath` (Lane A) is mocked to point at per-test tmp dirs.
 * - `logUpdateError` is mocked so we can verify the best-effort sink path.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))
vi.mock('#paths/state-root.js', () => ({
  getSurfacePath: vi.fn(),
}))
vi.mock('./log.js', async () => {
  const actual = await vi.importActual<typeof import('./log.js')>('./log.js')
  return {
    ...actual,
    logUpdateError: vi.fn(),
  }
})

import { spawn } from 'node:child_process'

import { getSurfacePath } from '#paths/state-root.js'

import {
  buildTombstone,
  clearInstallTombstone,
  isProcessAlive,
  isTombstoneActive,
  isTombstoneFresh,
  LOCKOUT_MS,
  scheduleDeferredInstall,
} from './installer.js'
import { logUpdateError } from './log.js'

const spawnMock = vi.mocked(spawn)
const getSurfacePathMock = vi.mocked(getSurfacePath)
const logUpdateErrorMock = vi.mocked(logUpdateError)

let tmpDir: string

interface MockChild {
  unref: ReturnType<typeof vi.fn>
}

function fakeSpawnReturn(): MockChild {
  return { unref: vi.fn() }
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wp-installer-test-'))
  spawnMock.mockReset()
  getSurfacePathMock.mockReset()
  logUpdateErrorMock.mockReset()
  getSurfacePathMock.mockImplementation((name: string, scope: 'repo' | 'worktree' | 'user') => {
    if (scope !== 'user') throw new Error(`unexpected scope ${scope}`)
    return join(tmpDir, name)
  })
  spawnMock.mockReturnValue(fakeSpawnReturn() as unknown as ReturnType<typeof spawn>)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('buildTombstone / isTombstoneFresh', () => {
  it('builds the canonical tombstone shape', () => {
    expect(buildTombstone(1234, 5_678)).toStrictEqual({
      autoInstallInProgress: { pid: 1234, ts: 5_678 },
    })
  })

  it('treats a tombstone within LOCKOUT_MS as fresh', () => {
    const now = 1_000_000
    const tombstone = buildTombstone(1, now - (LOCKOUT_MS - 1))
    expect(isTombstoneFresh(tombstone, now)).toStrictEqual(true)
  })

  it('treats a tombstone at exactly LOCKOUT_MS as stale', () => {
    const now = 1_000_000
    const tombstone = buildTombstone(1, now - LOCKOUT_MS)
    expect(isTombstoneFresh(tombstone, now)).toStrictEqual(false)
  })

  it('treats a tombstone older than LOCKOUT_MS as stale', () => {
    const now = 1_000_000
    const tombstone = buildTombstone(1, now - (LOCKOUT_MS + 1))
    expect(isTombstoneFresh(tombstone, now)).toStrictEqual(false)
  })
})

describe('isProcessAlive', () => {
  it('reports the current process as alive', () => {
    expect(isProcessAlive(process.pid)).toStrictEqual(true)
  })

  it('reports a guaranteed-unused high pid as not alive (ESRCH)', () => {
    // 0x7fffffff exceeds the kernel pid max on the platforms we target, so the
    // existence probe returns ESRCH.
    expect(isProcessAlive(2_147_483_647)).toStrictEqual(false)
  })

  it('treats a non-positive pid as not alive without probing', () => {
    expect(isProcessAlive(0)).toStrictEqual(false)
    expect(isProcessAlive(-1)).toStrictEqual(false)
  })

  it('treats a non-integer pid as not alive without probing', () => {
    expect(isProcessAlive(Number.NaN)).toStrictEqual(false)
    expect(isProcessAlive(1.5)).toStrictEqual(false)
  })
})

describe('isTombstoneActive', () => {
  const now = 1_000_000

  it('is active when the pid is alive AND the tombstone is fresh', () => {
    const tombstone = buildTombstone(42, now - (LOCKOUT_MS - 1))
    expect(isTombstoneActive(tombstone, now, () => true)).toStrictEqual(true)
  })

  it('is NOT active when the pid is dead, even with a fresh timestamp', () => {
    const tombstone = buildTombstone(42, now - (LOCKOUT_MS - 1))
    expect(isTombstoneActive(tombstone, now, () => false)).toStrictEqual(false)
  })

  it('is NOT active when the pid is alive but the tombstone is stale (recycled pid)', () => {
    const tombstone = buildTombstone(42, now - (LOCKOUT_MS + 1))
    expect(isTombstoneActive(tombstone, now, () => true)).toStrictEqual(false)
  })

  it('passes the recorded pid to the liveness probe', () => {
    const probe = vi.fn(() => false)
    const tombstone = buildTombstone(777, now)
    isTombstoneActive(tombstone, now, probe)
    expect(probe).toHaveBeenCalledWith(777)
  })
})

describe('scheduleDeferredInstall — happy path', () => {
  it('writes a tombstone BEFORE spawning the child', () => {
    let tombstoneAtSpawn: string | null = null
    spawnMock.mockImplementation(((_cmd: string, _args: string[]) => {
      // Capture tombstone state at the moment spawn is invoked.
      const configPath = join(tmpDir, 'update-notifier-cache.json')
      tombstoneAtSpawn = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : null
      return fakeSpawnReturn() as unknown as ReturnType<typeof spawn>
    }) as unknown as typeof spawn)

    const result = scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    expect(result.spawned).toStrictEqual(true)
    expect(tombstoneAtSpawn).not.toStrictEqual(null)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const parsed = JSON.parse(tombstoneAtSpawn!) as { autoInstallInProgress?: { pid: number } }
    expect(parsed.autoInstallInProgress?.pid).toStrictEqual(process.pid)
  })

  it('spawns the child detached with unref()', () => {
    const child = fakeSpawnReturn()
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>)

    scheduleDeferredInstall({ command: ['pnpm', 'add', '-g', 'webpresso'] })

    expect(spawnMock).toHaveBeenCalledOnce()
    const [cmd, args, opts] = spawnMock.mock.calls[0]!
    expect(cmd).toStrictEqual('pnpm')
    expect(args).toStrictEqual(['add', '-g', 'webpresso'])
    const spawnOpts = opts as { detached: boolean; windowsHide: boolean }
    expect(spawnOpts.detached).toStrictEqual(true)
    expect(spawnOpts.windowsHide).toStrictEqual(true)
    expect(child.unref).toHaveBeenCalledOnce()
  })

  it('attaches the log file descriptor to child stdio for stdout and stderr', () => {
    scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    const opts = spawnMock.mock.calls[0]?.[2] as { stdio: unknown[] } | undefined
    expect(Array.isArray(opts?.stdio)).toStrictEqual(true)
    const stdio = opts?.stdio ?? []
    expect(stdio[0]).toStrictEqual('ignore')
    // stdout / stderr are the opened file descriptor — a number.
    expect(typeof stdio[1]).toStrictEqual('number')
    expect(typeof stdio[2]).toStrictEqual('number')
    expect(stdio[1]).toStrictEqual(stdio[2])
  })

  it('creates the state-root directory tree when missing', () => {
    const nested = join(tmpDir, 'nested', 'state')
    getSurfacePathMock.mockImplementation((name) => join(nested, name))

    scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    expect(existsSync(join(nested, 'update-notifier-cache.json'))).toStrictEqual(true)
    expect(existsSync(join(nested, 'auto-update.log'))).toStrictEqual(true)
  })

  it('returns { spawned: true } on success', () => {
    const result = scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })
    expect(result).toStrictEqual({ spawned: true })
  })
})

describe('scheduleDeferredInstall — concurrency lockout', () => {
  it('skips the spawn when a fresh tombstone with a live pid exists', () => {
    const configPath = join(tmpDir, 'update-notifier-cache.json')
    // Use the current process pid so the liveness probe sees a live owner —
    // this is a genuine in-progress install, not a stale/crashed one.
    writeFileSync(
      configPath,
      JSON.stringify({ autoInstallInProgress: { pid: process.pid, ts: Date.now() } }),
    )

    const result = scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    expect(result.spawned).toStrictEqual(false)
    expect(result.reason).toMatch(/recent install in progress/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('proceeds when a fresh tombstone records a DEAD pid (crashed installer)', () => {
    const configPath = join(tmpDir, 'update-notifier-cache.json')
    // A pid that is guaranteed not to be running. POSIX pids never reach the
    // kernel max here, so 0x7fffffff (2147483647) probes as ESRCH → not alive.
    const deadPid = 2_147_483_647
    expect(isProcessAlive(deadPid)).toStrictEqual(false)
    // Fresh timestamp (< LOCKOUT_MS old): the OLD age-only check would treat
    // this as a live lockout and skip the spawn. The liveness check must
    // override that, since no install is actually running.
    writeFileSync(
      configPath,
      JSON.stringify({ autoInstallInProgress: { pid: deadPid, ts: Date.now() } }),
    )

    const result = scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    expect(result.spawned).toStrictEqual(true)
    expect(spawnMock).toHaveBeenCalledOnce()
  })

  it('proceeds when the tombstone is older than LOCKOUT_MS', () => {
    const configPath = join(tmpDir, 'update-notifier-cache.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        autoInstallInProgress: { pid: 999, ts: Date.now() - (LOCKOUT_MS + 1_000) },
      }),
    )

    const result = scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    expect(result.spawned).toStrictEqual(true)
    expect(spawnMock).toHaveBeenCalledOnce()
  })

  it('overwrites a stale tombstone with the new process pid + ts', () => {
    const configPath = join(tmpDir, 'update-notifier-cache.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        autoInstallInProgress: { pid: 999, ts: Date.now() - (LOCKOUT_MS + 1_000) },
      }),
    )

    scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    const after = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      autoInstallInProgress: { pid: number }
    }
    expect(after.autoInstallInProgress.pid).toStrictEqual(process.pid)
  })

  it('proceeds when no tombstone exists at all', () => {
    const result = scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })
    expect(result.spawned).toStrictEqual(true)
  })

  it('proceeds when the configstore is corrupt JSON', () => {
    const configPath = join(tmpDir, 'update-notifier-cache.json')
    writeFileSync(configPath, '{not valid json')

    const result = scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    expect(result.spawned).toStrictEqual(true)
  })

  it('proceeds when autoInstallInProgress lacks the required shape', () => {
    const configPath = join(tmpDir, 'update-notifier-cache.json')
    writeFileSync(configPath, JSON.stringify({ autoInstallInProgress: 'oops' }))

    const result = scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    expect(result.spawned).toStrictEqual(true)
  })
})

describe('scheduleDeferredInstall — preserves other configstore keys', () => {
  it('keeps existing notifier cache entries when writing the tombstone', () => {
    const configPath = join(tmpDir, 'update-notifier-cache.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        latest: '1.0.0',
        current: '0.9.0',
        lastUpdateCheck: 1234,
      }),
    )

    scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    const after = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      latest?: string
      current?: string
      lastUpdateCheck?: number
      autoInstallInProgress?: { pid: number }
    }
    expect(after.latest).toStrictEqual('1.0.0')
    expect(after.current).toStrictEqual('0.9.0')
    expect(after.lastUpdateCheck).toStrictEqual(1234)
    expect(after.autoInstallInProgress).toBeDefined()
  })
})

describe('scheduleDeferredInstall — error paths', () => {
  it('does not spawn when the command is empty', () => {
    const result = scheduleDeferredInstall({ command: [] })
    expect(result).toStrictEqual({ spawned: false, reason: 'empty install command' })
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('returns spawned=false and logs when state root is unavailable', () => {
    getSurfacePathMock.mockImplementation(() => {
      throw new Error('no state root')
    })

    const result = scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    expect(result.spawned).toStrictEqual(false)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('routes unexpected exceptions through logUpdateError', () => {
    spawnMock.mockImplementation(() => {
      throw new Error('spawn EACCES')
    })

    const result = scheduleDeferredInstall({ command: ['npm', 'install', '-g', 'webpresso'] })

    expect(result.spawned).toStrictEqual(false)
    expect(logUpdateErrorMock).toHaveBeenCalledOnce()
  })
})

describe('clearInstallTombstone', () => {
  it('removes the autoInstallInProgress key but preserves other keys', () => {
    const configPath = join(tmpDir, 'update-notifier-cache.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        latest: '1.0.0',
        autoInstallInProgress: { pid: 999, ts: Date.now() },
      }),
    )

    clearInstallTombstone()

    const after = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      latest?: string
      autoInstallInProgress?: unknown
    }
    expect(after.latest).toStrictEqual('1.0.0')
    expect(after.autoInstallInProgress).toBeUndefined()
  })

  it('is a no-op when no tombstone is present', () => {
    expect(() => clearInstallTombstone()).not.toThrow()
  })

  it('is a no-op when configstore is missing entirely', () => {
    expect(() => clearInstallTombstone()).not.toThrow()
  })

  it('swallows errors silently', () => {
    getSurfacePathMock.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() => clearInstallTombstone()).not.toThrow()
  })
})
