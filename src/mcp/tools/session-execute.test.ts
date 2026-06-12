/**
 * Tests for `ak_session_execute` MCP tool.
 *
 * Mocks:
 *   - #session-memory/ctx-rs-runtime (loadNativeBinding) — controls command output + indexing
 *   - #session-memory/store (getStore)                   — controls search
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadNativeBindingMock = vi.hoisted(() => vi.fn())
const executeSandboxedMock = vi.hoisted(() => vi.fn())
const searchMock = vi.hoisted(() => vi.fn())
const getStoreMock = vi.hoisted(() =>
  vi.fn(() => ({
    insertChunks: vi.fn(),
    search: searchMock,
  })),
)

vi.mock('#session-memory/ctx-rs-runtime', () => ({
  loadNativeBinding: loadNativeBindingMock,
}))

vi.mock('#session-memory/store', () => ({
  getStore: getStoreMock,
}))

function fakeExecuteResult(opts: {
  exitCode?: number
  outputBytes?: number
  indexed?: boolean
  summary?: string
}) {
  return {
    exitCode: opts.exitCode ?? 0,
    outputBytes: opts.outputBytes ?? 10,
    indexed: opts.indexed ?? false,
    summary: opts.summary ?? '',
  }
}

function payloadOf(result: { structuredContent: unknown }) {
  return result.structuredContent as Record<string, unknown>
}

describe('ak_session_execute', () => {
  let tool: Awaited<typeof import('./session-execute.js')>['default']

  beforeEach(async () => {
    vi.resetModules()
    executeSandboxedMock.mockReset()
    searchMock.mockReset()
    getStoreMock.mockReset()
    getStoreMock.mockReturnValue({ insertChunks: vi.fn(), search: searchMock })
    loadNativeBindingMock.mockReset()
    loadNativeBindingMock.mockReturnValue({ executeSandboxed: executeSandboxedMock })
    const mod = await import('./session-execute.js')
    tool = mod.default
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes correct descriptor surface', () => {
    expect(tool.name).toBe('ak_session_execute')
    expect(typeof tool.description).toBe('string')
    expect(typeof tool.handler).toBe('function')
  })

  describe('small output (not indexed)', () => {
    it('returns passed result without indexing', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 6, indexed: false, summary: 'ok\n' }),
      )

      const result = await tool.handler({ command: 'echo ok' })
      const payload = payloadOf(result)

      expect(payload.passed).toBe(true)
      expect(payload.summary).toMatch(/command succeeded/)
      const details = payload.details as Record<string, unknown>
      expect(details.indexed).toBe(false)
      expect(details.exitCode).toBe(0)
    })

    it('includes summary preview in details', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({
          exitCode: 0,
          outputBytes: 12,
          indexed: false,
          summary: 'hello world\n',
        }),
      )

      const result = await tool.handler({ command: 'echo hello world' })
      const payload = payloadOf(result)
      const details = payload.details as Record<string, unknown>

      expect(details.summary).toContain('hello world')
    })
  })

  describe('large output (indexed)', () => {
    it('returns indexed=true when ctx-rs indexed the output', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({
          exitCode: 0,
          outputBytes: 3000,
          indexed: true,
          summary: 'x'.repeat(100),
        }),
      )

      const result = await tool.handler({ command: 'big-command', label: 'big-label' })
      const payload = payloadOf(result)
      const details = payload.details as Record<string, unknown>

      expect(details.indexed).toBe(true)
      expect(details.outputBytes).toBe(3000)
    })

    it('uses command as label when label is not provided', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 3000, indexed: true }),
      )

      const result = await tool.handler({ command: 'my-command' })
      const payload = payloadOf(result)
      const details = payload.details as Record<string, unknown>

      expect(details.label).toBe('my-command')
    })

    it('passes label to executeSandboxed', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 3000, indexed: true }),
      )

      await tool.handler({ command: 'cmd', label: 'my-label' })

      expect(executeSandboxedMock).toHaveBeenCalledOnce()
      const [, , labelArg] = executeSandboxedMock.mock.calls[0]!
      expect(labelArg).toBe('my-label')
    })

    it('reports failed exit code when command fails', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 1, outputBytes: 3000, indexed: true }),
      )

      const result = await tool.handler({ command: 'failing-cmd' })
      const payload = payloadOf(result)

      expect(payload.passed).toBe(false)
      expect(payload.summary).toMatch(/exit code 1/)
    })

    it('runs a query over indexed content when query is provided', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 3000, indexed: true }),
      )
      const fakeHits = [{ content: 'x', source: 'lbl', rank: -1, tier: 'porter' }]
      searchMock.mockReturnValue(fakeHits)

      const result = await tool.handler({ command: 'cmd', label: 'lbl', query: 'x' })
      const payload = payloadOf(result)
      const details = payload.details as Record<string, unknown>

      expect(searchMock).toHaveBeenCalledOnce()
      expect(details.hits).toEqual(fakeHits)
    })

    it('does NOT run a query when output was not indexed', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 50, indexed: false }),
      )

      const result = await tool.handler({ command: 'cmd', query: 'something' })
      const payload = payloadOf(result)
      const details = payload.details as Record<string, unknown>

      expect(searchMock).not.toHaveBeenCalled()
      expect(details.hits).toBe(undefined)
    })
  })

  describe('error handling', () => {
    it('returns unavailable envelope when the runtime cannot load', async () => {
      loadNativeBindingMock.mockImplementation(() => {
        throw new Error('ctx-rs runtime unavailable')
      })
      const mod = await import('./session-execute.js')

      const result = await mod.default.handler({ command: 'bad-command' })
      const payload = payloadOf(result)

      expect(payload.passed).toBe(false)
      expect(payload.summary).toMatch(/ctx-rs unavailable/i)
      expect(result.isError).toBe(true)
      expect(executeSandboxedMock).not.toHaveBeenCalled()
    })

    it('returns error envelope when executeSandboxed throws', async () => {
      executeSandboxedMock.mockRejectedValue(new Error('napi panic'))

      const result = await tool.handler({ command: 'bad-command' })
      const payload = payloadOf(result)

      expect(payload.passed).toBe(false)
      expect(result.isError).toBe(true)
    })

    it('returns error envelope when input is invalid', async () => {
      await expect(tool.handler({ command: '' })).rejects.toThrow()
    })
  })

  describe('output format', () => {
    it('returns a summary text block plus structuredContent payload', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 2, indexed: false, summary: 'ok' }),
      )

      const result = await tool.handler({ command: 'echo ok' })
      const payload = payloadOf(result)

      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toMatchObject({ type: 'text' })
      expect((result.content[0] as { text: string }).text).toBe(payload.summary)
    })
  })
})
