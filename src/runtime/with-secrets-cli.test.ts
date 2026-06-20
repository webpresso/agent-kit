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
      environment: undefined,
    })
  })

  it('parses provider-specific selectors separately from runtime profiles', () => {
    expect(
      parseWithSecretsArgs(['--secret-env-profile=prd', '--', 'wrangler', 'deploy']),
    ).toEqual({
      command: 'wrangler',
      args: ['deploy'],
      profile: undefined,
      environment: 'prd',
    })
  })

  it('supports direct command execution without separator', () => {
    expect(parseWithSecretsArgs(['pnpm', 'run', 'build'])).toEqual({
      command: 'pnpm',
      args: ['run', 'build'],
      profile: undefined,
      environment: undefined,
    })
  })

  it('parses provider environment separately from runtime profile', () => {
    expect(
      parseWithSecretsArgs([
        '--runtime-profile',
        'secrets-only',
        '--secret-env-profile',
        'dev',
        '--',
        'act',
      ]),
    ).toEqual({
      command: 'act',
      args: [],
      profile: 'secrets-only',
      environment: 'dev',
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
