import type { ManagedRunnerOutputPolicy, ResolveRunnerOptions } from '#tool-runtime'

import { describe, expect, it, vi } from 'vitest'

// Resolver is mocked so these tests verify command ASSEMBLY deterministically,
// independent of which tool bins are installed locally. The real local-bin vs
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

import { createAkE2eCommandConfig, E2E_COMMAND_HELP, plannedGroupsToCommandConfigs } from './e2e.js'

describe('wp e2e command helpers', () => {
  it('documents the generic E2E flag surface', () => {
    expect(E2E_COMMAND_HELP).toContain('wp e2e --suite smoke')
    expect(E2E_COMMAND_HELP).toContain('--test-list')
    expect(E2E_COMMAND_HELP).toContain('--reuse-reset')
  })

  it('builds a Playwright command from generic flags', () => {
    expect(
      createAkE2eCommandConfig({
        suite: 'smoke',
        config: 'playwright.config.ts',
        file: ['tests/smoke.spec.ts'],
        headed: true,
        workers: '2',
        testList: '.tmp/e2e-list.txt',
      }),
    ).toEqual({
      command: 'rtk',
      args: [
        'playwright',
        'test',
        '--config',
        'playwright.config.ts',
        '--headed',
        '--workers',
        '2',
        '--test-list',
        '.tmp/e2e-list.txt',
        'tests/smoke.spec.ts',
      ],
    })
  })

  it('merges group and run env into executable commands', () => {
    expect(
      plannedGroupsToCommandConfigs([
        {
          batchKey: 'platform',
          envProfile: 'platform',
          env: {
            DATABASE_URL: 'postgres://suite',
            SHARED: 'group',
          },
          runs: [
            {
              suiteId: 'platform-api',
              batchKey: 'platform',
              envProfile: 'platform',
              runner: 'command',
              logName: 'platform-api',
              command: 'pnpm',
              args: ['exec', 'vitest', 'run'],
              env: {
                SHARED: 'run',
                E2E_SUITE: 'platform-api',
              },
            },
          ],
        },
      ]),
    ).toEqual([
      {
        command: 'pnpm',
        args: ['exec', 'vitest', 'run'],
        env: {
          DATABASE_URL: 'postgres://suite',
          SHARED: 'run',
          E2E_SUITE: 'platform-api',
        },
      },
    ])
  })
})
