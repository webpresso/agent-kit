import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearFetchIndexCache, fetchAndIndex } from './fetch-index.js'
import { loadNativeSessionMemoryEngine } from './native-runtime.js'
import { getStore, resetStoreCacheForTests } from './store.js'

let tmpDir: string
let dbPath: string

beforeEach(() => {
  loadNativeSessionMemoryEngine()
  tmpDir = mkdtempSync(join(tmpdir(), 'wp-native-fetch-test-'))
  dbPath = join(tmpDir, 'memory.db')
})

afterEach(() => {
  clearFetchIndexCache()
  resetStoreCacheForTests()
  vi.restoreAllMocks()
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
})

describe('fetchAndIndex', () => {
  it('indexes fetched HTML as searchable markdown text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><body><h1>Hello</h1><p>Session memory works</p></body></html>', {
        headers: { 'content-type': 'text/html' },
      }),
    )

    const result = await fetchAndIndex({
      url: 'https://example.test/docs',
      dbPath,
      cacheTtlMs: 60_000,
      fetchImpl: globalThis.fetch,
    })
    expect(result.cached).toBe(false)
    const hits = getStore(dbPath).search({ query: 'Session memory works', limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
  })

  it('indexes JSON as structured text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"name":"native session memory"}', {
        headers: { 'content-type': 'application/json' },
      }),
    )

    await fetchAndIndex({
      url: 'https://example.test/data',
      dbPath,
      cacheTtlMs: 60_000,
      fetchImpl: globalThis.fetch,
    })
    const hits = getStore(dbPath).search({ query: 'native session memory', limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
  })

  it('uses the in-process TTL cache', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('cached body', { headers: { 'content-type': 'text/plain' } }))

    const first = await fetchAndIndex({
      url: 'https://example.test/cache#one',
      dbPath,
      cacheTtlMs: 60_000,
      fetchImpl: globalThis.fetch,
    })
    const second = await fetchAndIndex({
      url: 'https://example.test/cache#two',
      dbPath,
      cacheTtlMs: 60_000,
      fetchImpl: globalThis.fetch,
    })
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('reuses cached fetch content while still indexing into a second db target', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('shared cached body', { headers: { 'content-type': 'text/plain' } }),
      )
    const secondDir = mkdtempSync(join(tmpdir(), 'wp-native-fetch-test-b-'))
    const secondDbPath = join(secondDir, 'memory.db')

    try {
      await fetchAndIndex({
        url: 'https://example.test/shared-cache',
        dbPath,
        cacheTtlMs: 60_000,
        fetchImpl: globalThis.fetch,
      })
      await fetchAndIndex({
        url: 'https://example.test/shared-cache',
        dbPath: secondDbPath,
        cacheTtlMs: 60_000,
        fetchImpl: globalThis.fetch,
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(
        getStore(secondDbPath).search({ query: 'shared cached body', limit: 5 }).length,
      ).toBeGreaterThan(0)
    } finally {
      resetStoreCacheForTests()
      rmSync(secondDir, { recursive: true, force: true })
    }
  })
})
