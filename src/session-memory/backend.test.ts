import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveBackend, setCtxRsSyncLoaderForTests, tryLoadCtxRsSync } from './backend.js'

describe('resolveBackend', () => {
  afterEach(() => {
    delete process.env['AK_DISABLE_CTX']
    delete process.env['AK_SESSION_ENGINE']
  })

  it('defaults to ctx-rs', () => {
    expect(resolveBackend()).toBe('ctx-rs')
  })

  it('prefers AK_DISABLE_CTX over AK_SESSION_ENGINE', () => {
    process.env['AK_DISABLE_CTX'] = '1'
    process.env['AK_SESSION_ENGINE'] = 'ctx-rs'

    expect(resolveBackend()).toBe('ts')
  })

  it('accepts explicit engine overrides', () => {
    process.env['AK_SESSION_ENGINE'] = 'ts'
    expect(resolveBackend()).toBe('ts')

    process.env['AK_SESSION_ENGINE'] = 'ctx-rs'
    expect(resolveBackend()).toBe('ctx-rs')
  })
})

describe('tryLoadCtxRsSync', () => {
  afterEach(() => {
    delete process.env['AK_DISABLE_CTX']
    delete process.env['AK_SESSION_ENGINE']
    setCtxRsSyncLoaderForTests(null)
    vi.restoreAllMocks()
  })

  it('returns null without touching the loader when TS backend is forced', () => {
    process.env['AK_SESSION_ENGINE'] = 'ts'
    const loader = vi.fn(() => {
      throw new Error('should not load ctx-rs')
    })
    setCtxRsSyncLoaderForTests(loader)

    expect(tryLoadCtxRsSync()).toBeNull()
    expect(loader).not.toHaveBeenCalled()
  })

  it('returns the module when the native binding is available', () => {
    const module = {
      loadNativeBinding: vi.fn(() => ({ loaded: true })),
      index: vi.fn(),
      search: vi.fn(),
      fetchAndIndex: vi.fn(),
      captureEvent: vi.fn(),
      snapshot: vi.fn(),
      restore: vi.fn(),
      executeSandboxed: vi.fn(),
    }
    setCtxRsSyncLoaderForTests(() => module)

    expect(tryLoadCtxRsSync()).toBe(module)
    expect(module.loadNativeBinding).toHaveBeenCalledTimes(1)
  })

  it('returns null when the native binding reports unavailable', () => {
    const module = {
      loadNativeBinding: vi.fn(() => null),
      index: vi.fn(),
      search: vi.fn(),
      fetchAndIndex: vi.fn(),
      captureEvent: vi.fn(),
      snapshot: vi.fn(),
      restore: vi.fn(),
      executeSandboxed: vi.fn(),
    }
    setCtxRsSyncLoaderForTests(() => module)

    expect(tryLoadCtxRsSync()).toBeNull()
    expect(module.loadNativeBinding).toHaveBeenCalledTimes(1)
  })

  it('logs and returns null when loading throws', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    setCtxRsSyncLoaderForTests(() => {
      throw new Error('native module missing')
    })

    expect(tryLoadCtxRsSync()).toBeNull()
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('ak-session-memory: ctx-rs load error: native module missing\n'),
    )
  })
})
