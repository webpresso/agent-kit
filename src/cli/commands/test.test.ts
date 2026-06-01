import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { resolveLocalPackageEntrypoint, resolveNodeRuntimeCommand } from '#tool-runtime/local-package-entrypoint.js'
import { createAkTestCommandConfig, TEST_COMMAND_HELP } from './test.js'

const tempDirs: string[] = []

function expectedVitestRunner(cwd: string): { command: string; args: string[] } {
  const vitestEntrypoint = resolveLocalPackageEntrypoint(cwd, 'vitest', 'vitest.mjs')
  return vitestEntrypoint
    ? { command: 'rtk', args: [resolveNodeRuntimeCommand(), vitestEntrypoint] }
    : { command: 'rtk', args: ['vp', 'exec', 'vitest'] }
}

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
    const runner = expectedVitestRunner(process.cwd())
    expect(
      createAkTestCommandConfig({
        file: ['apps/cli2/src/commands/target.test.ts'],
      }),
    ).toEqual({
      command: runner.command,
      args: [...runner.args, 'run', 'apps/cli2/src/commands/target.test.ts'],
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
      args: ['vp', 'exec', 'vitest', 'run'],
    })
  })
})
