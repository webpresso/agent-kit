import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadNativeSessionMemoryEngine = vi.fn()

vi.mock('#session-memory/native-runtime', () => ({
  loadNativeSessionMemoryEngine,
}))

describe('test global setup', () => {
  beforeEach(() => {
    vi.resetModules()
    loadNativeSessionMemoryEngine.mockClear()
  })

  it('pre-warms the native session-memory engine before workers fork', async () => {
    const { setup } = await import('./global-setup.js')

    setup()

    expect(loadNativeSessionMemoryEngine).toHaveBeenCalledTimes(1)
  })
})
