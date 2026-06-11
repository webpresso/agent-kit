import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchAndIndex } from './fetch-index.js'
import { getStore } from './store.js'

const originalEngine = process.env['AK_SESSION_ENGINE']
process.env['AK_SESSION_ENGINE'] = 'ts'

let tmpDir: string
let dbPath: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ak-fetch-index-test-'))
  dbPath = join(tmpDir, 'memory.db')
  vi.restoreAllMocks()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

afterAll(() => {
  if (originalEngine === undefined) {
    delete process.env['AK_SESSION_ENGINE']
  } else {
    process.env['AK_SESSION_ENGINE'] = originalEngine
  }
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
    })

    expect(result.cached).toBe(false)
    expect(result.chunkCount).toBeGreaterThan(0)

    const hits = getStore(dbPath).search({ query: 'Session memory works', limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.content).toContain('Session memory works')
  })

  it('uses the sources cache to avoid refetching within the TTL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response('cached body', {
        headers: { 'content-type': 'text/plain' },
      }),
    )

    const first = await fetchAndIndex({
      url: 'https://example.test/cache',
      dbPath,
      cacheTtlMs: 60_000,
    })
    const second = await fetchAndIndex({
      url: 'https://example.test/cache',
      dbPath,
      cacheTtlMs: 60_000,
    })

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.chunkCount).toBe(0)
    expect(second.cachedAt).toBeTypeOf('number')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
