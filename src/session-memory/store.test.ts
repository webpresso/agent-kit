import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadCtxRsSyncMock = vi.hoisted(() => vi.fn())
const indexMock = vi.hoisted(() => vi.fn())
const searchMock = vi.hoisted(() => vi.fn())

vi.mock('./backend.js', () => ({
  loadCtxRsSync: loadCtxRsSyncMock,
}))

describe('ctx-rs SessionStore', () => {
  let getStore: Awaited<typeof import('./store.js')>['getStore']
  let clearStoreCache: Awaited<typeof import('./store.js')>['clearStoreCache']

  beforeEach(async () => {
    vi.resetModules()
    indexMock.mockReset()
    searchMock.mockReset()
    loadCtxRsSyncMock.mockReset()
    loadCtxRsSyncMock.mockReturnValue({
      index: indexMock,
      search: searchMock,
    })

    const mod = await import('./store.js')
    getStore = mod.getStore
    clearStoreCache = mod.clearStoreCache
    clearStoreCache()
  })

  it('caches store instances by dbPath', () => {
    const dbPath = join('/tmp', 'session-a.db')
    const first = getStore(dbPath)
    const second = getStore(dbPath)

    expect(second).toBe(first)
    expect(loadCtxRsSyncMock).toHaveBeenCalledTimes(1)
  })

  it('indexes each chunk through ctx-rs', () => {
    indexMock.mockReturnValue(undefined)
    const store = getStore(join('/tmp', 'session-a.db'))

    store.insertChunks([
      { source: 'alpha', content: 'one' },
      { source: 'beta', content: 'two' },
    ])

    expect(indexMock).toHaveBeenCalledTimes(2)
    expect(indexMock).toHaveBeenNthCalledWith(
      1,
      join('/tmp', 'session-a.db'),
      'alpha',
      'one',
      false,
    )
  })

  it('throws when ctx-rs reports unavailable during indexing', () => {
    indexMock.mockReturnValue({ status: 'unavailable' })
    const store = getStore(join('/tmp', 'session-b.db'))

    expect(() => store.insertChunks([{ source: 'alpha', content: 'one' }])).toThrow(
      /ctx-rs unavailable while indexing/i,
    )
  })

  it('maps ctx-rs search hits into SearchHit objects', () => {
    searchMock.mockReturnValue([{ content: 'memory hit', source: 'alpha', rank: -1 }])
    const store = getStore(join('/tmp', 'session-c.db'))

    expect(store.search({ query: 'memory' })).toEqual([
      { content: 'memory hit', source: 'alpha', rank: -1, tier: 'porter' },
    ])
    expect(searchMock).toHaveBeenCalledWith(join('/tmp', 'session-c.db'), 'memory', 5, null)
  })

  it('throws when ctx-rs reports unavailable during search', () => {
    searchMock.mockReturnValue({ status: 'unavailable' })
    const store = getStore(join('/tmp', 'session-d.db'))

    expect(() => store.search({ query: 'memory', limit: 3, source: 'alpha' })).toThrow(
      /ctx-rs unavailable during search/i,
    )
  })
})
