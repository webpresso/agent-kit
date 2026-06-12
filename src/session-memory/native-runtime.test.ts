import { describe, expect, it } from 'vitest'

import { loadNativeSessionMemoryEngine } from './native-runtime.js'

describe('loadNativeSessionMemoryEngine', () => {
  it('builds and loads the native session-memory engine', () => {
    const runtime = loadNativeSessionMemoryEngine()
    expect(typeof runtime.index).toBe('function')
    expect(typeof runtime.search).toBe('function')
    expect(typeof runtime.captureEvent).toBe('function')
    expect(typeof runtime.flushEvents).toBe('function')
    expect(typeof runtime.snapshot).toBe('function')
    expect(typeof runtime.restore).toBe('function')
    expect(typeof runtime.executeSandboxed).toBe('function')
  })
})
