import { afterEach, describe, expect, it, vi } from 'vitest'

import tool from './worker-tail.js'

const runSecretGateCommandMock = vi.hoisted(() => vi.fn())

vi.mock('#secret-gate/runner.js', () => ({
  runSecretGateCommand: runSecretGateCommandMock,
}))

afterEach(() => {
  runSecretGateCommandMock.mockReset()
})

describe('wp_worker_tail tool', () => {
  it('returns dry-run command by default', async () => {
    const result = await tool.handler({ worker: 'webpresso-chef-alpha', environment: 'preview' })
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(true)
    expect(payload.summary).toContain('dry-run')
  })

  it('captures JSON events when executing', async () => {
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ level: 'error', message: 'boom' }) + '\n',
      stderr: '',
      timedOut: false,
      aborted: false,
      signal: null,
    })

    const result = await tool.handler({
      worker: 'webpresso-chef-alpha',
      execute: true,
      maxEvents: 5,
    })

    expect(runSecretGateCommandMock).toHaveBeenCalledOnce()
    const payload = result.structuredContent as Record<string, unknown>
    expect(payload.passed).toBe(true)
    expect((payload.events as unknown[]).length).toBe(1)
  })
})
