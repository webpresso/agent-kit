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
    env: { PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:4173' },
    steps: [
      {
        runner: 'playwright',
        logName: 'smoke',
        configPath: 'apps/e2e/playwright.config.ts',
        supportsHeaded: true,
        supportsDebug: true,
        env: { E2E_SUITE: 'smoke' },
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
        env: undefined,
        runs: [
          {
            suiteId: 'smoke',
            batchKey: 'smoke',
            envProfile: undefined,
            runner: 'playwright',
            logName: 'smoke',
            reportDir: undefined,
            command: 'rtk',
            args: [
              'vp',
              'exec',
              'playwright',
              'test',
              '--config',
              'playwright.config.ts',
              '--headed',
              'tests/smoke.spec.ts',
            ],
            env: undefined,
          },
        ],
      },
    ])
  })

  it('uses vitest.config.ts by default for generic vitest runs', () => {
    expect(
      planGenericE2eRun({
        runner: 'vitest',
        files: ['e2e/smoke.e2e.ts'],
      }),
    ).toEqual([
      {
        batchKey: 'default',
        envProfile: undefined,
        env: undefined,
        runs: [
          {
            suiteId: 'default',
            batchKey: 'default',
            envProfile: undefined,
            runner: 'vitest',
            logName: 'default',
            reportDir: undefined,
            command: 'rtk',
            args: [
              'vp',
              'exec',
              'vitest',
              'run',
              '--config',
              'vitest.config.ts',
              'e2e/smoke.e2e.ts',
            ],
            env: undefined,
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

  it('merges suite and step env into planned runs', () => {
    const groups = planE2eRun({
      hostAdapter,
      suite: 'smoke',
    })

    expect(groups).toEqual([
      {
        batchKey: 'journeys',
        envProfile: 'journeys',
        env: {
          E2E_SUITE: 'smoke',
          PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:4173',
        },
        runs: [
          {
            suiteId: 'smoke',
            batchKey: 'journeys',
            envProfile: 'journeys',
            runner: 'playwright',
            logName: 'smoke',
            reportDir: undefined,
            command: 'rtk',
            args: [
              'vp',
              '--dir',
              'apps/e2e',
              'exec',
              'playwright',
              'test',
              '--config',
              'playwright.config.ts',
            ],
            env: {
              E2E_SUITE: 'smoke',
              PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:4173',
            },
          },
        ],
      },
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
        env: undefined,
        runs: [
          {
            suiteId: 'platform-api',
            batchKey: 'platform-chef-serial',
            envProfile: 'platform-chef-serial',
            runner: 'vitest',
            logName: 'platform-api-serial',
            reportDir: undefined,
            command: 'rtk',
            args: [
              'vp',
              '--dir',
              'apps/workers/platform-api/e2e',
              'exec',
              'vitest',
              'run',
              '--config',
              'vitest.serial.config.ts',
              'serial/graphql-schema-generation.e2e.ts',
            ],
            env: undefined,
          },
        ],
      },
    ])
  })
})

describe('groupPlannedE2eRuns', () => {
  it('groups steps by batch key, env profile, and shared env', () => {
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
          env: { FOO: 'one' },
        },
        {
          suiteId: 'two',
          batchKey: 'shared',
          envProfile: 'alpha',
          runner: 'vitest',
          logName: 'two',
          command: 'vitest',
          args: ['run', '--changed'],
          env: { FOO: 'one' },
        },
      ]),
    ).toEqual([
      {
        batchKey: 'shared',
        envProfile: 'alpha',
        env: { FOO: 'one' },
        runs: [
          {
            suiteId: 'one',
            batchKey: 'shared',
            envProfile: 'alpha',
            runner: 'vitest',
            logName: 'one',
            command: 'vitest',
            args: ['run'],
            env: { FOO: 'one' },
          },
          {
            suiteId: 'two',
            batchKey: 'shared',
            envProfile: 'alpha',
            runner: 'vitest',
            logName: 'two',
            command: 'vitest',
            args: ['run', '--changed'],
            env: { FOO: 'one' },
          },
        ],
      },
    ])
  })

  it('splits grouped runs when the effective env differs', () => {
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
          env: { FOO: 'one' },
        },
        {
          suiteId: 'two',
          batchKey: 'shared',
          envProfile: 'alpha',
          runner: 'vitest',
          logName: 'two',
          command: 'vitest',
          args: ['run', '--changed'],
          env: { FOO: 'two' },
        },
      ]),
    ).toHaveLength(2)
  })
})
