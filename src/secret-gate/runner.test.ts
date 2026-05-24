import { describe, expect, it } from 'vitest'

import { buildSecretGateCommand, runSecretGateCommand } from './runner.js'

describe('secret-gate runner', () => {
  it('builds command through with-secrets env-profile contract', () => {
    const command = buildSecretGateCommand({
      command: 'act',
      args: ['-W', '.github/workflows/ci.yml'],
    })

    expect(command).toEqual({
      command: 'with-secrets',
      args: ['--env-profile', 'secrets-only', '--', 'act', '-W', '.github/workflows/ci.yml'],
    })
  })

  it('bounds captured stdout', async () => {
    const result = await runSecretGateCommand({
      runner: '/bin/echo',
      command: 'x'.repeat(100),
      maxOutputBytes: 48,
    })

    expect(result.exitCode).toBe(0)
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(48)
    expect(result.stdout).toContain('output truncated')
  })

  it('supports custom runner and env profile', () => {
    const command = buildSecretGateCommand({
      runner: 'wp-secret-runner',
      envProfile: 'database',
      command: 'wrangler',
      args: ['tail', 'api-worker'],
    })

    expect(command).toEqual({
      command: 'wp-secret-runner',
      args: ['--env-profile', 'database', '--', 'wrangler', 'tail', 'api-worker'],
    })
  })
})
