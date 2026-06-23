/**
 * Integration test for `scheduleDeferredInstall`.
 *
 * Forks a real detached child (a trivial `node -e ...` script) and asserts:
 *
 *   1. The parent returns synchronously while the child keeps running.
 *   2. The child's stdout / stderr are captured to the auto-update log.
 *   3. The tombstone is written before the spawn fires.
 *
 * Excluded from `vitest.stryker.config.ts` because real-spawn cold-start
 * exceeds the unit-test budget under Stryker's forks pool.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('#paths/state-root.js', () => ({
  getSurfacePath: vi.fn(),
}))

import { getSurfacePath } from '#paths/state-root.js'

import { scheduleDeferredInstall } from './installer.js'

const getSurfacePathMock = vi.mocked(getSurfacePath)

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wp-installer-int-'))
  getSurfacePathMock.mockImplementation((name: string, scope: 'repo' | 'worktree' | 'user') => {
    if (scope !== 'user') throw new Error(`unexpected scope ${scope}`)
    return join(tmpDir, name)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(tmpDir, { recursive: true, force: true })
})

/** Wait until `condition()` returns truthy or `timeoutMs` elapses. */
async function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (condition()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return condition()
}

describe('scheduleDeferredInstall — real spawn integration', () => {
  it('spawns a detached child that survives the synchronous return', async () => {
    const marker = 'WP_INSTALLER_INTEGRATION_MARKER_xyz123'
    const result = scheduleDeferredInstall({
      command: ['node', '-e', `process.stdout.write('${marker}\\n')`],
    })

    expect(result.spawned).toStrictEqual(true)

    const logPath = join(tmpDir, 'auto-update.log')
    const ok = await waitFor(
      () => existsSync(logPath) && readFileSync(logPath, 'utf-8').includes(marker),
    )
    expect(ok).toStrictEqual(true)

    const logContent = readFileSync(logPath, 'utf-8')
    expect(logContent.includes(marker)).toStrictEqual(true)
  })

  it('writes the tombstone to the configstore before the child completes', () => {
    const result = scheduleDeferredInstall({
      command: ['node', '-e', `setTimeout(()=>{}, 50)`],
    })

    expect(result.spawned).toStrictEqual(true)

    const configPath = join(tmpDir, 'update-notifier-cache.json')
    expect(existsSync(configPath)).toStrictEqual(true)
    const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      autoInstallInProgress?: { pid: number; ts: number }
    }
    expect(raw.autoInstallInProgress?.pid).toStrictEqual(process.pid)
    expect(typeof raw.autoInstallInProgress?.ts).toStrictEqual('number')
  })

  it('captures child stderr to the same log file as stdout', async () => {
    const stderrMarker = 'WP_INSTALLER_INT_STDERR_abc456'
    const result = scheduleDeferredInstall({
      command: ['node', '-e', `process.stderr.write('${stderrMarker}\\n')`],
    })

    expect(result.spawned).toStrictEqual(true)

    const logPath = join(tmpDir, 'auto-update.log')
    const ok = await waitFor(
      () => existsSync(logPath) && readFileSync(logPath, 'utf-8').includes(stderrMarker),
    )
    expect(ok).toStrictEqual(true)
  })
})
