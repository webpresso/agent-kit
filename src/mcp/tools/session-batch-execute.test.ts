/**
 * Tests for `ak_session_batch_execute` MCP tool.
 *
 * Mocks:
 *   - node:child_process (spawnSync) — controls per-command output
 *   - #session-memory/store (getStore) — controls insertChunks + search
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const spawnSyncMock = vi.hoisted(() => vi.fn())
const insertChunksMock = vi.hoisted(() => vi.fn())
const searchMock = vi.hoisted(() => vi.fn())
const getStoreMock = vi.hoisted(() =>
  vi.fn(() => ({
    insertChunks: insertChunksMock,
    search: searchMock,
  })),
)

vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock,
}))

vi.mock('#session-memory/store', () => ({
  getStore: getStoreMock,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function fakeSpawnResult(opts: {
  stdout?: string
  stderr?: string
  exitCode?: number
}) {
  return {
    stdout: opts.stdout ?? '',
    stderr: opts.stderr ?? '',
    status: opts.exitCode ?? 0,
    signal: null,
    pid: 12345,
    output: [],
    error: undefined,
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
    spawnSyncMock.mockReset()
    insertChunksMock.mockReset()
    searchMock.mockReset()
    getStoreMock.mockReset()
    getStoreMock.mockReturnValue({ insertChunks: insertChunksMock, search: searchMock })
  })

  it('exposes correct descriptor surface', () => {
    expect(tool.name).toBe('ak_session_batch_execute')
    expect(typeof tool.description).toBe('string')
    expect(tool.handler).toBeTypeOf('function')
  })

  describe('small output (≤ 2KB)', () => {
    it('runs all commands and returns results without indexing', async () => {
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'ok\n', exitCode: 0 }))

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
      expect(insertChunksMock).not.toHaveBeenCalled()
    })
  })

  describe('large output (> 2KB)', () => {
    it('indexes each large-output command separately', async () => {
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'x'.repeat(3000), exitCode: 0 }))

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
      expect(insertChunksMock).toHaveBeenCalledTimes(2)
      const call0 = insertChunksMock.mock.calls[0]![0]
      expect(call0[0].source).toBe('big-a')
    })

    it('reports individual command failure while others pass', async () => {
      spawnSyncMock
        .mockReturnValueOnce(fakeSpawnResult({ stdout: 'x'.repeat(3000), exitCode: 0 }))
        .mockReturnValueOnce(fakeSpawnResult({ stdout: 'x'.repeat(3000), exitCode: 2 }))

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
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'x'.repeat(3000), exitCode: 0 }))
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
      // small output — nothing indexed
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'tiny', exitCode: 0 }))

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
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'x'.repeat(3000), exitCode: 0 }))

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
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'ok', exitCode: 0 }))

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
      expect(spawnSyncMock).toHaveBeenCalledTimes(3)
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
    it('returns error envelope without throwing when getStore throws', async () => {
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'x'.repeat(3000), exitCode: 0 }))
      // Make ALL store interactions throw (incl. initial getStore resolution)
      getStoreMock.mockImplementation(() => {
        throw new Error('db locked')
      })

      const result = await tool.handler({
        commands: [{ label: 'x', command: 'cmd' }],
      })
      // indexing failure is non-fatal; command still succeeds
      const payload = parsePayload(result)
      expect(payload.passed).toBe(true)
      const details = payload.details as { results: { indexed: boolean }[] }
      expect(details.results[0]!.indexed).toBe(false)
    })

    it('returns error envelope when input is invalid (empty commands array)', async () => {
      await expect(tool.handler({ commands: [] })).rejects.toThrow()
    })
  })

  describe('output format', () => {
    it('returns MCP content array with text block and structuredContent', async () => {
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'ok', exitCode: 0 }))

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
