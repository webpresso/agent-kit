import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearManagedRunnerCache, setRtkAvailabilityProbeForTest } from '#tool-runtime'
import { createAkE2eCommandConfig, E2E_COMMAND_HELP, plannedGroupsToCommandConfigs } from './e2e.js'

describe('wp e2e command helpers', () => {
  beforeEach(() => {
    setRtkAvailabilityProbeForTest(true)
  })

  afterEach(() => {
    setRtkAvailabilityProbeForTest(null)
    clearManagedRunnerCache()
  })

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
