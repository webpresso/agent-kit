import { describe, expect, it } from 'vitest'

import { createAkTestCommandConfig, TEST_COMMAND_HELP } from './test.js'

describe('wp test command helpers', () => {
  it('documents package and file target flags', () => {
    expect(TEST_COMMAND_HELP).toContain('wp test --package cli2')
    expect(TEST_COMMAND_HELP).toContain('wp test --file apps/cli2/src/commands/target.test.ts')
  })

  it('builds package-target commands with passthrough args', () => {
    expect(
      createAkTestCommandConfig({
        package: ['cli2'],
        passthrough: ['--reporter=dot'],
      }),
    ).toEqual({
      command: 'vp',
      args: ['run', 'cli2', 'test', '--', '--reporter=dot'],
    })
  })

  it('builds file-target commands', () => {
    expect(
      createAkTestCommandConfig({
        file: ['apps/cli2/src/commands/target.test.ts'],
      }),
    ).toEqual({
      command: 'vitest',
      args: ['run', 'apps/cli2/src/commands/target.test.ts'],
    })
  })
})
