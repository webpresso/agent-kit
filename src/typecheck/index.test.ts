import type { ManagedRunnerOutputPolicy, ResolveRunnerOptions } from '#tool-runtime'

import { describe, expect, it, vi } from 'vitest'

const runCommand = vi.hoisted(() => vi.fn())

vi.mock('#mcp/tools/_shared/run-command', () => ({
  isRunFailure: () => false,
  runCommand,
}))

// Resolver is mocked so this test verifies command ASSEMBLY deterministically,
// independent of which tool bins are installed locally. Real local-bin vs
// `vp exec` resolution is covered by resolve-runner.test.ts + the package-bin
// test. The mock faithfully mirrors the real outputPolicy contract.
vi.mock('#tool-runtime', () => ({
  getManagedRunner: (tool: string, options: ResolveRunnerOptions = {}) => {
    const base =
      tool === 'vp'
        ? { tool: 'vp', command: 'vp', args: [] as string[] }
        : { tool, command: tool, args: [] as string[] }
    const policy: ManagedRunnerOutputPolicy =
      options.outputPolicy ?? (options.filterOutput === false ? 'structured' : 'rtk-filtered')
    if (policy === 'rtk-filtered') {
      return { ...base, command: 'rtk', args: [base.command, ...base.args], source: 'managed' }
    }
    return { ...base, source: 'managed' }
  },
}))

import { runTypecheck } from './index.js'

describe('runTypecheck', () => {
  it('routes root typecheck through the managed structured runner', async () => {
    runCommand.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      aborted: false,
    })

    await runTypecheck({ cwd: process.cwd() })

    expect(runCommand).toHaveBeenCalledWith(
      'tsc',
      ['--noEmit'],
      expect.objectContaining({ cwd: process.cwd() }),
    )
  })
})
