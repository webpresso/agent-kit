import { describe, expect, it, vi, afterEach } from 'vitest'

// Mock session-memory modules to avoid SQLite in unit tests
vi.mock('#session-memory/session', () => ({
  restore: vi.fn(() => ({
    hits: [
      { content: 'session memory SQLite store', source: 'session:snap1', tier: 'porter', rank: -1.5 },
    ],
    snapshotId: 'snap-001',
  })),
}))
vi.mock('#session-memory/repo-hash', () => ({
  computeRepoHash: vi.fn(() => 'test-hash-search'),
}))

import tool from './session-search.js'
import { restore } from '#session-memory/session'

const mockRestore = vi.mocked(restore)

afterEach(() => {
  vi.clearAllMocks()
})

describe('ak_session_search MCP tool', () => {
  it('has correct tool name', () => {
    expect(tool.name).toBe('ak_session_search')
  })

  it('is marked readOnly', () => {
    expect(tool.annotations?.readOnlyHint).toBe(true)
  })

  it('returns structured hits for a valid query', async () => {
    const result = await tool.handler({ query: 'session memory SQLite' })
    expect(result.content[0]?.type).toBe('text')
    const payload = JSON.parse(result.content[0]!.text!) as {
      query: string
      hits: unknown[]
      hitCount: number
      snapshotId: string | null
    }
    expect(payload.query).toBe('session memory SQLite')
    expect(payload.hitCount).toBe(1)
    expect(payload.hits[0]).toMatchObject({
      content: 'session memory SQLite store',
      tier: 'porter',
    })
  })

  it('returns empty hits when restore finds nothing', async () => {
    mockRestore.mockReturnValueOnce({ hits: [], snapshotId: null })
    const result = await tool.handler({ query: 'nonexistent query' })
    const payload = JSON.parse(result.content[0]!.text!) as {
      hitCount: number
      snapshotId: null
    }
    expect(payload.hitCount).toBe(0)
    expect(payload.snapshotId).toBeNull()
  })

  it('rejects empty query string', async () => {
    await expect(tool.handler({ query: '' })).rejects.toThrow()
  })

  it('auto-discovered — no manual registration needed (has default export)', async () => {
    const mod = await import('./session-search.js')
    expect(mod.default).toBeDefined()
    expect(mod.default.name).toBe('ak_session_search')
    expect(typeof mod.default.handler).toBe('function')
  })
})
