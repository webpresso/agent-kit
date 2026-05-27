import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildCiActCommand } from '#cli/commands/ci'

import tool from './ci-act.js'

const TEST_REDACTABLE_SECRET = 'TESTTOKENABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE'

const runSecretGateCommandMock = vi.hoisted(() => vi.fn())

vi.mock('#secret-gate/runner.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#secret-gate/runner.js')>()),
  runSecretGateCommand: runSecretGateCommandMock,
}))

const originalEnv = { ...process.env }

afterEach(() => {
  runSecretGateCommandMock.mockReset()
  process.env = { ...originalEnv }
})

describe('wp_ci_act tool', () => {
  it('returns the same canonical with-secrets dry-run command as the CLI', async () => {
    process.env.GITHUB_PAT = TEST_REDACTABLE_SECRET
    const result = await tool.handler({
      workflowPath: '.github/workflows/ci.yml',
      cwd: '/repo',
    })

    expect(runSecretGateCommandMock).not.toHaveBeenCalled()
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(true)
    expect(payload.summary).toContain('dry-run')
    const details = payload.details as { command: { command: string; args: string[] } }
    expect(details.command).toEqual(
      buildCiActCommand({ workflowPath: '.github/workflows/ci.yml' }, '/repo'),
    )
    expect(details.command.command).toBe('with-secrets')
    expect(details.command.args.slice(0, 4)).toEqual(['--env-profile', 'secrets-only', '--', 'act'])
    expect(details.command.args.join(' ')).not.toContain('--secret-file')
    expect(JSON.stringify(payload)).not.toContain(TEST_REDACTABLE_SECRET)
    expect(JSON.stringify(payload)).not.toMatch(/wp-ci-act-[^" ]+secrets\.env/u)
  })

  it('rejects legacy provider fallback and arbitrary unsafe public inputs at the schema boundary', async () => {
    await expect(
      tool.handler({
        workflowPath: '.github/workflows/ci.yml',
        secretProfile: 'github-api',
      }),
    ).rejects.toThrow()

    await expect(
      tool.handler({
        workflowPath: '.github/workflows/ci.yml',
        strictSecrets: true,
      }),
    ).rejects.toThrow()

    await expect(
      tool.handler({
        workflowPath: '.github/workflows/ci.yml',
        mapGithubPatToToken: true,
      }),
    ).rejects.toThrow()

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

  it('executes through the canonical secret gate without internal secret-file fallbacks', async () => {
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
    })

    expect(runSecretGateCommandMock).toHaveBeenCalledOnce()
    const call = runSecretGateCommandMock.mock.calls[0]![0]
    expect(call.command).toBe('act')
    expect(call.envProfile).toBe('secrets-only')
    expect(call.args).not.toContain('--secret-file')
    expect(call.args.join(' ')).not.toContain('--chef-token')
    expect(call.args.join(' ')).not.toContain('--bind')
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(true)
    const details = payload.details as { command: { command: string; args: string[] } }
    expect(details.command.command).toBe('with-secrets')
    expect(details.command.args.join(' ')).not.toContain('--secret-file')
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
    })

    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(false)
    expect(JSON.stringify(payload)).not.toContain(fakeSecret)
    expect(JSON.stringify(result.content)).not.toContain(fakeSecret)
  })

  it('marks timed out execution as isError: true', async () => {
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: '',
      timedOut: true,
      aborted: false,
      signal: null,
    })

    const result = await tool.handler({
      workflowPath: '.github/workflows/ci.yml',
      execute: true,
    })

    expect(result.isError).toBe(true)
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(false)
    expect(JSON.stringify(payload)).toContain('timed out while running act')
  })

  it('marks aborted execution as isError: true', async () => {
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: '',
      timedOut: false,
      aborted: true,
      signal: 'SIGTERM',
    })

    const result = await tool.handler({
      workflowPath: '.github/workflows/ci.yml',
      execute: true,
    })

    expect(result.isError).toBe(true)
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(false)
    expect(JSON.stringify(payload)).toContain('aborted by client signal')
  })
})
