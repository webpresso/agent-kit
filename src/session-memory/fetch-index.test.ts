import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearFetchIndexCache, fetchAndIndex } from './fetch-index.js'
import { SessionMemoryStore } from './store.js'

const dirs: string[] = []
function store(): SessionMemoryStore {
  const dir = mkdtempSync(join(tmpdir(), 'ak-fetch-index-'))
  dirs.push(dir)
  return new SessionMemoryStore(join(dir, 'memory.sqlite'))
}
function response(body: string, contentType: string): Response {
  return new Response(body, { headers: { 'content-type': contentType } })
}

afterEach(() => {
  clearFetchIndexCache()
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('fetchAndIndex', () => {
  it('fetches HTML, converts it to markdown-ish chunks, and indexes it', async () => {
    const s = store()
    await fetchAndIndex({
      url: 'https://example.com/a#frag',
      store: s,
      fetchImpl: vi.fn(async () => response('<h1>Hello</h1><p>session memory</p>', 'text/html')),
    })
    expect(s.search({ query: 'session', limit: 1 })[0]?.text).toContain('session memory')
    s.close()
  })

  it('fetches JSON as structured chunks and indexes it', async () => {
    const s = store()
    await fetchAndIndex({
      url: 'https://example.com/data',
      store: s,
      fetchImpl: vi.fn(async () => response('{"name":"memory"}', 'application/json')),
    })
    expect(s.search({ query: 'memory', limit: 1 })[0]?.text).toContain('memory')
    s.close()
  })

  it('uses a 24h normalized URL cache', async () => {
    const s = store()
    const fetchImpl = vi.fn(async () => response('cached memory', 'text/plain'))
    await fetchAndIndex({ url: 'https://example.com/cache#one', store: s, fetchImpl, now: 10 })
    await fetchAndIndex({ url: 'https://example.com/cache#two', store: s, fetchImpl, now: 20 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    s.close()
  })

  it('passes an AbortSignal to native fetch-compatible implementations', async () => {
    const s = store()
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return response('timeout-aware memory', 'text/plain')
    })
    await fetchAndIndex({ url: 'https://example.com/signal', store: s, fetchImpl, timeoutMs: 1 })
    s.close()
  })
})
