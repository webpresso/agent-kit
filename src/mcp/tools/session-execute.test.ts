/**
 * Tests for `ak_session_execute` MCP tool.
 *
 * Mocks:
 *   - node:child_process (spawnSync) — controls command output
 *   - #session-memory/store (getStore) — controls indexChunks + search
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
  signal?: string | null
}) {
  return {
    stdout: opts.stdout ?? '',
    stderr: opts.stderr ?? '',
    status: opts.exitCode ?? 0,
    signal: opts.signal ?? null,
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

describe('ak_session_execute', () => {
  let tool: Awaited<typeof import('./session-execute.js')>['default']

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./session-execute.js')
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
    expect(tool.name).toBe('ak_session_execute')
    expect(typeof tool.description).toBe('string')
    expect(tool.handler).toBeTypeOf('function')
  })

  describe('small output (≤ 2KB)', () => {
    it('returns passed result without indexing', async () => {
      const smallOutput = 'ok\n' // 3 bytes
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: smallOutput, exitCode: 0 }))

      const result = await tool.handler({ command: 'echo ok' })
      const payload = parsePayload(result)

      expect(payload.passed).toBe(true)
      expect(payload.summary).toMatch(/command succeeded/)
      const details = payload.details as Record<string, unknown>
      expect(details.indexed).toBe(false)
      expect(details.exitCode).toBe(0)
      expect(insertChunksMock).not.toHaveBeenCalled()
    })

    it('includes summary preview in details', async () => {
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'hello world\n', exitCode: 0 }))

      const result = await tool.handler({ command: 'echo hello world' })
      const payload = parsePayload(result)
      const details = payload.details as Record<string, unknown>

      expect(details.summary).toContain('hello world')
    })
  })

  describe('large output (> 2KB)', () => {
    it('indexes the output via ctx-rs store', async () => {
      const largeOutput = 'x'.repeat(3000)
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: largeOutput, exitCode: 0 }))

      const result = await tool.handler({ command: 'big-command', label: 'big-label' })
      const payload = parsePayload(result)
      const details = payload.details as Record<string, unknown>

      expect(details.indexed).toBe(true)
      expect(insertChunksMock).toHaveBeenCalledOnce()
      const [chunks] = insertChunksMock.mock.calls[0]!
      expect(chunks[0].source).toBe('big-label')
      expect(chunks[0].content).toBe(largeOutput)
    })

    it('uses command as label when label is not provided', async () => {
      const largeOutput = 'x'.repeat(3000)
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: largeOutput, exitCode: 0 }))

      await tool.handler({ command: 'my-command' })

      const [chunks] = insertChunksMock.mock.calls[0]!
      expect(chunks[0].source).toBe('my-command')
    })

    it('reports failed exit code when command fails', async () => {
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'x'.repeat(3000), exitCode: 1 }))

      const result = await tool.handler({ command: 'failing-cmd' })
      const payload = parsePayload(result)

      expect(payload.passed).toBe(false)
      expect(payload.summary).toMatch(/exit code 1/)
    })

    it('runs a query over indexed content when query is provided', async () => {
      const largeOutput = 'x'.repeat(3000)
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: largeOutput, exitCode: 0 }))
      const fakeHits = [{ content: 'x', source: 'lbl', rank: -1, tier: 'porter' }]
      searchMock.mockReturnValue(fakeHits)

      const result = await tool.handler({ command: 'cmd', label: 'lbl', query: 'x' })
      const payload = parsePayload(result)
      const details = payload.details as Record<string, unknown>

      expect(searchMock).toHaveBeenCalledOnce()
      expect(details.hits).toEqual(fakeHits)
    })

    it('does NOT run a query when output is small', async () => {
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'small', exitCode: 0 }))

      const result = await tool.handler({ command: 'cmd', query: 'something' })
      const payload = parsePayload(result)
      const details = payload.details as Record<string, unknown>

      expect(searchMock).not.toHaveBeenCalled()
      expect(details.hits).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('returns failed result without throwing when spawnSync throws', async () => {
      spawnSyncMock.mockImplementation(() => {
        throw new Error('ENOENT: sh not found')
      })

      // runCommandSync has its own try/catch: spawn errors surface as exitCode:1
      // so the outer handler never throws; result is a normal failed payload
      const result = await tool.handler({ command: 'bad-command' })
      const payload = parsePayload(result)

      expect(payload.passed).toBe(false)
      const details = payload.details as Record<string, unknown>
      expect(details.exitCode).toBe(1)
      // summary preview contains the spawn-error message
      expect(details.summary).toMatch(/spawn error/)
    })

    it('still returns output when indexing fails', async () => {
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'x'.repeat(3000), exitCode: 0 }))
      insertChunksMock.mockImplementation(() => {
        throw new Error('ctx-rs unavailable')
      })

      const result = await tool.handler({ command: 'cmd' })
      const payload = parsePayload(result)

      // indexing failed but command output is still returned
      expect(payload.passed).toBe(true)
      const details = payload.details as Record<string, unknown>
      expect(details.indexed).toBe(false)
    })

    it('returns error envelope when input is invalid', async () => {
      await expect(tool.handler({ command: '' })).rejects.toThrow()
    })
  })

  describe('output format', () => {
    it('returns MCP content array with text block', async () => {
      spawnSyncMock.mockReturnValue(fakeSpawnResult({ stdout: 'ok', exitCode: 0 }))

      const result = await tool.handler({ command: 'echo ok' })

      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toMatchObject({ type: 'text' })
      expect(result.structuredContent).toEqual(JSON.parse((result.content[0] as { text: string }).text))
    })
  })
})
