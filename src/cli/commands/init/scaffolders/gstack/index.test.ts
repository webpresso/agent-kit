import { describe, expect, it, vi } from 'vitest'

import { ensureGstack } from './index.js'

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
  }) as unknown as Parameters<typeof ensureGstack>[0]['spawn']
}

describe('ensureGstack', () => {
  it('returns gstack-updated when setup script exists and update succeeds', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const exists = vi.fn((target: string) => target === '/fake/gstack/setup' || target === '/fake/gstack/.git')
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
    })
    expect(result).toEqual({ kind: 'gstack-updated', root: '/fake/gstack' })
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(exists).toHaveBeenCalledWith('/fake/gstack/setup')
    expect(spawn).toHaveBeenNthCalledWith(1, 'git', ['pull', '--ff-only', 'origin', 'main'], {
      cwd: '/fake/gstack',
      stdio: 'inherit',
    })
    expect(spawn).toHaveBeenNthCalledWith(2, './setup', ['--team'], {
      cwd: '/fake/gstack',
      stdio: 'inherit',
    })
  })

  it('returns gstack-updated for unmanaged existing install without .git', () => {
    const spawn = makeSpawn([{ status: 0 }])
    const exists = vi.fn((target: string) => target === '/fake/gstack/setup')
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
    })
    expect(result).toEqual({ kind: 'gstack-updated', root: '/fake/gstack' })
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenNthCalledWith(1, './setup', ['--team'], {
      cwd: '/fake/gstack',
      stdio: 'inherit',
    })
  })

  it('returns gstack-skipped-dry-run without checking or spawning', () => {
    const spawn = makeSpawn([])
    const exists = vi.fn(() => false)
    const result = ensureGstack({
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
    const result = ensureGstack({
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
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
    })
    expect(result).toEqual({ kind: 'gstack-clone-failed', exitCode: 128 })
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('returns gstack-pull-failed when update pull exits non-zero', () => {
    const spawn = makeSpawn([{ status: 9 }])
    const exists = vi.fn((target: string) => target === '/fake/gstack/setup' || target === '/fake/gstack/.git')
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
    })
    expect(result).toEqual({ kind: 'gstack-pull-failed', exitCode: 9 })
  })

  it('returns gstack-setup-failed when ./setup exits non-zero', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 7 }])
    const exists = vi.fn(() => false)
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
    })
    expect(result).toEqual({ kind: 'gstack-setup-failed', exitCode: 7 })
  })
})
