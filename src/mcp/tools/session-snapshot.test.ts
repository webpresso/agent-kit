import { describe, expect, it, vi, afterEach } from 'vitest'

vi.mock('#session-memory/session', () => ({
  snapshot: vi.fn(async () => ({
    snapshotId: 'snap-uuid-001',
    eventsIncluded: 5,
    partial: false,
  })),
}))
vi.mock('#session-memory/repo-hash', () => ({
  computeRepoHash: vi.fn(() => 'test-hash-snap'),
}))

import tool from './session-snapshot.js'
import { snapshot } from '#session-memory/session'

const mockSnapshot = vi.mocked(snapshot)

afterEach(() => {
  vi.clearAllMocks()
})

describe('ak_session_snapshot MCP tool', () => {
  it('has correct tool name', () => {
    expect(tool.name).toBe('ak_session_snapshot')
  })

  it('returns snapshotId and eventsIncluded', async () => {
    const result = await tool.handler({})
    const payload = JSON.parse(result.content[0]!.text!) as {
      snapshotId: string
      eventsIncluded: number
      partial: boolean
    }
    expect(payload.snapshotId).toBe('snap-uuid-001')
    expect(payload.eventsIncluded).toBe(5)
    expect(payload.partial).toBe(false)
  })

  it('snapshot id is usable for ak_session_restore', async () => {
    const result = await tool.handler({})
    const payload = JSON.parse(result.content[0]!.text!) as { snapshotId: string }
    expect(typeof payload.snapshotId).toBe('string')
    expect(payload.snapshotId.length).toBeGreaterThan(0)
  })

  it('passes capMs to snapshot', async () => {
    await tool.handler({ capMs: 3000 })
    expect(mockSnapshot).toHaveBeenCalledWith(expect.objectContaining({ capMs: 3000 }))
  })

  it('partial snapshot is surfaced correctly', async () => {
    mockSnapshot.mockResolvedValueOnce({
      snapshotId: 'partial-snap',
      eventsIncluded: 2,
      partial: true,
    })
    const result = await tool.handler({})
    const payload = JSON.parse(result.content[0]!.text!) as { partial: boolean }
    expect(payload.partial).toBe(true)
  })
})
