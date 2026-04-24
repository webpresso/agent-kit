import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createAkE2eExecutionPlan } from './e2e.js'

describe('ak e2e host adapter integration', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `agent-kit-e2e-command-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('uses the configured host adapter when agent-kit.config.ts is present', async () => {
    const nestedDir = join(testDir, 'packages', 'logger')

    mkdirSync(nestedDir, { recursive: true })
    writeFileSync(
      join(testDir, 'agent-kit.config.ts'),
      [
        'export const agentKitConfig = {',
        "  e2e: { hostAdapterModule: './adapter.ts' },",
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
    writeFileSync(
      join(testDir, 'adapter.ts'),
      [
        'export const agentKitE2eHostAdapter = {',
        "  listSuites: () => [{ id: 'platform-api', aliases: ['api'], fileMatchers: ['main/'], batchKey: 'platform-chef', envProfile: 'platform-chef', steps: [{ runner: 'vitest', logName: 'platform-api', configPath: 'apps/workers/platform-api/e2e/vitest.config.ts' }] }],",
        "  resolveSuiteId: (name) => name === 'api' || name === 'platform-api' ? 'platform-api' : null,",
        '  resolveSuiteGroup: () => null,',
        "  normalizeFilePath: (file) => file.replace(/^apps\\/workers\\/platform-api\\/e2e\\//, ''),",
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file.replace(/^apps\\/workers\\/platform-api\\/e2e\\//, ''), suiteId: 'platform-api' }),",
        "  buildExecutionPlan: (request) => [{ batchKey: 'webpresso-host', envProfile: undefined, env: { NEON_BRANCH_URL: 'postgres://branch' }, runs: [{ suiteId: request.suite ?? 'platform-api', batchKey: 'webpresso-host', envProfile: undefined, env: { WORKER_BASE_URL: 'http://127.0.0.1:8787' }, runner: 'command', logName: 'webpresso-host', command: 'pnpm', args: ['--dir', 'apps/e2e', 'run', 'e2e:run', '--', '--suite', request.suite ?? 'platform-api', '--file', ...(request.file ?? [])] }] }],",
        '}',
        '',
      ].join('\n'),
      'utf8',
    )

    const groups = await createAkE2eExecutionPlan(
      {
        suite: 'api',
        file: ['apps/workers/platform-api/e2e/main/graphql-contract.e2e.ts'],
      },
      nestedDir,
    )

    expect(groups).toEqual([
      {
        batchKey: 'webpresso-host',
        envProfile: undefined,
        env: {
          NEON_BRANCH_URL: 'postgres://branch',
        },
        runs: [
          {
            suiteId: 'api',
            batchKey: 'webpresso-host',
            envProfile: undefined,
            env: {
              WORKER_BASE_URL: 'http://127.0.0.1:8787',
            },
            runner: 'command',
            logName: 'webpresso-host',
            command: 'pnpm',
            args: [
              '--dir',
              'apps/e2e',
              'run',
              'e2e:run',
              '--',
              '--suite',
              'api',
              '--file',
              'apps/workers/platform-api/e2e/main/graphql-contract.e2e.ts',
            ],
          },
        ],
      },
    ])
  })
})
