import { describe, expect, it } from 'vitest'

import { createAkTestCommandConfig, TEST_COMMAND_HELP } from './test.js'

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
      args: ['vp', 'exec', 'vitest', 'run', 'apps/cli2/src/commands/target.test.ts'],
    })
  })
})
