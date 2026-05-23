import { afterEach, describe, expect, it, vi } from 'vitest'

import tool from './ci-act.js'

const runSecretGateCommandMock = vi.hoisted(() => vi.fn())

vi.mock('#secret-gate/runner.js', () => ({
  runSecretGateCommand: runSecretGateCommandMock,
}))

afterEach(() => {
  runSecretGateCommandMock.mockReset()
})

describe('wp_ci_act tool', () => {
  it('returns dry-run command without executing act by default', async () => {
    const result = await tool.handler({
      workflowPath: '.github/workflows/ci.yml',
    })

    expect(runSecretGateCommandMock).not.toHaveBeenCalled()
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(true)
    expect(payload.summary).toContain('dry-run')
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
  })

  it('executes through secret gate when execute=true', async () => {
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
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(true)
  })
})
