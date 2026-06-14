import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FetchIndexError, fetchAndIndex } from './fetch-index.js'
import { isInternalHost } from './ip-guard.js'
import { SessionMemoryStore } from './store.js'

vi.mock('./ip-guard.js', () => ({
  isInternalHost: vi.fn(async (hostname: string) =>
    ['169.254.169.254', '127.0.0.1', 'localhost', '192.168.1.1', 'private.example.com'].includes(
      hostname,
    ),
  ),
}))

const isInternalHostMock = vi.mocked(isInternalHost)

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
  isInternalHostMock.mockClear()
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('fetchAndIndex', () => {
  it('rejects internal metadata URLs before fetching', async () => {
    const s = store()
    const fetchImpl = vi.fn(async () => response('metadata', 'text/plain'))

    await expect(
      fetchAndIndex({
        url: 'http://169.254.169.254/latest/meta-data/',
        store: s,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: 'blocked_host' })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(s.count()).toBe(0)
    s.close()
  })

  it.each(['http://127.0.0.1/', 'http://localhost/', 'http://192.168.1.1/'])(
    'rejects internal URL %s by default',
    async (url) => {
      const s = store()
      await expect(
        fetchAndIndex({
          url,
          store: s,
          fetchImpl: vi.fn(async () => response('blocked', 'text/plain')),
        }),
      ).rejects.toMatchObject({ code: 'blocked_host' })
      expect(s.count()).toBe(0)
      s.close()
    },
  )

  it('rejects hostnames that resolve to private addresses by default', async () => {
    const s = store()
    await expect(
      fetchAndIndex({
        url: 'https://private.example.com/docs',
        store: s,
        fetchImpl: vi.fn(async () => response('private docs', 'text/plain')),
      }),
    ).rejects.toMatchObject({ code: 'blocked_host' })
    expect(s.count()).toBe(0)
    s.close()
  })

  it('allows an explicitly allowlisted internal hostname', async () => {
    const s = store()
    const fetchImpl = vi.fn(async () => response('local docs', 'text/plain'))

    const chunks = await fetchAndIndex({
      url: 'http://localhost/path',
      allowedHosts: ['localhost'],
      store: s,
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(chunks).toHaveLength(1)
    expect(s.search({ query: 'local', limit: 1 })[0]?.text).toContain('local docs')
    s.close()
  })

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
