import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { buildTestCommand, buildVitestCommand, buildVpTestCommand } from './command-builder.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

describe('buildVpTestCommand', () => {
  it('builds a vp package test command', () => {
    expect(buildVpTestCommand(['cli2'])).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', 'test'],
    })
  })

  it('builds explicit vp task ids for scoped package targets', () => {
    expect(buildVpTestCommand(['@repo/logger'])).toEqual({
      command: 'rtk',
      args: ['vp', 'run', '@repo/logger#test'],
    })
  })

  it('builds vp test command with no-cache option', () => {
    expect(buildVpTestCommand(['cli2'], { noCache: true })).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', '--no-cache', 'test'],
    })
  })

  it('builds vp test command with cache option', () => {
    expect(buildVpTestCommand(['cli2'], { cache: true })).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', '--cache', 'test'],
    })
  })

  it('builds vp test command with parallel option', () => {
    expect(buildVpTestCommand(['cli2'], { parallel: true })).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', '--parallel', 'test'],
    })
  })

  it('builds vp test command with mutation task', () => {
    expect(buildVpTestCommand(['cli2'], { mutation: true })).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', 'test:mutation'],
    })
  })

  it('builds vp test command with workers task', () => {
    expect(buildVpTestCommand(['cli2'], { workers: true })).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', 'test:workers'],
    })
  })

  it('builds vp test command with watch task', () => {
    expect(buildVpTestCommand(['cli2'], { watch: true })).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', 'test:watch'],
    })
  })

  it('builds vp test command with concurrency limit', () => {
    expect(buildVpTestCommand(['cli2'], { concurrencyLimit: 4 })).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', '--concurrency-limit', '4', 'test'],
      env: { VP_RUN_CONCURRENCY_LIMIT: '4' },
    })
  })

  it('forwards explicit outputPolicy to resolve raw runner output', () => {
    expect(buildVpTestCommand(['cli2'], { outputPolicy: 'structured' })).toEqual({
      command: 'vp',
      args: ['run', 'cli2', 'test'],
    })
  })

  it('builds vp test command with log mode', () => {
    expect(buildVpTestCommand(['cli2'], { log: 'labeled' })).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', '--log', 'labeled', 'test'],
    })
  })

  it('keeps explicit vp task id unchanged', () => {
    expect(buildVpTestCommand(['cli2#test:watch'])).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2#test:watch'],
    })
  })

  it('builds vp test with multiple filters including scoped', () => {
    expect(buildVpTestCommand(['cli2', '@repo/logger'])).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', '@repo/logger#test', 'test'],
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
      command: 'rtk',
      args: [
        'vp',
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

  it('builds vp test with scoped filter that has a path', () => {
    expect(buildVpTestCommand(['@scope/pkg/src/test.ts'], {})).toEqual({
      command: 'rtk',
      args: ['vp', 'run', '@scope/pkg/src/test.ts#test'],
    })
  })
})

describe('buildVitestCommand', () => {
  it('builds a direct vitest file command', () => {
    expect(buildVitestCommand(['apps/cli2/src/commands/target.test.ts'])).toEqual({
      command: 'rtk',
      args: ['vp', 'exec', 'vitest', 'run', 'apps/cli2/src/commands/target.test.ts'],
    })
  })

  it('separates config files from test files', () => {
    expect(
      buildVitestCommand(['vitest.config.ts', 'apps/cli2/src/commands/target.test.ts'], {
        testNamePattern: 'target',
      }),
    ).toEqual({
      command: 'rtk',
      args: [
        'vp',
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.config.ts',
        '-t',
        'target',
        'apps/cli2/src/commands/target.test.ts',
      ],
    })
  })

  it('builds vitest watch command', () => {
    expect(buildVitestCommand(['apps/cli2/src/commands/target.test.ts'], { watch: true })).toEqual({
      command: 'rtk',
      args: ['vp', 'exec', 'vitest', '--watch', 'apps/cli2/src/commands/target.test.ts'],
    })
  })

  it('handles vitest config with suffix like vitest.node.config.ts', () => {
    expect(
      buildVitestCommand(['vitest.node.config.ts', 'apps/cli2/src/commands/target.test.ts']),
    ).toEqual({
      command: 'rtk',
      args: [
        'vp',
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.node.config.ts',
        'apps/cli2/src/commands/target.test.ts',
      ],
    })
  })

  it('handles vitest config with .mts extension', () => {
    expect(
      buildVitestCommand(['vitest.config.mts', 'apps/cli2/src/commands/target.test.ts']),
    ).toEqual({
      command: 'rtk',
      args: [
        'vp',
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.config.mts',
        'apps/cli2/src/commands/target.test.ts',
      ],
    })
  })

  it('throws when multiple vitest config files are passed', () => {
    expect(() => buildVitestCommand(['vitest.config.ts', 'vitest.node.config.ts'])).toThrow(
      /at most one/i,
    )
  })

  it('passes coverage and passthrough opts to vitest', () => {
    expect(
      buildVitestCommand(['apps/cli2/src/commands/target.test.ts'], {
        coverage: true,
        passthrough: ['--runInBand'],
      }),
    ).toEqual({
      command: 'rtk',
      args: [
        'vp',
        'exec',
        'vitest',
        'run',
        '--coverage',
        '--runInBand',
        'apps/cli2/src/commands/target.test.ts',
      ],
    })
  })
})

describe('buildTestCommand recursion safety', () => {
  it('bypasses vp run when the local test script recursively invokes wp test', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-test-recursive-'))
    tempDirs.push(cwd)
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        scripts: { test: 'wp test' },
        devDependencies: { vitest: '^4.0.0' },
      }),
      'utf8',
    )

    expect(buildTestCommand({ type: 'all', values: [] }, { cwd })).toEqual({
      command: 'rtk',
      args: ['vp', 'exec', 'vitest', 'run'],
    })
  })

  it('keeps custom non-recursive test scripts on vp run', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-test-custom-'))
    tempDirs.push(cwd)
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        scripts: { test: 'node scripts/test.js' },
        devDependencies: { vitest: '^4.0.0' },
      }),
      'utf8',
    )

    expect(buildTestCommand({ type: 'all', values: [] }, { cwd })).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'test'],
    })
  })
})

describe('buildTestCommand', () => {
  it('uses vp for package targets', () => {
    expect(buildTestCommand({ type: 'package', values: ['cli2'] })).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', 'test'],
    })
  })

  it('uses vitest for file targets', () => {
    expect(
      buildTestCommand({ type: 'file', values: ['apps/cli2/src/commands/target.test.ts'] }),
    ).toEqual({
      command: 'rtk',
      args: ['vp', 'exec', 'vitest', 'run', 'apps/cli2/src/commands/target.test.ts'],
    })
  })
})
