import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock session-memory modules to avoid SQLite in unit tests
vi.mock('#session-memory/store', () => ({
  getStore: vi.fn(() => ({
    insertChunks: vi.fn(),
    search: vi.fn(() => [
      { content: 'error: test failed on line 42', source: 'test-suite', tier: 'porter', rank: -1.5 },
    ]),
  })),
}))
vi.mock('#session-memory/repo-hash', () => ({
  computeRepoHash: vi.fn(() => 'test-hash-batch'),
}))
vi.mock('#session-memory/session', () => ({
  resolveDbPath: vi.fn(() => '/tmp/test-batch.db'),
  captureEvent: vi.fn(() => true),
  restore: vi.fn(() => ({ hits: [], snapshotId: null })),
  snapshot: vi.fn(async () => ({ snapshotId: 'snap-1', eventsIncluded: 0, partial: false })),
}))
vi.mock('#session-memory/fetch-index', () => ({
  splitIntoChunks: vi.fn((text: string) => [text]),
  htmlToMarkdown: vi.fn((html: string) => html),
}))

// Mock child_process
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

import tool from './session-batch-execute.js'
import { getStore } from '#session-memory/store'
import { spawnSync } from 'node:child_process'

const mockGetStore = vi.mocked(getStore)
const mockSpawnSync = vi.mocked(spawnSync)

function makeSpawnResult(stdout: string, stderr = '', status = 0) {
  return {
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(stderr),
    status,
    error: undefined,
    pid: 1234,
    signal: null,
    output: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSpawnSync.mockReturnValue(makeSpawnResult('ok\n'))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ak_session_batch_execute MCP tool', () => {
  it('has correct tool name', () => {
    expect(tool.name).toBe('ak_session_batch_execute')
  })

  it('is NOT marked readOnly (it runs commands)', () => {
    expect(tool.annotations?.readOnlyHint).not.toBe(true)
  })

  it('runs all commands and returns results for each', async () => {
    mockSpawnSync
      .mockReturnValueOnce(makeSpawnResult('lint: OK\n', '', 0))
      .mockReturnValueOnce(makeSpawnResult('types: OK\n', '', 0))

    const result = await tool.handler({
      commands: [
        { label: 'lint', command: 'ak_lint' },
        { label: 'typecheck', command: 'ak_typecheck' },
      ],
    })
    const payload = JSON.parse(result.content[0]!.text!) as {
      results: Array<{ label: string; exitCode: number }>
      totalCommands: number
    }

    expect(payload.totalCommands).toBe(2)
    expect(payload.results).toHaveLength(2)
    expect(payload.results[0]!.label).toBe('lint')
    expect(payload.results[1]!.label).toBe('typecheck')
    expect(payload.results[0]!.exitCode).toBe(0)
  })

  it('does not index small outputs (< 2KB)', async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult('small output\n'))

    const result = await tool.handler({
      commands: [{ label: 'test', command: 'echo test' }],
    })
    const payload = JSON.parse(result.content[0]!.text!) as {
      results: Array<{ indexed: boolean }>
      totalIndexed: number
    }

    expect(payload.results[0]!.indexed).toBe(false)
    expect(payload.totalIndexed).toBe(0)
    expect(mockGetStore).not.toHaveBeenCalled()
  })

  it('indexes large outputs (> 2KB)', async () => {
    const largeOutput = 'x'.repeat(3000)
    mockSpawnSync.mockReturnValue(makeSpawnResult(largeOutput))

    const result = await tool.handler({
      commands: [{ label: 'big-test', command: 'pnpm test' }],
    })
    const payload = JSON.parse(result.content[0]!.text!) as {
      results: Array<{ indexed: boolean }>
      totalIndexed: number
    }

    expect(payload.results[0]!.indexed).toBe(true)
    expect(payload.totalIndexed).toBe(1)
    expect(mockGetStore).toHaveBeenCalled()
  })

  it('runs cross-command queries after indexing when queries provided', async () => {
    const largeOutput = 'y'.repeat(3000)
    mockSpawnSync.mockReturnValue(makeSpawnResult(largeOutput))

    const result = await tool.handler({
      commands: [{ label: 'test-suite', command: 'pnpm test' }],
      queries: ['error', 'failure'],
    })
    const payload = JSON.parse(result.content[0]!.text!) as {
      queryHits: Record<string, Array<{ content: string }>>
    }

    expect(payload.queryHits).toBeDefined()
    expect(payload.queryHits['error']).toBeDefined()
    expect(payload.queryHits['failure']).toBeDefined()
    expect(payload.queryHits['error']!.length).toBeGreaterThan(0)
  })

  it('does not run queries when nothing was indexed', async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult('small\n'))

    const result = await tool.handler({
      commands: [{ label: 'tiny', command: 'echo ok' }],
      queries: ['error'],
    })
    const payload = JSON.parse(result.content[0]!.text!) as {
      queryHits?: unknown
    }

    // queryHits should be absent when nothing was indexed
    expect(payload.queryHits).toBeUndefined()
  })

  it('returns error envelope for a spawning failure without crashing', async () => {
    mockSpawnSync.mockImplementation(() => {
      throw new Error('spawn ENOENT')
    })

    const result = await tool.handler({
      commands: [{ label: 'fail', command: 'nonexistent' }],
    })
    const payload = JSON.parse(result.content[0]!.text!) as {
      results: Array<{ exitCode: number; error?: string; indexed: boolean }>
    }

    expect(payload.results[0]!.exitCode).toBe(-1)
    expect(payload.results[0]!.error).toContain('spawn ENOENT')
    expect(payload.results[0]!.indexed).toBe(false)
  })

  it('respects concurrency parameter (runs batch in parallel)', async () => {
    mockSpawnSync
      .mockReturnValueOnce(makeSpawnResult('cmd1\n'))
      .mockReturnValueOnce(makeSpawnResult('cmd2\n'))
      .mockReturnValueOnce(makeSpawnResult('cmd3\n'))

    const result = await tool.handler({
      commands: [
        { label: 'a', command: 'cmd-a' },
        { label: 'b', command: 'cmd-b' },
        { label: 'c', command: 'cmd-c' },
      ],
      concurrency: 2,
    })
    const payload = JSON.parse(result.content[0]!.text!) as {
      totalCommands: number
      results: unknown[]
    }

    expect(payload.totalCommands).toBe(3)
    expect(payload.results).toHaveLength(3)
  })

  it('rejects empty commands array', async () => {
    await expect(tool.handler({ commands: [] })).rejects.toThrow()
  })

  it('auto-discovered — has default export with handler', async () => {
    const mod = await import('./session-batch-execute.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.name).toBe('ak_session_batch_execute')
    expect(typeof mod.default.handler).toBe('function')
  })
})
