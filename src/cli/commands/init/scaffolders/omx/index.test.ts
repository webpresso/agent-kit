import { describe, expect, it, vi } from 'vitest'

import { ensureOmx } from './index.js'

function makeSpawn(behaviors: Array<{ status: number | null; error?: Error }>) {
  let i = 0
  return vi.fn(() => {
    const next = behaviors[i] ?? { status: 0 }
    i++
    return {
      status: next.status,
      error: next.error,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      pid: 1,
      output: [],
      signal: null,
    }
  }) as unknown as Parameters<typeof ensureOmx>[0]['spawn']
}

describe('ensureOmx', () => {
  it('returns omx-ok when probe and setup both succeed', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result).toEqual({ kind: 'omx-ok' })
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('returns omx-skipped-dry-run without spawning anything', () => {
    const spawn = makeSpawn([])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: true },
      spawn,
    })
    expect(result).toEqual({ kind: 'omx-skipped-dry-run' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('returns omx-not-found when probe errors (omx not on PATH)', () => {
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
    ])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result.kind).toBe('omx-not-found')
    if (result.kind === 'omx-not-found') {
      expect(result.hint).toContain('omx (oh-my-codex)')
    }
  })

  it('returns omx-not-found when probe exits non-zero', () => {
    const spawn = makeSpawn([{ status: 127 }])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result.kind).toBe('omx-not-found')
  })

  it('returns omx-spawn-failed when setup itself fails', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 2 }])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result).toEqual({ kind: 'omx-spawn-failed', exitCode: 2 })
  })

  it('passes --yes to the setup invocation', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(spawn).toHaveBeenNthCalledWith(2, 'omx', ['setup', '--yes'], {
      cwd: '/tmp/repo',
      stdio: 'inherit',
    })
  })
})
