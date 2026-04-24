import { describe, expect, it } from 'vitest'

import { buildTestCommand, buildVitestCommand, buildVpTestCommand } from './command-builder.js'

describe('buildVpTestCommand', () => {
  it('builds a vp package test command', () => {
    expect(buildVpTestCommand(['cli2'])).toEqual({
      command: 'vp',
      args: ['run', 'cli2', 'test'],
    })
  })

  it('builds explicit vp task ids for scoped package targets', () => {
    expect(buildVpTestCommand(['@repo/logger'])).toEqual({
      command: 'vp',
      args: ['run', '@repo/logger#test'],
    })
  })

  it('passes runner options before the task and vitest passthrough after --', () => {
    expect(
      buildVpTestCommand(['cli2'], {
        coverage: true,
        passthrough: ['--runInBand'],
        concurrencyLimit: 2,
        log: 'grouped',
      }),
    ).toEqual({
      command: 'vp',
      args: [
        'run',
        'cli2',
        '--concurrency-limit',
        '2',
        '--log',
        'grouped',
        'test',
        '--',
        '--coverage',
        '--runInBand',
      ],
      env: { VP_RUN_CONCURRENCY_LIMIT: '2' },
    })
  })
})

describe('buildVitestCommand', () => {
  it('builds a direct vitest file command', () => {
    expect(buildVitestCommand(['apps/cli2/src/commands/target.test.ts'])).toEqual({
      command: 'vitest',
      args: ['run', 'apps/cli2/src/commands/target.test.ts'],
    })
  })

  it('separates config files from test files', () => {
    expect(
      buildVitestCommand(['vitest.config.ts', 'apps/cli2/src/commands/target.test.ts'], {
        testNamePattern: 'target',
      }),
    ).toEqual({
      command: 'vitest',
      args: [
        'run',
        '--config',
        'vitest.config.ts',
        '-t',
        'target',
        'apps/cli2/src/commands/target.test.ts',
      ],
    })
  })
})

describe('buildTestCommand', () => {
  it('uses vp for package targets', () => {
    expect(buildTestCommand({ type: 'package', values: ['cli2'] })).toEqual({
      command: 'vp',
      args: ['run', 'cli2', 'test'],
    })
  })

  it('uses vitest for file targets', () => {
    expect(
      buildTestCommand({ type: 'file', values: ['apps/cli2/src/commands/target.test.ts'] }),
    ).toEqual({
      command: 'vitest',
      args: ['run', 'apps/cli2/src/commands/target.test.ts'],
    })
  })
})
