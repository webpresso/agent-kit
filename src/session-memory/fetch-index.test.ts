import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadCtxRsSyncMock = vi.hoisted(() => vi.fn())
const fetchAndIndexMock = vi.hoisted(() => vi.fn())

vi.mock('./backend.js', () => ({
  loadCtxRsSync: loadCtxRsSyncMock,
}))

describe('fetchAndIndex', () => {
  let fetchAndIndex: Awaited<typeof import('./fetch-index.js')>['fetchAndIndex']

  beforeEach(async () => {
    vi.resetModules()
    fetchAndIndexMock.mockReset()
    loadCtxRsSyncMock.mockReset()
    loadCtxRsSyncMock.mockReturnValue({ fetchAndIndex: fetchAndIndexMock })
    const mod = await import('./fetch-index.js')
    fetchAndIndex = mod.fetchAndIndex
  })

  it('delegates fetch+index work to ctx-rs', async () => {
    fetchAndIndexMock.mockResolvedValue({ url: 'https://example.com/a', chunkCount: 3 })

    await expect(
      fetchAndIndex({ url: 'https://example.com/a', dbPath: '/tmp/session.db' }),
    ).resolves.toEqual({
      url: 'https://example.com/a',
      chunkCount: 3,
      cached: false,
    })

    expect(fetchAndIndexMock).toHaveBeenCalledWith('/tmp/session.db', 'https://example.com/a')
  })

  it('throws loudly when ctx-rs reports unavailable', async () => {
    fetchAndIndexMock.mockResolvedValue({ status: 'unavailable' })

    await expect(
      fetchAndIndex({ url: 'https://example.com/a', dbPath: '/tmp/session.db' }),
    ).rejects.toThrow(/ctx-rs unavailable for fetchAndIndex/i)
  })

  it('throws when the ctx-rs loader fails', async () => {
    loadCtxRsSyncMock.mockImplementation(() => {
      throw new Error('ctx-rs missing')
    })
    const mod = await import('./fetch-index.js')

    await expect(
      mod.fetchAndIndex({ url: 'https://example.com/a', dbPath: '/tmp/session.db' }),
    ).rejects.toThrow(/ctx-rs missing/i)
  })
})
