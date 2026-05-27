import { afterEach, describe, expect, it, vi } from 'vitest'

import tool from './ci-act.js'

const TEST_REDACTABLE_SECRET = 'TESTTOKENABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE'

const runSecretGateCommandMock = vi.hoisted(() => vi.fn())

vi.mock('#secret-gate/runner.js', () => ({
  runSecretGateCommand: runSecretGateCommandMock,
}))

const originalEnv = { ...process.env }

afterEach(() => {
  runSecretGateCommandMock.mockReset()
  process.env = { ...originalEnv }
})

describe('wp_ci_act tool', () => {
  it('returns a sanitized dry-run command without executing act by default', async () => {
    process.env.GITHUB_PAT = TEST_REDACTABLE_SECRET
    const result = await tool.handler({
      workflowPath: '.github/workflows/ci.yml',
      secretProfile: 'github-api',
      mapGithubPatToToken: true,
    })

    expect(runSecretGateCommandMock).not.toHaveBeenCalled()
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(true)
    expect(payload.summary).toContain('dry-run')
    const details = payload.details as { command: { args: string[] } }
    expect(details.command.args).toContain('--secret-file')
    expect(details.command.args).toContain('[INTERNAL_SECRET_FILE]')
    expect(JSON.stringify(payload)).not.toContain(TEST_REDACTABLE_SECRET)
    expect(JSON.stringify(payload)).not.toMatch(/wp-ci-act-[^" ]+secrets\.env/u)
  })

  it('enforces strict required profile secrets', async () => {
    const result = await tool.handler({
      workflowPath: '.github/workflows/cleanup-stale-neon-e2e-branches.yml',
      job: 'cleanup',
      strictSecrets: true,
    })

    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(false)
    expect(result.isError).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('--chef-token')
  })

  it('rejects legacy and arbitrary unsafe public inputs at the schema boundary', async () => {
    await expect(
      tool.handler({
        workflowPath: '.github/workflows/ci.yml',
        passthrough: ['--secret', 'TOKEN=value'],
      }),
    ).rejects.toThrow()

    await expect(
      tool.handler({
        workflowPath: '.github/workflows/ci.yml',
        allowHostMutation: true,
      }),
    ).rejects.toThrow()
  })

  it('executes through secret gate with internal secret-file only when execute=true', async () => {
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      timedOut: false,
      aborted: false,
      signal: null,
    })

    const result = await tool.handler({
      workflowPath: '.github/workflows/ci.yml',
      execute: true,
      strictSecrets: false,
    })

    expect(runSecretGateCommandMock).toHaveBeenCalledOnce()
    const call = runSecretGateCommandMock.mock.calls[0]![0]
    expect(call.command).toBe('act')
    expect(call.args).toContain('--secret-file')
    expect(call.args.join(' ')).not.toContain('--chef-token')
    expect(call.args.join(' ')).not.toContain('--bind')
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(true)
    expect(JSON.stringify(payload)).toContain('[INTERNAL_SECRET_FILE]')
  })

  it('redacts seeded fake secrets from execute output and metadata', async () => {
    const fakeSecret = TEST_REDACTABLE_SECRET
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 1,
      stdout: `GITHUB_TOKEN=${fakeSecret}`,
      stderr: `failed ${fakeSecret}`,
      timedOut: false,
      aborted: false,
      signal: null,
    })

    const result = await tool.handler({
      workflowPath: '.github/workflows/ci.yml',
      execute: true,
      strictSecrets: false,
    })

    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(false)
    expect(JSON.stringify(payload)).not.toContain(fakeSecret)
    expect(JSON.stringify(result.content)).not.toContain(fakeSecret)
  })
})
