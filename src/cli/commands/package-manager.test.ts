import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setRtkAvailabilityProbeForTest } from '#tool-runtime'

import {
  buildPackageManagerCommand,
  PACKAGE_MANAGER_VERBS,
  runPackageManagerCommand,
} from './package-manager.js'

describe('wp package-manager commands', () => {
  beforeEach(() => {
    setRtkAvailabilityProbeForTest(true)
  })

  afterEach(() => {
    setRtkAvailabilityProbeForTest(null)
  })

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
    const run = vi.fn(() => ({
      status: 7,
      signal: null,
      output: [],
      pid: 1,
      stdout: '',
      stderr: '',
    }))

    expect(runPackageManagerCommand('run', { run })).toBe(7)
    expect(run).toHaveBeenCalledWith('rtk', ['vp', 'run'])
  })
})
