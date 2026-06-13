import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock session-memory modules to avoid SQLite in unit tests
vi.mock('#session-memory/store', () => ({
  getStore: vi.fn(() => ({
    insertChunks: vi.fn(),
    search: vi.fn(() => [
      { content: 'error: test failed', source: 'pnpm test', tier: 'porter', rank: -1.2 },
    ]),
  })),
}))
vi.mock('#session-memory/repo-hash', () => ({
  computeRepoHash: vi.fn(() => 'test-hash-execute'),
}))
vi.mock('#session-memory/session', () => ({
  resolveDbPath: vi.fn(() => '/tmp/test-execute.db'),
  captureEvent: vi.fn(() => true),
  restore: vi.fn(() => ({ hits: [], snapshotId: null })),
  snapshot: vi.fn(async () => ({ snapshotId: 'snap-1', eventsIncluded: 0, partial: false })),
}))
vi.mock('#session-memory/fetch-index', () => ({
  splitIntoChunks: vi.fn((text: string) => [text]),
  htmlToMarkdown: vi.fn((html: string) => html),
}))

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}))

import tool from './session-execute.js'
import { getStore } from '#session-memory/store'
import { execa } from 'execa'

const mockGetStore = vi.mocked(getStore)
const mockExeca = vi.mocked(execa)

/** Build a fake execa subprocess result. The returned object must:
 *  - have an `all` async iterable that yields the output string
 *  - be a Promise that resolves to { exitCode }
 */
function makeExecaResult(output: string, exitCode = 0) {
  async function* allIterable() {
    yield output
  }

  const promise = Promise.resolve({ exitCode }) as ReturnType<typeof execa>
  ;(promise as unknown as { all: AsyncIterable<string> }).all = allIterable()
  return promise
}

function makeExecaError(message: string) {
  return () => {
    throw new Error(message)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: successful command with small output
  mockExeca.mockReturnValue(makeExecaResult('hello world\n'))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ak_session_execute MCP tool', () => {
  it('has correct tool name', () => {
    expect(tool.name).toBe('ak_session_execute')
  })

  it('is NOT marked readOnly (it runs commands)', () => {
    expect(tool.annotations?.readOnlyHint).not.toBe(true)
  })

  it('returns summary for small output (< 2KB) without indexing', async () => {
    const smallOutput = 'small output\n'
    mockExeca.mockReturnValue(makeExecaResult(smallOutput))

    const result = await tool.handler({ command: 'echo hello' })
    const payload = JSON.parse(result.content[0]!.text!) as {
      label: string
      exitCode: number
      outputBytes: number
      indexed: boolean
      summary: string
    }

    expect(payload.label).toBe('echo hello')
    expect(payload.exitCode).toBe(0)
    expect(payload.indexed).toBe(false)
    expect(payload.summary).toBe(smallOutput)
    expect(mockGetStore).not.toHaveBeenCalled()
  })

  it('indexes large output (> 2KB) into session memory', async () => {
    const largeOutput = 'x'.repeat(3000)
    mockExeca.mockReturnValue(makeExecaResult(largeOutput))

    const result = await tool.handler({ command: 'big-command', label: 'my-big-cmd' })
    const payload = JSON.parse(result.content[0]!.text!) as {
      indexed: boolean
      label: string
    }

    expect(payload.indexed).toBe(true)
    expect(payload.label).toBe('my-big-cmd')
    expect(mockGetStore).toHaveBeenCalled()
    const mockStore = mockGetStore.mock.results[0]!.value as {
      insertChunks: ReturnType<typeof vi.fn>
    }
    expect(mockStore.insertChunks).toHaveBeenCalled()
  })

  it('uses label for FTS5 source when provided', async () => {
    const largeOutput = 'y'.repeat(3000)
    mockExeca.mockReturnValue(makeExecaResult(largeOutput))

    await tool.handler({ command: 'pnpm test', label: 'test-run' })

    const mockStore = mockGetStore.mock.results[0]!.value as {
      insertChunks: ReturnType<typeof vi.fn>
    }
    const chunks = mockStore.insertChunks.mock.calls[0]![0] as Array<{ source: string }>
    expect(chunks[0]!.source).toBe('test-run')
  })

  it('returns search hits when query is provided and output is large', async () => {
    const largeOutput = 'z'.repeat(3000)
    mockExeca.mockReturnValue(makeExecaResult(largeOutput))

    const result = await tool.handler({ command: 'pnpm test', query: 'error' })
    const payload = JSON.parse(result.content[0]!.text!) as {
      hits: Array<{ content: string; tier: string }>
    }

    expect(payload.hits).toBeDefined()
    expect(payload.hits!.length).toBeGreaterThan(0)
    expect(payload.hits![0]!.content).toContain('error')
  })

  it('does NOT run search query for small output (not indexed)', async () => {
    mockExeca.mockReturnValue(makeExecaResult('small'))

    const result = await tool.handler({ command: 'echo small', query: 'error' })
    const payload = JSON.parse(result.content[0]!.text!) as {
      indexed: boolean
      hits?: unknown
    }

    expect(payload.indexed).toBe(false)
    expect(payload.hits).toBeUndefined()
  })

  it('returns structured error envelope on exec failure', async () => {
    mockExeca.mockImplementation(makeExecaError('spawn ENOENT'))

    const result = await tool.handler({ command: 'nonexistent-command' })
    const payload = JSON.parse(result.content[0]!.text!) as {
      exitCode: number
      error: string
      indexed: boolean
    }

    expect(payload.exitCode).toBe(-1)
    expect(payload.error).toContain('spawn ENOENT')
    expect(payload.indexed).toBe(false)
  })

  it('includes stdout and stderr in combined output', async () => {
    const combined = 'stdout output\n--- stderr ---\nstderr error'
    mockExeca.mockReturnValue(makeExecaResult(combined, 1))

    const result = await tool.handler({ command: 'failing-cmd' })
    const payload = JSON.parse(result.content[0]!.text!) as {
      exitCode: number
      summary: string
    }

    expect(payload.exitCode).toBe(1)
    expect(payload.summary).toContain('stdout')
    expect(payload.summary).toContain('stderr')
  })

  it('summary is capped at 500 chars', async () => {
    const longOutput = 'a'.repeat(1000)
    mockExeca.mockReturnValue(makeExecaResult(longOutput))

    const result = await tool.handler({ command: 'echo long' })
    const payload = JSON.parse(result.content[0]!.text!) as { summary: string }

    expect(payload.summary.length).toBeLessThanOrEqual(500)
  })

  it('rejects empty command string', async () => {
    await expect(tool.handler({ command: '' })).rejects.toThrow()
  })

  it('auto-discovered — has default export with handler', async () => {
    const mod = await import('./session-execute.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.name).toBe('ak_session_execute')
    expect(typeof mod.default.handler).toBe('function')
  })
})
