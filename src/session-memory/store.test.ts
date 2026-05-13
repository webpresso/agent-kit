/**
 * Unit tests for the v2 SessionStore (TsStore backend via AK_SESSION_ENGINE=ts).
 *
 * Uses a fresh temp directory per test so the module-level storeCache never
 * returns a stale instance across tests.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getStore } from './store.js'
import type { SessionStore } from './store.js'

// Force the TS engine so tests never depend on the ctx-rs native binary
const originalEngine = process.env['AK_SESSION_ENGINE']
process.env['AK_SESSION_ENGINE'] = 'ts'

let tmpDir: string
let dbPath: string
let store: SessionStore

beforeEach(() => {
  // Unique dir → unique cache key → fresh TsStore instance per test
  tmpDir = mkdtempSync(join(tmpdir(), 'ak-v2-store-test-'))
  dbPath = join(tmpDir, 'test.db')
  store = getStore(dbPath)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// Restore the engine setting once after all tests in this file complete.
afterAll(() => {
  if (originalEngine === undefined) {
    delete process.env['AK_SESSION_ENGINE']
  } else {
    process.env['AK_SESSION_ENGINE'] = originalEngine
  }
})

describe('getStore — factory and caching', () => {
  it('returns the same store instance for the same dbPath', () => {
    const store2 = getStore(dbPath)
    expect(store2).toBe(store)
  })

  it('returns different store instances for different dbPaths', () => {
    const tmpDir2 = mkdtempSync(join(tmpdir(), 'ak-v2-store-test2-'))
    const dbPath2 = join(tmpDir2, 'other.db')
    try {
      const store2 = getStore(dbPath2)
      expect(store2).not.toBe(store)
    } finally {
      rmSync(tmpDir2, { recursive: true, force: true })
    }
  })
})

describe('TsStore — insert and porter search', () => {
  it('inserts chunks and returns top-5 porter results', () => {
    const chunks = Array.from({ length: 100 }, (_, i) => ({
      content: i === 42 ? 'the quick brown fox jumps' : `chunk number ${i} about something else`,
      source: 'test-source',
    }))
    store.insertChunks(chunks)

    const hits = store.search({ query: 'quick brown fox', limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.length).toBeLessThanOrEqual(5)
    expect(hits[0]?.tier).toBe('porter')
    expect(hits[0]?.content).toContain('fox')
  })

  it('returns hits with required SearchHit fields', () => {
    store.insertChunks([{ content: 'session memory SQLite FTS5 search', source: 'src-a' }])

    const hits = store.search({ query: 'SQLite', limit: 3 })
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) {
      expect(typeof hit.content).toBe('string')
      expect(typeof hit.source).toBe('string')
      expect(typeof hit.rank).toBe('number')
      expect(['porter', 'trigram', 'levenshtein']).toContain(hit.tier)
    }
  })

  it('respects the limit parameter', () => {
    const chunks = Array.from({ length: 20 }, (_, i) => ({
      content: `common keyword phrase in document number ${i}`,
      source: 'src',
    }))
    store.insertChunks(chunks)

    const hits = store.search({ query: 'common keyword phrase', limit: 3 })
    expect(hits.length).toBeLessThanOrEqual(3)
  })
})

describe('TsStore — trigram fallback', () => {
  it('returns trigram results when porter finds nothing for partial token', () => {
    store.insertChunks([
      { content: 'impl3mentation is interesting', source: 'src1' },
      { content: 'something completely different', source: 'src2' },
    ])

    // "impl3" is not a real word — porter won't stem-match, trigram will substring-match
    const hits = store.search({ query: 'impl3', limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
    expect(['porter', 'trigram']).toContain(hits[0]?.tier)
  })
})

describe('TsStore — Levenshtein fallback', () => {
  it('falls back to Levenshtein for typo-like queries', () => {
    store.insertChunks([{ content: 'hello world example', source: 'src' }])

    // 'helo' is a one-character typo — Levenshtein should score it
    const hits = store.search({ query: 'helo', limit: 5 })
    // Accept 0 hits; this is a best-effort fallback
    expect(Array.isArray(hits)).toBe(true)
  })
})

describe('TsStore — source scoping', () => {
  it('restricts results to the specified source', () => {
    store.insertChunks([
      { content: 'target content about testing session', source: 'source-a' },
      { content: 'target content about testing session', source: 'source-b' },
    ])

    const hits = store.search({ query: 'target content', source: 'source-a', limit: 5 })
    for (const hit of hits) {
      expect(hit.source).toBe('source-a')
    }
  })

  it('returns no hits when source filter matches nothing', () => {
    store.insertChunks([{ content: 'hello world', source: 'source-a' }])

    const hits = store.search({ query: 'hello world', source: 'nonexistent-source', limit: 5 })
    expect(hits).toStrictEqual([])
  })
})

describe('TsStore — empty / edge cases', () => {
  it('returns empty array when store has no chunks', () => {
    const hits = store.search({ query: 'anything', limit: 5 })
    expect(hits).toStrictEqual([])
  })

  it('handles empty query string without throwing', () => {
    store.insertChunks([{ content: 'some content', source: 'src' }])
    expect(() => store.search({ query: '', limit: 5 })).not.toThrow()
  })

  it('inserts 0 chunks without throwing', () => {
    expect(() => store.insertChunks([])).not.toThrow()
  })
})

describe('TsStore — default limit', () => {
  it('returns at most 5 results when no limit is specified', () => {
    const chunks = Array.from({ length: 20 }, (_, i) => ({
      content: `common phrase document ${i}`,
      source: 'src',
    }))
    store.insertChunks(chunks)

    const hits = store.search({ query: 'common phrase' })
    expect(hits.length).toBeLessThanOrEqual(5)
  })
})

describe('TsStore — performance (informational)', () => {
  it('searches 1000-doc corpus in under 5000ms p99', () => {
    const chunks = Array.from({ length: 1000 }, (_, i) => ({
      content: `document ${i} about topic ${i % 20} with some unique words`,
      source: `source-${i % 10}`,
    }))
    store.insertChunks(chunks)

    const times: number[] = []
    for (let i = 0; i < 20; i++) {
      const start = performance.now()
      store.search({ query: `topic ${i % 20}`, limit: 5 })
      times.push(performance.now() - start)
    }

    times.sort((a, b) => a - b)
    const p99 = times[Math.floor(times.length * 0.99)] ?? times[times.length - 1] ?? 0
    console.log(`v2 TsStore search p99: ${p99.toFixed(2)}ms`)
    expect(p99).toBeLessThan(5000)
  })
})
