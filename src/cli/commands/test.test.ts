import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ManagedRunnerOutputPolicy, ResolveRunnerOptions } from '#tool-runtime'

import { afterEach, describe, expect, it, vi } from 'vitest'

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

import { createAkTestCommandConfig, TEST_COMMAND_HELP } from './test.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

describe('wp test command helpers', () => {
  it('documents package and file target flags', () => {
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
      args: ['vitest', 'run', 'apps/cli2/src/commands/target.test.ts'],
    })
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
      args: ['vitest', 'run'],
    })
  })
})
