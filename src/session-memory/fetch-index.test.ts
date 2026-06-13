import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FetchIndexError, fetchAndIndex } from './fetch-index.js'
import { SessionMemoryStore } from './store.js'

const dirs: string[] = []
function store(): SessionMemoryStore {
  const dir = mkdtempSync(join(tmpdir(), 'ak-fetch-index-'))
  dirs.push(dir)
  return new SessionMemoryStore(join(dir, 'memory.sqlite'))
}
function response(body: string, contentType: string, init: ResponseInit = {}): Response {
  return new Response(body, { ...init, headers: { 'content-type': contentType, ...init.headers } })
}

afterEach(() => {
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

  it('fetches text without a network cache', async () => {
    const s = store()
    const fetchImpl = vi.fn(async () => response('fresh memory', 'text/plain'))
    await fetchAndIndex({ url: 'https://example.com/cache#one', store: s, fetchImpl, now: 10 })
    await fetchAndIndex({ url: 'https://example.com/cache#two', store: s, fetchImpl, now: 20 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
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

  it('rejects invalid URLs without indexing', async () => {
    const s = store()
    await expect(
      fetchAndIndex({ url: 'file:///tmp/body', store: s, fetchImpl: vi.fn() }),
    ).rejects.toMatchObject({ code: 'invalid_url' })
    expect(s.count()).toBe(0)
    s.close()
  })

  it('rejects non-2xx responses without indexing', async () => {
    const s = store()
    await expect(
      fetchAndIndex({
        url: 'https://example.com/missing',
        store: s,
        fetchImpl: vi.fn(async () => response('not found raw body', 'text/plain', { status: 404 })),
      }),
    ).rejects.toMatchObject({ code: 'http_error', status: 404 })
    expect(s.count()).toBe(0)
    s.close()
  })

  it('rejects malformed JSON without indexing', async () => {
    const s = store()
    await expect(
      fetchAndIndex({
        url: 'https://example.com/bad-json',
        store: s,
        fetchImpl: vi.fn(async () => response('{bad', 'application/json')),
      }),
    ).rejects.toMatchObject({ code: 'invalid_json' })
    expect(s.count()).toBe(0)
    s.close()
  })

  it('returns no chunks for empty normalized content without indexing', async () => {
    const s = store()
    const chunks = await fetchAndIndex({
      url: 'https://example.com/empty',
      store: s,
      fetchImpl: vi.fn(async () => response('   ', 'text/plain')),
    })
    expect(chunks).toEqual([])
    expect(s.count()).toBe(0)
    s.close()
  })

  it('enforces a bounded response body before indexing', async () => {
    const s = store()
    await expect(
      fetchAndIndex({
        url: 'https://example.com/large',
        store: s,
        maxBytes: 8,
        fetchImpl: vi.fn(async () => response('this body is too large', 'text/plain')),
      }),
    ).rejects.toMatchObject({ code: 'body_too_large' })
    expect(s.count()).toBe(0)
    s.close()
  })

  it('maps timeout/abort to deterministic errors and leaves store unchanged', async () => {
    const s = store()
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )

    await expect(
      fetchAndIndex({ url: 'https://example.com/slow', store: s, fetchImpl, timeoutMs: 1 }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof FetchIndexError && error.code === 'timed_out',
    )
    expect(s.count()).toBe(0)
    s.close()
  })
})
