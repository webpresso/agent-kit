import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadNativeBindingMock = vi.hoisted(() => vi.fn())

vi.mock('./ctx-rs-runtime.js', () => ({
  loadNativeBinding: loadNativeBindingMock,
}))

describe('session-memory backend loader', () => {
  beforeEach(() => {
    vi.resetModules()
    loadNativeBindingMock.mockReset()
  })

  it('returns the ctx-rs binding when the native binding loads', async () => {
    const fakeBinding = { search: vi.fn() }
    loadNativeBindingMock.mockReturnValue(fakeBinding)

    const mod = await import('./backend.js')

    expect(mod.tryLoadCtxRsSync()).toBe(fakeBinding)
    expect(mod.loadCtxRsSync()).toBe(fakeBinding)
    expect(loadNativeBindingMock).toHaveBeenCalledTimes(2)
  })

  it('returns null and throws loudly when the native binding is unavailable', async () => {
    loadNativeBindingMock.mockImplementation(() => {
      throw new Error('ctx-rs runtime unavailable')
    })

    const mod = await import('./backend.js')

    expect(mod.tryLoadCtxRsSync()).toBeNull()
    expect(() => mod.loadCtxRsSync()).toThrow(/vendored ctx-rs runtime/i)
  })

  it('returns null when the vendored loader throws', async () => {
    loadNativeBindingMock.mockImplementation(() => {
      throw new Error('missing runtime')
    })

    const mod = await import('./backend.js')

    expect(mod.tryLoadCtxRsSync()).toBeNull()
  })
})
