import { describe, expect, it, vi } from 'vitest'

import { installManagedRunnerHermeticHooks } from '#test-helpers/managed-runner'
import {
  claimProjectOwnedTool,
  claimUserOwnedTool,
  defaultToolingOwnershipState,
} from '#cli/tooling-ownership'

import {
  buildPackageManagerCommand,
  PACKAGE_MANAGER_VERBS,
  runPackageManagerCommand,
} from './package-manager.js'

installManagedRunnerHermeticHooks()

const GLOBAL_VP = '/global/bin/vp'

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

  it('runs tooling refresh by default inside a package root', () => {
    const run = vi.fn(() => spawnResult(0))
    const refreshCodexPlugin = vi.fn(() => spawnResult(0))

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update'],
        resolveVpCommand: () => GLOBAL_VP,
        packageRoot: '/global/lib/node_modules/@webpresso/agent-kit',
        refreshCodexPlugin,
        cwd: '/repo/packages/agent-kit',
        ownershipState: defaultToolingOwnershipState(),
        exists: (target) =>
          String(target) === '/repo/packages/agent-kit/package.json' ||
          String(target) === '/fake-home/.claude/skills/gstack/.git',
        gstackRoot: '/fake-home/.claude/skills/gstack',
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenNthCalledWith(1, GLOBAL_VP, ['install', '-g', '@webpresso/agent-kit'])
    expect(refreshCodexPlugin).toHaveBeenCalledWith(
      '/global/lib/node_modules/@webpresso/agent-kit',
    )
  })

  it('fails tooling refresh when the updated Codex plugin cache cannot be refreshed', () => {
    const run = vi.fn(() => spawnResult(0))
    const refreshCodexPlugin = vi.fn(() => spawnResult(1))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update'],
        resolveVpCommand: () => GLOBAL_VP,
        packageRoot: '/global/lib/node_modules/@webpresso/agent-kit',
        refreshCodexPlugin,
        cwd: '/repo/packages/agent-kit',
        ownershipState: defaultToolingOwnershipState(),
        exists: (target) => String(target) === '/repo/packages/agent-kit/package.json',
        run,
      }),
    ).toBe(1)

    expect(run).toHaveBeenCalledWith(GLOBAL_VP, ['install', '-g', '@webpresso/agent-kit'])
    expect(refreshCodexPlugin).toHaveBeenCalledWith(
      '/global/lib/node_modules/@webpresso/agent-kit',
    )
    expect(error.mock.calls.join('\n')).toContain('wp update: codex-plugin failed')
  })

  it('wraps Windows command-script vp launch plans for tooling refresh commands', () => {
    const run = vi.fn(() => spawnResult(0))
    const refreshCodexPlugin = vi.fn(() => spawnResult(0))

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update'],
        resolveVpCommand: () => ({
          command: 'C:\\Windows\\cmd.exe',
          argsPrefix: ['/d', '/s', '/c', 'C:\\Users\\me\\.vite-plus\\bin\\vp.cmd'],
          executable: 'C:\\Users\\me\\.vite-plus\\bin\\vp.cmd',
        }),
        cwd: '/repo/packages/agent-kit',
        ownershipState: defaultToolingOwnershipState(),
        packageRoot: '/global/lib/node_modules/@webpresso/agent-kit',
        refreshCodexPlugin,
        exists: (target) => String(target) === '/repo/packages/agent-kit/package.json',
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenCalledWith('C:\\Windows\\cmd.exe', [
      '/d',
      '/s',
      '/c',
      'C:\\Users\\me\\.vite-plus\\bin\\vp.cmd',
      'install',
      '-g',
      '@webpresso/agent-kit',
    ])
    expect(refreshCodexPlugin).toHaveBeenCalledWith(
      '/global/lib/node_modules/@webpresso/agent-kit',
    )
  })

  it('reports a missing global-capable vp before starting tooling refresh steps', () => {
    const run = vi.fn(() => spawnResult(0))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update'],
        resolveVpCommand: () => null,
        run,
      }),
    ).toBe(1)

    expect(run).not.toHaveBeenCalled()
    expect(error.mock.calls.join('\n')).toContain('no global-capable vp executable found')
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

  it('runs local dependency updates through managed vp only with --deps', () => {
    const run = vi.fn(() => spawnResult(0))

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--deps'],
        resolveVpCommand: () => GLOBAL_VP,
        cwd: '/repo/packages/agent-kit/src',
        exists: (target) => String(target) === '/repo/packages/agent-kit/package.json',
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith('rtk', ['vp', 'update'], {
      cwd: '/repo/packages/agent-kit',
    })
  })

  it('strips --deps before forwarding dependency update args to vp', () => {
    const run = vi.fn(() => spawnResult(0))

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--deps', '--latest', 'typescript'],
        resolveVpCommand: () => GLOBAL_VP,
        cwd: '/repo/packages/agent-kit',
        exists: (target) => String(target) === '/repo/packages/agent-kit/package.json',
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenCalledWith('rtk', ['vp', 'update', '--latest', 'typescript'], {
      cwd: '/repo/packages/agent-kit',
    })
  })

  it('treats positional update packages as dependency updates', () => {
    const run = vi.fn(() => spawnResult(0))

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', 'typescript'],
        resolveVpCommand: () => GLOBAL_VP,
        cwd: '/repo/packages/agent-kit',
        exists: (target) => String(target) === '/repo/packages/agent-kit/package.json',
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenCalledWith('rtk', ['vp', 'update', 'typescript'], {
      cwd: '/repo/packages/agent-kit',
    })
  })

  it('rejects --deps with --global', () => {
    const run = vi.fn(() => spawnResult(0))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--deps', '--global'],
        resolveVpCommand: () => GLOBAL_VP,
        run,
      }),
    ).toBe(1)

    expect(run).not.toHaveBeenCalled()
    expect(error.mock.calls.join('\n')).toContain('--deps cannot be combined with --global')
  })

  it('rejects --deps outside any package root instead of refreshing tooling', () => {
    const run = vi.fn(() => spawnResult(0))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--deps'],
        resolveVpCommand: () => GLOBAL_VP,
        cwd: '/umbrella/no-package-here',
        exists: () => false,
        run,
      }),
    ).toBe(1)

    expect(run).not.toHaveBeenCalled()
    expect(error.mock.calls.join('\n')).toContain('no package root found')
  })

  it('rejects typoed update control flags instead of silently refreshing tooling', () => {
    const run = vi.fn(() => spawnResult(0))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--dep'],
        resolveVpCommand: () => GLOBAL_VP,
        run,
      }),
    ).toBe(1)

    expect(run).not.toHaveBeenCalled()
    expect(error.mock.calls.join('\n')).toContain('unrecognized tooling option')
    expect(error.mock.calls.join('\n')).toContain('wp update --deps --dep')
  })

  it('runs wp-managed optional integration refreshes in ownership order', () => {
    const run = vi.fn(() => spawnResult(0))
    const refreshCodexPlugin = vi.fn(() => spawnResult(0))
    let ownershipState = defaultToolingOwnershipState()
    ownershipState = claimUserOwnedTool(ownershipState, 'omx')
    ownershipState = claimUserOwnedTool(ownershipState, 'omc')
    ownershipState = claimUserOwnedTool(ownershipState, 'gstack')

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--global'],
        resolveVpCommand: () => GLOBAL_VP,
        ownershipState,
        packageRoot: '/global/lib/node_modules/@webpresso/agent-kit',
        refreshCodexPlugin,
        exists: () => true,
        gstackRoot: '/fake-home/.claude/skills/gstack',
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenNthCalledWith(1, GLOBAL_VP, ['update', '-g', 'oh-my-codex'])
    expect(run).toHaveBeenNthCalledWith(2, 'claude', [
      'plugin',
      'update',
      '--scope',
      'user',
      'oh-my-claudecode',
    ])
    expect(run).toHaveBeenNthCalledWith(3, 'git', [
      '-C',
      '/fake-home/.claude/skills/gstack',
      'pull',
      '--ff-only',
      'origin',
      'main',
    ])
    expect(run).toHaveBeenNthCalledWith(4, './setup', ['--team'], {
      cwd: '/fake-home/.claude/skills/gstack',
    })
    expect(run).toHaveBeenNthCalledWith(5, GLOBAL_VP, ['install', '-g', '@webpresso/agent-kit'])
    expect(refreshCodexPlugin).toHaveBeenCalledWith(
      '/global/lib/node_modules/@webpresso/agent-kit',
    )
  })

  it('updates project-scoped OMC only when the current repo owns it', () => {
    const run = vi.fn(() => spawnResult(0))
    const refreshCodexPlugin = vi.fn(() => spawnResult(0))
    let ownershipState = defaultToolingOwnershipState()
    ownershipState = claimProjectOwnedTool(ownershipState, 'omc', 'repo-123')

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--global'],
        resolveVpCommand: () => GLOBAL_VP,
        ownershipState,
        packageRoot: '/global/lib/node_modules/@webpresso/agent-kit',
        refreshCodexPlugin,
        repoKey: 'repo-123',
        run,
      }),
    ).toBe(0)

    expect(run).toHaveBeenNthCalledWith(1, 'claude', [
      'plugin',
      'update',
      '--scope',
      'project',
      'oh-my-claudecode',
    ])
    expect(run).toHaveBeenNthCalledWith(2, GLOBAL_VP, ['install', '-g', '@webpresso/agent-kit'])
    expect(refreshCodexPlugin).toHaveBeenCalledWith(
      '/global/lib/node_modules/@webpresso/agent-kit',
    )
  })

  it('updates omx only once when both user and project ownership exist', () => {
    const run = vi.fn(() => spawnResult(0))
    const refreshCodexPlugin = vi.fn(() => spawnResult(0))
    let ownershipState = defaultToolingOwnershipState()
    ownershipState = claimUserOwnedTool(ownershipState, 'omx')
    ownershipState = claimProjectOwnedTool(ownershipState, 'omx', 'repo-123')

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update'],
        resolveVpCommand: () => GLOBAL_VP,
        ownershipState,
        packageRoot: '/global/lib/node_modules/@webpresso/agent-kit',
        refreshCodexPlugin,
        repoKey: 'repo-123',
        run,
      }),
    ).toBe(0)

    expect(
      run.mock.calls.filter(
        ([command, args]) =>
          command === GLOBAL_VP &&
          Array.isArray(args) &&
          args.join(' ') === 'update -g oh-my-codex',
      ),
    ).toHaveLength(1)
    expect(refreshCodexPlugin).toHaveBeenCalledWith(
      '/global/lib/node_modules/@webpresso/agent-kit',
    )
  })

  it('clones gstack when the canonical checkout is missing and wp owns gstack', () => {
    const run = vi.fn(() => spawnResult(0))
    const mkdir = vi.fn()
    const refreshCodexPlugin = vi.fn(() => spawnResult(0))
    let ownershipState = defaultToolingOwnershipState()
    ownershipState = claimUserOwnedTool(ownershipState, 'gstack')

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--global'],
        resolveVpCommand: () => GLOBAL_VP,
        ownershipState,
        packageRoot: '/global/lib/node_modules/@webpresso/agent-kit',
        refreshCodexPlugin,
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
    expect(refreshCodexPlugin).toHaveBeenCalledWith(
      '/global/lib/node_modules/@webpresso/agent-kit',
    )
  })

  it('continues global update steps after a failure and exits non-zero', () => {
    const run = vi.fn((command: string) => spawnResult(command === 'claude' ? 3 : 0))
    const refreshCodexPlugin = vi.fn(() => spawnResult(0))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let ownershipState = defaultToolingOwnershipState()
    ownershipState = claimUserOwnedTool(ownershipState, 'omx')
    ownershipState = claimUserOwnedTool(ownershipState, 'omc')
    ownershipState = claimUserOwnedTool(ownershipState, 'gstack')

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '-g'],
        resolveVpCommand: () => GLOBAL_VP,
        ownershipState,
        packageRoot: '/global/lib/node_modules/@webpresso/agent-kit',
        refreshCodexPlugin,
        exists: () => true,
        gstackRoot: '/fake-home/.claude/skills/gstack',
        run,
      }),
    ).toBe(1)

    expect(run).toHaveBeenCalledTimes(5)
    expect(refreshCodexPlugin).toHaveBeenCalledWith(
      '/global/lib/node_modules/@webpresso/agent-kit',
    )
    expect(error.mock.calls.join('\n')).toContain('omc')
    expect(error.mock.calls.join('\n')).toContain('exit 3')
    expect(error.mock.calls.join('\n')).toContain('wp update: omc failed')
    expect(error.mock.calls.join('\n')).not.toContain('wp update --global')
  })

  it('reports missing global tools without throwing', () => {
    const run = vi.fn((command: string) => {
      if (command === GLOBAL_VP) return spawnResult(null, new Error('spawn vp ENOENT'))
      throw new Error(`spawn ${command} ENOENT`)
    })
    const refreshCodexPlugin = vi.fn(() => spawnResult(0))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let ownershipState = defaultToolingOwnershipState()
    ownershipState = claimUserOwnedTool(ownershipState, 'omx')
    ownershipState = claimUserOwnedTool(ownershipState, 'omc')

    expect(
      runPackageManagerCommand('update', {
        argv: ['node', 'wp', 'update', '--global'],
        resolveVpCommand: () => GLOBAL_VP,
        ownershipState,
        packageRoot: '/global/lib/node_modules/@webpresso/agent-kit',
        refreshCodexPlugin,
        run,
      }),
    ).toBe(1)

    expect(run).toHaveBeenCalledTimes(3)
    expect(refreshCodexPlugin).toHaveBeenCalledWith(
      '/global/lib/node_modules/@webpresso/agent-kit',
    )
    expect(error.mock.calls.join('\n')).toContain('spawn vp ENOENT')
    expect(error.mock.calls.join('\n')).toContain('omc')
    expect(error.mock.calls.join('\n')).toContain('spawn claude ENOENT')
  })
})
