import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadNativeSessionMemoryEngine = vi.fn(() => {
  throw new Error('native session-memory engine build failed')
})

vi.mock('./native-runtime.js', () => ({
  loadNativeSessionMemoryEngine,
}))

describe('session-memory native failure surfacing', () => {
  beforeEach(() => {
    vi.resetModules()
    loadNativeSessionMemoryEngine.mockClear()
  })

  it('does not silently swallow capture bootstrap failures', async () => {
    const { captureEvent } = await import('./session.js')

    expect(() =>
      captureEvent({
        repoHash: 'repo-hash',
        event: {
          toolName: 'Edit',
          content: 'important content',
        },
      }),
    ).toThrow('native session-memory engine build failed')
  })

  it('does not silently treat restore bootstrap failures as empty results', async () => {
    const { restore } = await import('./session.js')

    expect(() =>
      restore({
        repoHash: 'repo-hash',
        query: 'important content',
      }),
    ).toThrow('native session-memory engine build failed')
  })
})
