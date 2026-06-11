import { describe, expect, it } from 'vitest'

import { isDirectWithSecretsCliEntrypoint, parseWithSecretsArgs } from './with-secrets-cli.js'

describe('parseWithSecretsArgs', () => {
  it('parses canonical runtime profiles', () => {
    expect(
      parseWithSecretsArgs(['--env-profile', 'service-runtime', '--', 'pnpm', 'run', 'dev']),
    ).toEqual({
      command: 'pnpm',
      args: ['run', 'dev'],
      profile: 'service-runtime',
    })
  })

  it('parses provider-specific selectors', () => {
    expect(parseWithSecretsArgs(['--env-profile=prd', '--', 'wrangler', 'deploy'])).toEqual({
      command: 'wrangler',
      args: ['deploy'],
      profile: 'prd',
    })
  })

  it('supports direct command execution without separator', () => {
    expect(parseWithSecretsArgs(['pnpm', 'run', 'build'])).toEqual({
      command: 'pnpm',
      args: ['run', 'build'],
      profile: undefined,
    })
  })
})

describe('isDirectWithSecretsCliEntrypoint', () => {
  it('detects direct execution by resolved module path', () => {
    expect(
      isDirectWithSecretsCliEntrypoint(
        ['node', '/tmp/with-secrets-cli.js'],
        'file:///tmp/with-secrets-cli.js',
      ),
    ).toBe(true)
    expect(
      isDirectWithSecretsCliEntrypoint(
        ['node', '/tmp/other.js'],
        'file:///tmp/with-secrets-cli.js',
      ),
    ).toBe(false)
  })
})
