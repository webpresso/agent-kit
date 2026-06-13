import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadNativeSessionMemoryEngine } from './native-runtime.js'
import { getStore, resetStoreCacheForTests } from './store.js'
import type { SessionStore } from './store.js'

let tmpDir: string
let dbPath: string
let store: SessionStore

beforeEach(() => {
  loadNativeSessionMemoryEngine()
  tmpDir = mkdtempSync(join(tmpdir(), 'wp-native-store-test-'))
  dbPath = join(tmpDir, 'memory.db')
  store = getStore(dbPath)
})

afterEach(() => {
  resetStoreCacheForTests()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('native session-memory store', () => {
  it('returns the same cached store per dbPath', () => {
    expect(getStore(dbPath)).toBe(store)
  })

  it('indexes chunks and returns porter matches', () => {
    store.insertChunks(
      Array.from({ length: 20 }, (_, index) => ({
        source: 'notes',
        content: index < 5 ? `session memory fox ${index}` : `other content ${index}`,
      })),
    )
    const hits = store.search({ query: 'session memory fox', limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.tier).toBe('porter')
  })

  it('surfaces trigram fallback hits for partial tokens', () => {
    store.insertChunks([{ source: 'partial', content: 'alphabet soup and session memory' }])
    const hits = store.search({ query: 'alphab', limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
    expect(['porter', 'trigram']).toContain(hits[0]?.tier)
  })

  it('surfaces levenshtein fallback hits for typos', () => {
    store.insertChunks([{ source: 'typo', content: 'contextual memory restores state' }])
    const hits = store.search({ query: 'memry', limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
    expect(['porter', 'trigram', 'levenshtein']).toContain(hits[0]?.tier)
  })

  it('respects source scoping', () => {
    store.insertChunks([
      { source: 'a', content: 'shared restore context for source a' },
      { source: 'b', content: 'shared restore context for source b' },
    ])
    const hits = store.search({ query: 'restore context', source: 'a', limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.source === 'a')).toBe(true)
  })
})
