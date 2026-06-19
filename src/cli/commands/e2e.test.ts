import { describe, expect, it } from 'vitest'

import { installManagedRunnerHermeticHooks } from '#test-helpers/managed-runner'
import {
  createAkE2eCommandConfig,
  E2E_COMMAND_HELP,
  plannedGroupsToCommandConfigs,
  registerE2eCommand,
} from './e2e.js'

function buildFakeCli() {
  const options: string[] = []
  const chain = {
    option: (name: string) => {
      options.push(name)
      return chain
    },
    action: (_fn: unknown) => chain,
  }
  return {
    command: () => chain,
    getOptions: () => options,
  }
}

installManagedRunnerHermeticHooks()

describe('wp e2e command helpers', () => {
  it('documents the generic E2E flag surface', () => {
    expect(E2E_COMMAND_HELP).toContain('wp e2e --suite smoke')
    expect(E2E_COMMAND_HELP).toContain('--test-list')
    expect(E2E_COMMAND_HELP).toContain('--reuse-reset')
  })

  it('builds a Playwright command from generic flags', () => {
    const command = createAkE2eCommandConfig({
      suite: 'smoke',
      config: 'playwright.config.ts',
      file: ['tests/smoke.spec.ts'],
      headed: true,
      workers: '2',
      testList: '.tmp/e2e-list.txt',
    })

    expect(command.command).toBe('rtk')
    expect(command.args).toEqual([
      expect.stringContaining('@playwright'),
      'test',
      '--config',
      'playwright.config.ts',
      '--headed',
      '--workers',
      '2',
      '--test-list',
      '.tmp/e2e-list.txt',
      'tests/smoke.spec.ts',
    ])
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
      expect.objectContaining({
        command: 'pnpm',
        args: ['exec', 'vitest', 'run'],
        runtimeProfile: 'platform',
        env: {
          DATABASE_URL: 'postgres://suite',
          SHARED: 'run',
          E2E_SUITE: 'platform-api',
        },
      }),
    ])
  })

  it('exposes the summary-first --full escape hatch', () => {
    const cli = buildFakeCli()
    registerE2eCommand(cli as never)
    expect(cli.getOptions()).toContain('--file <path>')
    expect(cli.getOptions()).toContain('--timeout-ms <ms>')
    expect(cli.getOptions()).toContain('--full')
  })
})
