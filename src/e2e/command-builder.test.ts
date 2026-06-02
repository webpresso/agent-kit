import { describe, expect, it } from 'vitest'

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
      args: [
        expect.stringContaining('@playwright'),
        'test',
        '--config',
        'apps/e2e/playwright.config.ts',
      ],
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
        expect.stringContaining('@playwright'),
        'test',
        '--config',
        'apps/e2e/playwright.config.ts',
        '--headed',
        '--debug',
        '--workers',
        '2',
        '--test-list',
        '.tmp/e2e-list.txt',
        'apps/e2e/tests/journeys/login.spec.ts',
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
      args: [
        expect.stringContaining('vitest'),
        'run',
        '--config',
        'apps/workers/platform-api/e2e/vitest.config.ts',
      ],
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
      command: expect.stringContaining('@playwright'),
      args: ['test', '--config', 'apps/e2e/playwright.config.ts'],
    })
  })
})
