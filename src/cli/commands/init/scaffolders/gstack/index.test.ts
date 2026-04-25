import { describe, expect, it, vi } from 'vitest'

import { scaffoldGstack } from './index.js'

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
  }) as unknown as Parameters<typeof scaffoldGstack>[0]['spawn']
}

describe('scaffoldGstack', () => {
  it('returns gstack-already-installed when setup script exists', () => {
    const spawn = makeSpawn([])
    const exists = vi.fn(() => true)
    const result = scaffoldGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
    })
    expect(result).toEqual({ kind: 'gstack-already-installed', root: '/fake/gstack' })
    expect(spawn).not.toHaveBeenCalled()
    expect(exists).toHaveBeenCalledWith('/fake/gstack/setup')
  })

  it('returns gstack-skipped-dry-run without checking or spawning', () => {
    const spawn = makeSpawn([])
    const exists = vi.fn(() => false)
    const result = scaffoldGstack({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: true },
      spawn,
      exists,
    })
    expect(result).toEqual({ kind: 'gstack-skipped-dry-run' })
    expect(spawn).not.toHaveBeenCalled()
    expect(exists).not.toHaveBeenCalled()
  })

  it('clones and runs setup --team when missing', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const exists = vi.fn(() => false)
    const result = scaffoldGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
    })
    expect(result).toEqual({ kind: 'gstack-installed', root: '/fake/gstack' })
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      'git',
      ['clone', '--depth', '1', 'https://github.com/garrytan/gstack.git', '/fake/gstack'],
      { stdio: 'inherit' },
    )
    expect(spawn).toHaveBeenNthCalledWith(2, './setup', ['--team'], {
      cwd: '/fake/gstack',
      stdio: 'inherit',
    })
  })

  it('returns gstack-clone-failed when clone exits non-zero', () => {
    const spawn = makeSpawn([{ status: 128 }])
    const exists = vi.fn(() => false)
    const result = scaffoldGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
    })
    expect(result).toEqual({ kind: 'gstack-clone-failed', exitCode: 128 })
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('returns gstack-setup-failed when ./setup exits non-zero', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 7 }])
    const exists = vi.fn(() => false)
    const result = scaffoldGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
    })
    expect(result).toEqual({ kind: 'gstack-setup-failed', exitCode: 7 })
  })
})
