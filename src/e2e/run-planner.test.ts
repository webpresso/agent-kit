import type { E2eHostAdapter, E2eSuiteDefinition } from './types.js'

import { describe, expect, it } from 'vitest'

import { groupPlannedE2eRuns, planE2eRun, planGenericE2eRun } from './run-planner.js'

const hostSuites: readonly E2eSuiteDefinition[] = [
  {
    id: 'smoke',
    aliases: ['journeys-smoke'],
    fileMatchers: ['smoke/'],
    batchKey: 'journeys',
    envProfile: 'journeys',
    steps: [
      {
        runner: 'playwright',
        logName: 'smoke',
        configPath: 'apps/e2e/playwright.config.ts',
        supportsHeaded: true,
        supportsDebug: true,
      },
    ],
  },
  {
    id: 'platform-api',
    aliases: ['api'],
    fileMatchers: ['main/', 'serial/'],
    batchKey: 'platform-chef',
    envProfile: 'platform-chef',
    steps: [
      {
        runner: 'vitest',
        logName: 'platform-api-main',
        configPath: 'apps/workers/platform-api/e2e/vitest.config.ts',
        batchKey: 'platform-chef-main',
        envProfile: 'platform-chef-main',
      },
      {
        runner: 'vitest',
        logName: 'platform-api-serial',
        configPath: 'apps/workers/platform-api/e2e/vitest.serial.config.ts',
        batchKey: 'platform-chef-serial',
        envProfile: 'platform-chef-serial',
        fixedFiles: ['serial/graphql-schema-generation.e2e.ts'],
      },
    ],
  },
]

const hostAdapter: E2eHostAdapter = {
  listSuites: () => hostSuites,
  resolveSuiteId: (name) =>
    hostSuites.find((suite) => suite.id === name || suite.aliases?.includes(name))?.id ?? null,
  resolveSuiteGroup: (name) => (name === 'all' ? hostSuites.map((suite) => suite.id) : null),
  normalizeFilePath: (filePath) => filePath.replace(/^apps\/workers\/platform-api\/e2e\//u, ''),
  resolveSuiteForFile: (filePath) => {
    const normalizedPath = filePath.replace(/^apps\/workers\/platform-api\/e2e\//u, '')
    const suite = hostSuites.find((candidate) =>
      candidate.fileMatchers.some((matcher) => normalizedPath.startsWith(matcher)),
    )

    return suite ? { normalizedPath, suiteId: suite.id } : null
  },
}

describe('planGenericE2eRun', () => {
  it('creates a single generic planned group', () => {
    expect(
      planGenericE2eRun({
        suite: 'smoke',
        config: 'playwright.config.ts',
        files: ['tests/smoke.spec.ts'],
        headed: true,
      }),
    ).toEqual([
      {
        batchKey: 'smoke',
        envProfile: undefined,
        runs: [
          {
            suiteId: 'smoke',
            batchKey: 'smoke',
            envProfile: undefined,
            runner: 'playwright',
            logName: 'smoke',
            reportDir: undefined,
            command: 'pnpm',
            args: [
              'exec',
              'playwright',
              'test',
              '--config',
              'playwright.config.ts',
              '--headed',
              'tests/smoke.spec.ts',
            ],
          },
        ],
      },
    ])
  })
})

describe('planE2eRun', () => {
  it('resolves aliases and plans host-backed runs', () => {
    const groups = planE2eRun({
      hostAdapter,
      suite: 'api',
      headed: false,
      debug: false,
    })

    expect(groups.map((group) => group.batchKey)).toEqual([
      'platform-chef-main',
      'platform-chef-serial',
    ])
    expect(groups.flatMap((group) => group.runs.map((run) => run.logName))).toEqual([
      'platform-api-main',
      'platform-api-serial',
    ])
  })

  it('filters fixed files out of the main lane when a serial step claims them', () => {
    const groups = planE2eRun({
      hostAdapter,
      file: ['apps/workers/platform-api/e2e/serial/graphql-schema-generation.e2e.ts'],
    })

    expect(groups).toEqual([
      {
        batchKey: 'platform-chef-serial',
        envProfile: 'platform-chef-serial',
        runs: [
          {
            suiteId: 'platform-api',
            batchKey: 'platform-chef-serial',
            envProfile: 'platform-chef-serial',
            runner: 'vitest',
            logName: 'platform-api-serial',
            reportDir: undefined,
            command: 'pnpm',
            args: [
              '--dir',
              'apps/workers/platform-api/e2e',
              'exec',
              'vitest',
              'run',
              '--config',
              'vitest.serial.config.ts',
              'serial/graphql-schema-generation.e2e.ts',
            ],
          },
        ],
      },
    ])
  })
})

describe('groupPlannedE2eRuns', () => {
  it('groups steps by batch key and env profile', () => {
    expect(
      groupPlannedE2eRuns([
        {
          suiteId: 'one',
          batchKey: 'shared',
          envProfile: 'alpha',
          runner: 'vitest',
          logName: 'one',
          command: 'vitest',
          args: ['run'],
        },
        {
          suiteId: 'two',
          batchKey: 'shared',
          envProfile: 'alpha',
          runner: 'vitest',
          logName: 'two',
          command: 'vitest',
          args: ['run', '--changed'],
        },
      ]),
    ).toEqual([
      {
        batchKey: 'shared',
        envProfile: 'alpha',
        runs: [
          {
            suiteId: 'one',
            batchKey: 'shared',
            envProfile: 'alpha',
            runner: 'vitest',
            logName: 'one',
            command: 'vitest',
            args: ['run'],
          },
          {
            suiteId: 'two',
            batchKey: 'shared',
            envProfile: 'alpha',
            runner: 'vitest',
            logName: 'two',
            command: 'vitest',
            args: ['run', '--changed'],
          },
        ],
      },
    ])
  })
})
