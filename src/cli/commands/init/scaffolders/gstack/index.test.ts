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

function makeSpinnerFactory() {
  const start = vi.fn()
  const succeed = vi.fn()
  const fail = vi.fn()
  const factory = vi.fn(() => ({ start, succeed, fail }))
  return { factory, start, succeed, fail }
}

describe('ensureGstack', () => {
  it('returns gstack-updated and skips codex when codex is not detected', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' || String(target) === '/fake/gstack/.git',
    )
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      codexConfigPath: '/fake-home/.codex/config.toml',
      codexSkillsRoot: '/fake-home/.codex/skills',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
      detectCodex: () => false,
    })
    expect(result).toEqual({
      kind: 'gstack-updated',
      root: '/fake/gstack',
      codex: {
        kind: 'gstack-codex-skipped',
        reason: 'not-detected',
        skillsRoot: '/fake-home/.codex/skills',
      },
    })
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(spawn).toHaveBeenNthCalledWith(1, 'git', ['pull', '--ff-only', 'origin', 'main'], {
      cwd: '/fake/gstack',
      stdio: 'inherit',
    })
    expect(spawn).toHaveBeenNthCalledWith(2, './setup', ['--team'], {
      cwd: '/fake/gstack',
      stdio: 'inherit',
    })
  })

  it('returns gstack-updated and materializes codex when detected', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' ||
        String(target) === '/fake/gstack/.git' ||
        String(target) === '/fake-home/.codex/config.toml',
    )
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      codexConfigPath: '/fake-home/.codex/config.toml',
      codexSkillsRoot: '/fake-home/.codex/skills',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
      detectCodex: () => true,
    })
    expect(result).toEqual({
      kind: 'gstack-updated',
      root: '/fake/gstack',
      codex: { kind: 'gstack-codex-installed', skillsRoot: '/fake-home/.codex/skills' },
    })
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(spawn).toHaveBeenNthCalledWith(2, './setup', ['--host', 'auto', '--team'], {
      cwd: '/fake/gstack',
      stdio: 'inherit',
    })
  })

  it('returns gstack-updated and reports codex updated when codex skills already exist', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const exists = vi.fn((target: string | import('node:buffer').Buffer | URL) => {
      const value = String(target)
      return (
        value === '/fake/gstack/setup' ||
        value === '/fake/gstack/.git' ||
        value === '/fake-home/.codex/config.toml' ||
        value === '/fake-home/.codex/skills/gstack'
      )
    })
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      codexConfigPath: '/fake-home/.codex/config.toml',
      codexSkillsRoot: '/fake-home/.codex/skills',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
      detectCodex: () => true,
    })
    expect(result).toEqual({
      kind: 'gstack-updated',
      root: '/fake/gstack',
      codex: { kind: 'gstack-codex-updated', skillsRoot: '/fake-home/.codex/skills' },
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

  it('clones and runs setup --team when missing, then skips codex if not detected', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const exists = vi.fn(() => false)
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      codexSkillsRoot: '/fake-home/.codex/skills',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
      detectCodex: () => false,
    })
    expect(result).toEqual({
      kind: 'gstack-installed',
      root: '/fake/gstack',
      codex: {
        kind: 'gstack-codex-skipped',
        reason: 'not-detected',
        skillsRoot: '/fake-home/.codex/skills',
      },
    })
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
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' || String(target) === '/fake/gstack/.git',
    )
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
      detectCodex: () => false,
    })
    expect(result).toEqual({ kind: 'gstack-pull-failed', exitCode: 9 })
  })

  it('returns gstack-setup-failed when ./setup --team exits non-zero', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 7 }])
    const exists = vi.fn(() => false)
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
      detectCodex: () => false,
    })
    expect(result).toEqual({ kind: 'gstack-setup-failed', exitCode: 7, command: '--team' })
  })

  it('returns gstack-setup-failed when combined codex/team setup exits non-zero', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 12 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' ||
        String(target) === '/fake/gstack/.git' ||
        String(target) === '/fake-home/.codex/config.toml',
    )
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      codexConfigPath: '/fake-home/.codex/config.toml',
      codexSkillsRoot: '/fake-home/.codex/skills',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
      detectCodex: () => true,
    })
    expect(result).toEqual({ kind: 'gstack-setup-failed', exitCode: 12, command: '--host auto --team' })
  })

  it('calls spinner.succeed() for checkout + codex materialization success', () => {
    const { factory, start, succeed, fail } = makeSpinnerFactory()
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' ||
        String(target) === '/fake/gstack/.git' ||
        String(target) === '/fake-home/.codex/config.toml',
    )
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      codexConfigPath: '/fake-home/.codex/config.toml',
      codexSkillsRoot: '/fake-home/.codex/skills',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
      detectCodex: () => true,
      spinnerFactory: factory,
    })
    expect(result).toEqual({
      kind: 'gstack-updated',
      root: '/fake/gstack',
      codex: { kind: 'gstack-codex-installed', skillsRoot: '/fake-home/.codex/skills' },
    })
    expect(start).toHaveBeenCalled()
    expect(succeed).toHaveBeenCalledTimes(2)
    expect(fail).not.toHaveBeenCalled()
  })

  it('calls spinner.fail() when codex materialization fails', () => {
    const { factory, start, succeed, fail } = makeSpinnerFactory()
    const spawn = makeSpawn([{ status: 0 }, { status: 12 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' ||
        String(target) === '/fake/gstack/.git' ||
        String(target) === '/fake-home/.codex/config.toml',
    )
    const result = ensureGstack({
      repoRoot: '/tmp/repo',
      installRoot: '/fake/gstack',
      codexConfigPath: '/fake-home/.codex/config.toml',
      codexSkillsRoot: '/fake-home/.codex/skills',
      options: { overwrite: false, dryRun: false },
      spawn,
      exists,
      detectCodex: () => true,
      spinnerFactory: factory,
    })
    expect(result).toEqual({ kind: 'gstack-setup-failed', exitCode: 12, command: '--host auto --team' })
    expect(start).toHaveBeenCalled()
    expect(succeed).not.toHaveBeenCalled()
    expect(fail).toHaveBeenCalledTimes(1)
  })
})
