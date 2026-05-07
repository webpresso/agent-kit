import { describe, expect, it, vi } from 'vitest'

import { ensureRtk } from './index.js'

function makeSpawn(behaviors: Array<{ status: number | null; error?: Error }>) {
  let i = 0
  return vi.fn(() => {
    const next = behaviors[i] ?? { status: 0 }
    i += 1
    return {
      status: next.status,
      error: next.error,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      pid: 1,
      output: [],
      signal: null,
    }
  }) as unknown as Parameters<typeof ensureRtk>[0]['spawn']
}

describe('ensureRtk', () => {
  it('returns rtk-skipped-dry-run without spawning anything', () => {
    const spawn = makeSpawn([])
    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: true },
      spawn,
    })

    expect(result).toEqual({ kind: 'rtk-skipped-dry-run' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('returns rtk-ok when probe and init both succeed', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })

    expect(result).toEqual({ kind: 'rtk-ok', installed: false })
    expect(spawn).toHaveBeenNthCalledWith(1, 'rtk', ['--version'], { encoding: 'utf8' })
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      'rtk',
      ['init', '-g', '--auto-patch'],
      expect.objectContaining({
        cwd: '/tmp/repo',
        stdio: 'inherit',
        env: expect.objectContaining({
          RTK_TELEMETRY_DISABLED: '1',
        }),
      }),
    )
  })

  it('installs with brew on macOS when rtk is not on PATH', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      { status: 0 },
      { status: 0 },
      { status: 0 },
    ])

    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })

    expect(result).toEqual({ kind: 'rtk-ok', installed: true })
    expect(spawn).toHaveBeenNthCalledWith(2, 'brew', ['install', 'rtk'], {
      stdio: 'inherit',
    })
    platform.mockRestore()
  })

  it('returns rtk-not-found when brew install fails', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      { status: 1 },
    ])

    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })

    expect(result.kind).toBe('rtk-not-found')
    if (result.kind === 'rtk-not-found') {
      expect(result.hint).toContain('brew install rtk')
    }
    platform.mockRestore()
  })

  it('returns rtk-not-found on non-macOS without attempting brew', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
    ])

    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })

    expect(result.kind).toBe('rtk-not-found')
    expect(spawn).toHaveBeenCalledTimes(1)
    platform.mockRestore()
  })

  it('returns rtk-init-failed when init exits non-zero', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 9 }])
    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })

    expect(result).toEqual({ kind: 'rtk-init-failed', exitCode: 9 })
  })
})
