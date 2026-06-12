import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { installManagedRunnerHermeticHooks } from '#test-helpers/managed-runner'
import { isCommandSequenceConfig } from '#test'
import { createAkTestCommandConfig, registerTestCommand, TEST_COMMAND_HELP } from './test.js'

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

const tempDirs: string[] = []

installManagedRunnerHermeticHooks()

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

describe('wp test command helpers', () => {
  it('documents package and file target flags', () => {
    expect(TEST_COMMAND_HELP).toContain('wp test --suite unit')
    expect(TEST_COMMAND_HELP).toContain('wp test --suite integration')
    expect(TEST_COMMAND_HELP).toContain('wp test --package cli2')
    expect(TEST_COMMAND_HELP).toContain('wp test --file apps/cli2/src/commands/target.test.ts')
  })

  it('builds package-target commands through the managed runtime core with passthrough args', () => {
    expect(
      createAkTestCommandConfig({
        package: ['cli2'],
        passthrough: ['--reporter=dot'],
      }),
    ).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'cli2', 'test', '--', '--reporter=dot'],
    })
  })

  it('builds file-target commands through the managed runtime core', () => {
    expect(
      createAkTestCommandConfig({
        file: ['apps/cli2/src/commands/target.test.ts'],
      }),
    ).toEqual({
      command: 'rtk',
      args: [expect.stringContaining('vitest'), 'run', 'apps/cli2/src/commands/target.test.ts'],
    })
  })

  it('builds a two-phase command sequence for suite=all', () => {
    const command = createAkTestCommandConfig({ suite: 'all' })
    expect(isCommandSequenceConfig(command)).toBe(true)
    if (!isCommandSequenceConfig(command)) return

    expect(command.sequence).toHaveLength(2)
    expect(command.sequence[0]?.args).toEqual([
      expect.stringContaining('vitest'),
      'run',
      '--exclude',
      '**/*.integration.test.ts',
    ])
    expect(command.sequence[1]?.args).toEqual([
      expect.stringContaining('vitest'),
      'run',
      '--no-file-parallelism',
      '.integration.test.ts',
      '--testTimeout',
      '30000',
    ])
  })

  it('avoids recursion when the local package script is wp test', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-cli-test-recursive-'))
    tempDirs.push(cwd)
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        scripts: { test: 'wp test' },
        devDependencies: { vitest: '^4.0.0' },
      }),
      'utf8',
    )

    expect(createAkTestCommandConfig({ cwd })).toEqual({
      command: 'rtk',
      args: [expect.stringContaining('vitest'), 'run'],
    })
  })

  it('exposes the summary-first --full escape hatch', () => {
    const cli = buildFakeCli()
    registerTestCommand(cli as never)
    expect(cli.getOptions()).toContain('--full')
  })
})
