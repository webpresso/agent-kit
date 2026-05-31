import { describe, expect, it, vi } from 'vitest'

import {
  buildPackageManagerCommand,
  PACKAGE_MANAGER_VERBS,
  runPackageManagerCommand,
} from './package-manager.js'

describe('wp package-manager commands', () => {
  it('publishes the supported top-level verbs', () => {
    expect(PACKAGE_MANAGER_VERBS).toEqual(['install', 'add', 'remove', 'update', 'exec', 'run'])
  })

  it('routes install through managed vp', () => {
    expect(
      buildPackageManagerCommand('install', ['node', 'wp', 'install', '--frozen-lockfile']),
    ).toEqual({
      command: 'vp',
      args: ['install', '--frozen-lockfile'],
    })
  })

  it('routes add through managed vp and preserves flags', () => {
    expect(buildPackageManagerCommand('add', ['node', 'wp', 'add', '-D', 'zod'])).toEqual({
      command: 'vp',
      args: ['add', '-D', 'zod'],
    })
  })

  it('routes exec through managed vp and preserves the raw tail', () => {
    expect(
      buildPackageManagerCommand('exec', ['node', 'wp', 'exec', '--', 'vitest', 'run']),
    ).toEqual({
      command: 'vp',
      args: ['exec', '--', 'vitest', 'run'],
    })
  })

  it('returns the delegated child exit status', () => {
    const run = vi.fn(() => ({
      status: 7,
      signal: null,
      output: [],
      pid: 1,
      stdout: '',
      stderr: '',
    }))

    expect(runPackageManagerCommand('run', { run })).toBe(7)
    expect(run).toHaveBeenCalledWith('vp', ['run'])
  })
})
