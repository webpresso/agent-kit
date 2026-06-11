import { describe, expect, it, vi, afterEach } from 'vitest'

vi.mock('#session-memory/session', () => ({
  restore: vi.fn(() => ({
    hits: [
      {
        content: 'session memory implementation',
        source: 'session:snap1',
        tier: 'porter',
        rank: -1,
      },
      { content: 'SQLite FTS5 store', source: 'session:snap1', tier: 'porter', rank: -0.8 },
    ],
    snapshotId: 'snap-001',
  })),
}))
vi.mock('#session-memory/repo-hash', () => ({
  computeRepoHash: vi.fn(() => 'test-hash-restore'),
}))

import tool from './session-restore.js'
import { restore } from '#session-memory/session'

const mockRestore = vi.mocked(restore)

afterEach(() => {
  vi.clearAllMocks()
})

describe('ak_session_restore MCP tool', () => {
  it('has correct tool name', () => {
    expect(tool.name).toBe('ak_session_restore')
  })

  it('returns session_knowledge XML block for non-empty hits', async () => {
    const result = await tool.handler({ query: 'session memory' })
    const payload = JSON.parse(result.content[0]!.text!) as {
      sessionKnowledge: string
      hitCount: number
      snapshotId: string | null
    }
    expect(payload.hitCount).toBe(2)
    expect(payload.sessionKnowledge).toContain('<session_knowledge')
    expect(payload.sessionKnowledge).toContain('</session_knowledge>')
    expect(payload.snapshotId).toBe('snap-001')
  })

  it('returns empty sessionKnowledge when no hits', async () => {
    mockRestore.mockReturnValueOnce({ hits: [], snapshotId: null })
    const result = await tool.handler({ query: 'nothing here' })
    const payload = JSON.parse(result.content[0]!.text!) as {
      sessionKnowledge: string
      hitCount: number
    }
    expect(payload.sessionKnowledge).toBe('')
    expect(payload.hitCount).toBe(0)
  })

  it('rejects empty query', async () => {
    await expect(tool.handler({ query: '' })).rejects.toThrow()
  })

  it('HTML-escapes content in sessionKnowledge', async () => {
    mockRestore.mockReturnValueOnce({
      hits: [{ content: '<script>evil</script>', source: 'src', tier: 'porter', rank: -1 }],
      snapshotId: 'snap',
    })
    const result = await tool.handler({ query: 'evil' })
    const payload = JSON.parse(result.content[0]!.text!) as { sessionKnowledge: string }
    expect(payload.sessionKnowledge).not.toContain('<script>')
    expect(payload.sessionKnowledge).toContain('&lt;script&gt;')
  })
})
