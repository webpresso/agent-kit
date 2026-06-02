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

import { buildE2eCommand } from './command-builder.js'

describe('buildE2eCommand', () => {
  it('builds a Playwright command for suite config', () => {
    expect(
      buildE2eCommand({
        step: {
          runner: 'playwright',
          logName: 'journeys',
          configPath: 'apps/e2e/playwright.config.ts',
        },
      }),
    ).toEqual({
      command: 'rtk',
      args: ['playwright', 'test', '--config', 'playwright.config.ts'],
    })
  })

  it('forwards file, headed, debug, workers, and test-list flags', () => {
    expect(
      buildE2eCommand({
        step: {
          runner: 'playwright',
          logName: 'journeys',
          configPath: 'apps/e2e/playwright.config.ts',
        },
        files: ['apps/e2e/tests/journeys/login.spec.ts'],
        headed: true,
        debug: true,
        workers: 2,
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
        '--debug',
        '--workers',
        '2',
        '--test-list',
        '.tmp/e2e-list.txt',
        'tests/journeys/login.spec.ts',
      ],
    })
  })

  it('uses vitest for vitest suites', () => {
    expect(
      buildE2eCommand({
        step: {
          runner: 'vitest',
          logName: 'worker',
          configPath: 'apps/workers/platform-api/e2e/vitest.config.ts',
        },
      }),
    ).toEqual({
      command: 'rtk',
      args: ['vitest', 'run', '--config', 'vitest.config.ts'],
    })
  })

  it('uses command args for custom runner steps', () => {
    expect(
      buildE2eCommand({
        step: {
          runner: 'command',
          logName: 'codegen',
          commandArgs: ['pnpm', 'exec', 'tsx', 'scripts/codegen-url.ts'],
          fixedArgs: ['--flag'],
        },
        files: ['sdk/example.ts'],
      }),
    ).toEqual({
      command: 'pnpm',
      args: ['exec', 'tsx', 'scripts/codegen-url.ts', '--flag', 'sdk/example.ts'],
    })
  })

  it('forwards explicit outputPolicy through managed runners', () => {
    expect(
      buildE2eCommand({
        step: {
          runner: 'playwright',
          logName: 'journeys',
          configPath: 'apps/e2e/playwright.config.ts',
        },
        outputPolicy: 'structured',
      }),
    ).toEqual({
      command: 'playwright',
      args: ['test', '--config', 'playwright.config.ts'],
    })
  })
})
