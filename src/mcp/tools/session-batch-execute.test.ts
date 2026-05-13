/**
 * Tests for `ak_session_batch_execute` MCP tool.
 *
 * Mocks:
 *   - @webpresso/ctx-rs (executeSandboxed) — controls per-command execution + indexing
 *   - #session-memory/store (getStore)     — controls search
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const executeSandboxedMock = vi.hoisted(() => vi.fn())
const searchMock = vi.hoisted(() => vi.fn())
const getStoreMock = vi.hoisted(() =>
  vi.fn(() => ({
    insertChunks: vi.fn(),
    search: searchMock,
  })),
)

vi.mock('@webpresso/ctx-rs', () => ({
  executeSandboxed: executeSandboxedMock,
}))

vi.mock('#session-memory/store', () => ({
  getStore: getStoreMock,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    summary: opts.summary ?? 'ok',
  }
}

function parsePayload(result: { content: readonly { type: string; text?: string }[] }) {
  const block = result.content[0]
  if (!block || block.type !== 'text' || !block.text) throw new Error('no text block')
  return JSON.parse(block.text) as Record<string, unknown>
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ak_session_batch_execute', () => {
  let tool: Awaited<typeof import('./session-batch-execute.js')>['default']

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./session-batch-execute.js')
    tool = mod.default
  })

  afterEach(() => {
    executeSandboxedMock.mockReset()
    searchMock.mockReset()
    getStoreMock.mockReset()
    getStoreMock.mockReturnValue({ insertChunks: vi.fn(), search: searchMock })
  })

  it('exposes correct descriptor surface', () => {
    expect(tool.name).toBe('ak_session_batch_execute')
    expect(typeof tool.description).toBe('string')
    expect(tool.handler).toBeTypeOf('function')
  })

  describe('small output (not indexed)', () => {
    it('runs all commands and returns results without indexing', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 4, indexed: false }),
      )

      const result = await tool.handler({
        commands: [
          { label: 'cmd-a', command: 'echo a' },
          { label: 'cmd-b', command: 'echo b' },
        ],
      })
      const payload = parsePayload(result)

      expect(payload.passed).toBe(true)
      expect(payload.summary).toMatch(/all 2 commands succeeded/)
      const details = payload.details as { results: { indexed: boolean }[] }
      expect(details.results).toHaveLength(2)
      expect(details.results.every((r) => !r.indexed)).toBe(true)
    })
  })

  describe('large output (indexed)', () => {
    it('reports indexed=true per command when ctx-rs indexed them', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 3000, indexed: true }),
      )

      const result = await tool.handler({
        commands: [
          { label: 'big-a', command: 'cmd-a' },
          { label: 'big-b', command: 'cmd-b' },
        ],
      })
      const payload = parsePayload(result)
      const details = payload.details as { results: { indexed: boolean; label: string }[] }

      expect(details.results[0]!.indexed).toBe(true)
      expect(details.results[1]!.indexed).toBe(true)
      expect(executeSandboxedMock).toHaveBeenCalledTimes(2)
    })

    it('passes correct label to executeSandboxed for each command', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 3000, indexed: true }),
      )

      await tool.handler({
        commands: [
          { label: 'big-a', command: 'cmd-a' },
          { label: 'big-b', command: 'cmd-b' },
        ],
      })

      const labels = executeSandboxedMock.mock.calls.map((c) => c[2])
      expect(labels).toContain('big-a')
      expect(labels).toContain('big-b')
    })

    it('reports individual command failure while others pass', async () => {
      executeSandboxedMock
        .mockResolvedValueOnce(fakeExecuteResult({ exitCode: 0, outputBytes: 3000, indexed: true }))
        .mockResolvedValueOnce(fakeExecuteResult({ exitCode: 2, outputBytes: 3000, indexed: true }))

      const result = await tool.handler({
        commands: [
          { label: 'ok-cmd', command: 'cmd-a' },
          { label: 'fail-cmd', command: 'cmd-b' },
        ],
      })
      const payload = parsePayload(result)

      expect(payload.passed).toBe(false)
      expect(payload.summary).toMatch(/1 of 2 commands failed/)
      const details = payload.details as { results: { exitCode: number; label: string }[] }
      expect(details.results.find((r) => r.label === 'fail-cmd')?.exitCode).toBe(2)
    })
  })

  describe('query phase', () => {
    it('searches across indexed content when queries provided', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 3000, indexed: true }),
      )
      const fakeHits = [{ content: 'x', source: 'big-a', rank: -1, tier: 'porter' }]
      searchMock.mockReturnValue(fakeHits)

      const result = await tool.handler({
        commands: [{ label: 'big-a', command: 'cmd-a' }],
        queries: ['x patterns', 'y patterns'],
      })
      const payload = parsePayload(result)
      const details = payload.details as {
        queryHits?: Record<string, unknown[]>
      }

      expect(searchMock).toHaveBeenCalledTimes(2)
      expect(details.queryHits).toBeDefined()
      expect(details.queryHits!['x patterns']).toEqual(fakeHits)
      expect(details.queryHits!['y patterns']).toEqual(fakeHits)
    })

    it('skips query phase when no commands were indexed', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 50, indexed: false }),
      )

      const result = await tool.handler({
        commands: [{ label: 'small', command: 'echo tiny' }],
        queries: ['x'],
      })
      const payload = parsePayload(result)
      const details = payload.details as { queryHits?: unknown }

      expect(searchMock).not.toHaveBeenCalled()
      expect(details.queryHits).toBeUndefined()
    })

    it('omits queryHits from result when no queries provided', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 3000, indexed: true }),
      )

      const result = await tool.handler({
        commands: [{ label: 'big', command: 'cmd' }],
      })
      const payload = parsePayload(result)
      const details = payload.details as { queryHits?: unknown }

      expect(details.queryHits).toBeUndefined()
    })
  })

  describe('concurrency', () => {
    it('accepts concurrency override (max 8)', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 4, indexed: false }),
      )

      const result = await tool.handler({
        commands: [
          { label: 'a', command: 'echo a' },
          { label: 'b', command: 'echo b' },
          { label: 'c', command: 'echo c' },
        ],
        concurrency: 3,
      })
      const payload = parsePayload(result)

      expect(payload.passed).toBe(true)
      expect(executeSandboxedMock).toHaveBeenCalledTimes(3)
    })

    it('rejects concurrency > 8', async () => {
      await expect(
        tool.handler({
          commands: [{ label: 'x', command: 'echo x' }],
          concurrency: 9,
        }),
      ).rejects.toThrow()
    })
  })

  describe('error handling', () => {
    it('returns non-fatal result with indexed=false when executeSandboxed throws for one command', async () => {
      executeSandboxedMock.mockRejectedValue(new Error('napi panic'))

      const result = await tool.handler({
        commands: [{ label: 'x', command: 'cmd' }],
      })
      const payload = parsePayload(result)
      // executeSandboxed failure is caught per-command — command result shows exitCode -1
      const details = payload.details as { results: { indexed: boolean; exitCode: number }[] }
      expect(details.results[0]!.indexed).toBe(false)
      expect(details.results[0]!.exitCode).toBe(-1)
    })

    it('returns error envelope when input is invalid (empty commands array)', async () => {
      await expect(tool.handler({ commands: [] })).rejects.toThrow()
    })
  })

  describe('output format', () => {
    it('returns MCP content array with text block and structuredContent', async () => {
      executeSandboxedMock.mockResolvedValue(
        fakeExecuteResult({ exitCode: 0, outputBytes: 4, indexed: false }),
      )

      const result = await tool.handler({
        commands: [{ label: 'x', command: 'echo x' }],
      })

      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toMatchObject({ type: 'text' })
      expect(result.structuredContent).toEqual(
        JSON.parse((result.content[0] as { text: string }).text),
      )
    })
  })
})
