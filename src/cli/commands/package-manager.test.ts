import { describe, expect, it, vi } from 'vitest'

import { installManagedRunnerHermeticHooks } from '#test-helpers/managed-runner'

import {
  buildPackageManagerCommand,
  PACKAGE_MANAGER_VERBS,
  runPackageManagerCommand,
} from './package-manager.js'

installManagedRunnerHermeticHooks()

describe('wp package-manager commands', () => {
  function spawnResult(status: number | null, error?: Error) {
    return {
      status,
      signal: null,
      output: [],
      pid: 1,
      stdout: '',
      stderr: '',
      ...(error ? { error } : {}),
    }
  }

  it('publishes the supported top-level verbs', () => {
    expect(PACKAGE_MANAGER_VERBS).toEqual(['install', 'add', 'remove', 'update', 'exec', 'run'])
  })

  it.each(PACKAGE_MANAGER_VERBS)('routes %s through managed vp', (verb) => {
    expect(buildPackageManagerCommand(verb, ['node', 'wp', verb, '--flag', 'value'])).toEqual({
      command: 'rtk',
      args: ['vp', verb, '--flag', 'value'],
    })
  })

  it('routes exec through managed vp and preserves the raw tail', () => {
    expect(
      buildPackageManagerCommand('exec', ['node', 'wp', 'exec', '--', 'vitest', 'run']),
    ).toEqual({
      command: 'rtk',
      args: ['vp', 'exec', '--', 'vitest', 'run'],
    })
  })

  it('returns the delegated child exit status', () => {
    const run = vi.fn(() => spawnResult(7))

    expect(runPackageManagerCommand('run', { run })).toBe(7)
    expect(run).toHaveBeenCalledWith('rtk', ['vp', 'run'], {
      cwd: process.cwd(),
    })
  })

  it('keeps update local by default', () => {
    const run = vi.fn(() => spawnResult(0))

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update'],
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith('rtk', ['vp', 'update'], {
      cwd: process.cwd(),
    })
  })

  it('runs local verbs from the nearest package root when invoked in a nested directory', () => {
    const run = vi.fn(() => spawnResult(0))

    expect(
      runPackageManagerCommand('run', {
        argv: ['node', 'wp', 'run', 'test'],
        cwd: '/repo/packages/agent-kit/src',
        exists: (target) => String(target) === '/repo/packages/agent-kit/package.json',
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenCalledWith('rtk', ['vp', 'run', 'test'], {
      cwd: '/repo/packages/agent-kit',
    })
  })

  it('falls back to the global refresh pipeline when wp update is invoked outside any package root', () => {
    const run = vi.fn(() => spawnResult(0))

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update'],
        cwd: '/umbrella/no-package-here',
        exists: (target) => String(target) === '/fake-home/.claude/skills/gstack/.git',
        gstackRoot: '/fake-home/.claude/skills/gstack',
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenNthCalledWith(1, 'vp', ['update', '-g', '--latest', '@openai/codex'])
    expect(run).toHaveBeenNthCalledWith(7, 'vp', ['install', '-g', '@webpresso/agent-kit'])
  })

  it('runs the global update refresh pipeline in order', () => {
    const run = vi.fn(() => spawnResult(0))

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--global'],
        exists: () => true,
        gstackRoot: '/fake-home/.claude/skills/gstack',
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenNthCalledWith(1, 'vp', ['update', '-g', '--latest', '@openai/codex'])
    expect(run).toHaveBeenNthCalledWith(2, 'tmux', ['-V'])
    expect(run).toHaveBeenNthCalledWith(3, 'vp', ['update', '-g', 'oh-my-codex'])
    expect(run).toHaveBeenNthCalledWith(4, 'claude', [
      'plugin',
      'update',
      '-s',
      'user',
      'oh-my-claudecode',
    ])
    expect(run).toHaveBeenNthCalledWith(5, 'git', [
      '-C',
      '/fake-home/.claude/skills/gstack',
      'pull',
      '--ff-only',
      'origin',
      'main',
    ])
    expect(run).toHaveBeenNthCalledWith(6, './setup', ['--team'], {
      cwd: '/fake-home/.claude/skills/gstack',
    })
    expect(run).toHaveBeenNthCalledWith(7, 'vp', ['install', '-g', '@webpresso/agent-kit'])
  })

  it('installs tmux through Homebrew when tmux is missing', () => {
    const run = vi.fn((command: string) =>
      command === 'tmux' ? spawnResult(null, new Error('spawn tmux ENOENT')) : spawnResult(0),
    )

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--global'],
        exists: () => true,
        gstackRoot: '/fake-home/.claude/skills/gstack',
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenNthCalledWith(2, 'tmux', ['-V'])
    expect(run).toHaveBeenNthCalledWith(3, 'brew', ['install', 'tmux'])
  })

  it('clones gstack when the canonical checkout is missing', () => {
    const run = vi.fn(() => spawnResult(0))
    const mkdir = vi.fn()

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--global'],
        exists: (target) => String(target) !== '/fake-home/.claude/skills/gstack/.git',
        gstackRoot: '/fake-home/.claude/skills/gstack',
        mkdir,
        run,
      }),
    ).toBe(0)

    expect(mkdir).toHaveBeenCalledWith('/fake-home/.claude/skills', { recursive: true })
    expect(run).toHaveBeenCalledWith('git', [
      'clone',
      '--depth',
      '1',
      'https://github.com/garrytan/gstack.git',
      '/fake-home/.claude/skills/gstack',
    ])
    expect(run).toHaveBeenCalledWith('./setup', ['--team'], {
      cwd: '/fake-home/.claude/skills/gstack',
    })
  })

  it('continues global update steps after a failure and exits non-zero', () => {
    const run = vi.fn((command: string) => spawnResult(command === 'claude' ? 3 : 0))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '-g'],
        exists: () => true,
        gstackRoot: '/fake-home/.claude/skills/gstack',
        run,
      }),
    ).toBe(1)

    expect(run).toHaveBeenCalledTimes(7)
    expect(error.mock.calls.join('\n')).toContain('omc')
    expect(error.mock.calls.join('\n')).toContain('exit 3')
  })

  it('reports missing global tools without throwing', () => {
    const run = vi.fn((command: string) => {
      if (command === 'vp') return spawnResult(null, new Error('spawn vp ENOENT'))
      throw new Error(`spawn ${command} ENOENT`)
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--global'],
        exists: () => true,
        gstackRoot: '/fake-home/.claude/skills/gstack',
        run,
      }),
    ).toBe(1)

    expect(run).toHaveBeenCalledTimes(6)
    expect(error.mock.calls.join('\n')).toContain('codex')
    expect(error.mock.calls.join('\n')).toContain('spawn vp ENOENT')
    expect(error.mock.calls.join('\n')).toContain('omc')
    expect(error.mock.calls.join('\n')).toContain('spawn claude ENOENT')
  })
})
