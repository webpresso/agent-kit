import { describe, expect, it } from 'vitest'

import { parseWithSecretsArgs } from './with-secrets-cli.js'

describe('parseWithSecretsArgs', () => {
  it('parses canonical runtime profiles', () => {
    expect(parseWithSecretsArgs(['--env-profile', 'service-runtime', '--', 'pnpm', 'run', 'dev'])).toEqual({
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
