import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadCtxRsSyncMock = vi.hoisted(() => vi.fn())
const searchMock = vi.hoisted(() => vi.fn())
const getStoreMock = vi.hoisted(() => vi.fn(() => ({ search: searchMock })))

vi.mock('./backend.js', () => ({
  loadCtxRsSync: loadCtxRsSyncMock,
}))

vi.mock('./store.js', () => ({
  getStore: getStoreMock,
}))

const TEST_REPO_HASH = 'abc123def456abc1'

describe('session-memory primitives', () => {
  let captureEvent: Awaited<typeof import('./session.js')>['captureEvent']
  let snapshot: Awaited<typeof import('./session.js')>['snapshot']
  let restore: Awaited<typeof import('./session.js')>['restore']
  let resolveDbPath: Awaited<typeof import('./session.js')>['resolveDbPath']

  beforeEach(async () => {
    vi.resetModules()
    loadCtxRsSyncMock.mockReset()
    searchMock.mockReset()
    getStoreMock.mockReset()
    getStoreMock.mockReturnValue({ search: searchMock })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const fakeCtxRs = {
      captureEvent: vi.fn(() => undefined),
      snapshot: vi.fn(() => ({ snapshotId: 'snap-1', eventCount: 2, complete: true })),
      restore: vi.fn(() => [
        {
          sessionId: 'session-001',
          eventId: 'event-001',
          ts: 1,
          toolName: 'Edit',
          content: 'restored content',
        },
      ]),
    }
    loadCtxRsSyncMock.mockReturnValue(fakeCtxRs)
    searchMock.mockReturnValue([
      { content: 'restored content', source: 'decision', rank: -1, tier: 'porter' },
    ])

    const mod = await import('./session.js')
    captureEvent = mod.captureEvent
    snapshot = mod.snapshot
    restore = mod.restore
    resolveDbPath = mod.resolveDbPath
  })

  it('resolves db paths under the provided session directory', () => {
    expect(resolveDbPath(TEST_REPO_HASH, '/tmp/sessions')).toBe('/tmp/sessions/abc123def456abc1.db')
  })

  it('captures a tool event through ctx-rs', () => {
    const result = captureEvent(
      {
        repoHash: TEST_REPO_HASH,
        event: {
          sessionId: 'session-001',
          toolName: 'Edit',
          content: 'Edited file foo.ts',
        },
      },
      '/tmp/sessions',
    )

    expect(result).toBe(true)
    const fakeCtxRs = loadCtxRsSyncMock.mock.results[0]!.value as {
      captureEvent: ReturnType<typeof vi.fn>
    }
    expect(fakeCtxRs.captureEvent).toHaveBeenCalledOnce()
    const [dbPath, sessionId, eventId, toolName, content] = fakeCtxRs.captureEvent.mock.calls[0]!
    expect(dbPath).toBe('/tmp/sessions/abc123def456abc1.db')
    expect(sessionId).toBe('session-001')
    expect(typeof eventId).toBe('string')
    expect(toolName).toBe('Edit')
    expect(content).toBe('Edited file foo.ts')
  })

  it('returns false and logs when ctx-rs cannot be loaded for capture', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    loadCtxRsSyncMock.mockImplementation(() => {
      throw new Error('ctx-rs missing')
    })
    const mod = await import('./session.js')

    expect(
      mod.captureEvent({
        repoHash: TEST_REPO_HASH,
        event: { sessionId: 'session-001', toolName: 'Edit', content: 'x' },
      }),
    ).toBe(false)
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/ctx-rs missing/))
  })

  it('maps snapshot results', async () => {
    const result = await snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, '/tmp/sessions')

    expect(result).toEqual({ snapshotId: 'snap-1', eventsIncluded: 2, partial: false })
  })

  it('returns a partial placeholder snapshot on error', async () => {
    loadCtxRsSyncMock.mockImplementation(() => {
      throw new Error('ctx-rs missing')
    })
    const mod = await import('./session.js')

    const result = await mod.snapshot({ repoHash: TEST_REPO_HASH, capMs: 5000 }, '/tmp/sessions')

    expect(result.eventsIncluded).toBe(0)
    expect(result.partial).toBe(true)
  })

  it('restores hits and latest session id', () => {
    const result = restore({ repoHash: TEST_REPO_HASH, query: 'memory', limit: 5 }, '/tmp/sessions')

    expect(getStoreMock).toHaveBeenCalledWith('/tmp/sessions/abc123def456abc1.db')
    expect(searchMock).toHaveBeenCalledWith({ query: 'memory', limit: 5 })
    expect(result).toEqual({
      hits: [{ content: 'restored content', source: 'decision', rank: -1, tier: 'porter' }],
      snapshotId: 'session-001',
    })
  })

  it('returns empty restore results when ctx-rs is unavailable', async () => {
    loadCtxRsSyncMock.mockImplementation(() => {
      throw new Error('ctx-rs missing')
    })
    const mod = await import('./session.js')

    expect(mod.restore({ repoHash: TEST_REPO_HASH, query: 'memory' })).toEqual({
      hits: [],
      snapshotId: null,
    })
  })
})
