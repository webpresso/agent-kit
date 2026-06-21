import { describe, expect, it } from 'vitest'

import { buildSecretGateCommand, runSecretGateCommand } from './runner.js'

describe('secret-gate runner', () => {
  it('builds command through wp secrets run by default', () => {
    const command = buildSecretGateCommand({
      sink: 'act',
      command: 'act',
      args: ['-W', '.github/workflows/ci.yml'],
    })

    expect(command).toEqual({
      command: 'wp',
      args: ['secrets', 'run', '--sink', 'act', '--profile', 'preview', '--', 'act', '-W', '.github/workflows/ci.yml'],
    })
  })

  it('bounds captured stdout', async () => {
    const result = await runSecretGateCommand({
      sink: 'act',
      envProfile: 'public',
      command: '/bin/echo',
      args: ['x'.repeat(100)],
      maxOutputBytes: 48,
    })

    expect(result.exitCode).toBe(0)
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(48)
    expect(result.stdout).toContain('output truncated')
  })

  it('supports custom runner with separate runtime and provider environment profiles', () => {
    const command = buildSecretGateCommand({
      sink: 'deploy-wrangler',
      profile: 'dev',
      envProfile: 'database',
      command: 'wrangler',
      args: ['tail', 'api-worker'],
    })

    expect(command).toEqual({
      command: 'wp',
      args: [
        'secrets',
        'run',
        '--sink',
        'deploy-wrangler',
        '--profile',
        'dev',
        '--',
        'wrangler',
        'tail',
        'api-worker',
      ],
    })
  })

  it('rejects provider-specific selectors in envProfile', () => {
    expect(() =>
      buildSecretGateCommand({
        envProfile: 'e2e-runtime',
        command: 'act',
      }),
    ).toThrow('Use one of')
  })

  it('bypasses the secret wrapper for no-secret profiles', () => {
    const command = buildSecretGateCommand({
      sink: 'act',
      envProfile: 'public',
      command: 'act',
      args: ['-W', '.github/workflows/ci.yml'],
    })

    expect(command).toEqual({
      command: 'act',
      args: ['-W', '.github/workflows/ci.yml'],
    })
  })

  it('executes commands directly for no-secret profiles', async () => {
    const result = await runSecretGateCommand({
      sink: 'act',
      envProfile: 'public',
      command: '/bin/echo',
      args: ['hello'],
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('hello')
  })
})
