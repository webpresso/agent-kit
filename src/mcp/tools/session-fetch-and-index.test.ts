import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import sessionFetchAndIndexTool, { handleSessionFetchAndIndex } from './session-fetch-and-index.js'
import {
  isInternalAddress,
  isInternalHost,
  resolveHostAddresses,
} from '../../session-memory/ip-guard.js'
import { SessionMemoryStore } from '../../session-memory/store.js'

const { internalHosts } = vi.hoisted(() => ({
  internalHosts: new Set([
    '169.254.169.254',
    '127.0.0.1',
    'localhost',
    '192.168.1.1',
    '[::ffff:7f00:1]',
    '[::ffff:a9fe:a9fe]',
    '100.64.0.1',
    '198.18.0.1',
  ]),
}))

vi.mock('../../session-memory/ip-guard.js', () => ({
  isInternalAddress: vi.fn((address: string) => internalHosts.has(address)),
  isInternalHost: vi.fn(async (hostname: string) => internalHosts.has(hostname)),
  normalizeHostname: vi.fn((hostname: string) => hostname.replace(/^\[|\]$/gu, '').toLowerCase()),
  resolveHostAddresses: vi.fn(async (hostname: string) => [
    {
      address: internalHosts.has(hostname) ? hostname : '93.184.216.34',
      family: hostname.includes(':') ? 6 : 4,
    },
  ]),
}))

const isInternalAddressMock = vi.mocked(isInternalAddress)
const isInternalHostMock = vi.mocked(isInternalHost)
const resolveHostAddressesMock = vi.mocked(resolveHostAddresses)

const dirs: string[] = []

function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ak-mcp-session-fetch-index-'))
  dirs.push(dir)
  return join(dir, 'memory.sqlite')
}

function response(body: string, contentType: string): Response {
  return new Response(body, { headers: { 'content-type': contentType } })
}

function payload(result: Awaited<ReturnType<typeof sessionFetchAndIndexTool.handler>>) {
  return result.structuredContent as {
    passed: boolean
    summary: string
    gain?: { rawBasisBytes: number; rawBytesBasis: string; gainBytes: number }
    counts: { indexedChunks: number; warningCount: number }
    source: string
    url?: string
    chunkIds: string[]
    warnings: string[]
    timedOut?: boolean
    aborted?: boolean
  }
}

afterEach(() => {
  isInternalAddressMock.mockClear()
  isInternalHostMock.mockClear()
  resolveHostAddressesMock.mockClear()
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('wp_session_fetch_and_index tool', () => {
  it('returns a meaningful blocked-host warning for internal metadata URLs', async () => {
    const fetchImpl = vi.fn(async () => response('metadata', 'text/plain'))
    const result = await handleSessionFetchAndIndex(
      { dbPath: tmpDbPath(), url: 'http://169.254.169.254/latest/meta-data/' },
      undefined,
      { fetchImpl },
    )
    const data = payload(result)

    expect(result.isError).toBe(true)
    expect(data.passed).toBe(false)
    expect(data.counts).toEqual({ indexedChunks: 0, warningCount: 1 })
    expect(data.warnings[0]).toMatch(/blocked|internal/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each(['http://127.0.0.1/', 'http://localhost/', 'http://192.168.1.1/'])(
    'returns an error for internal URL %s',
    async (url) => {
      const result = await handleSessionFetchAndIndex({ dbPath: tmpDbPath(), url }, undefined, {
        fetchImpl: vi.fn(async () => response('blocked', 'text/plain')),
      })
      const data = payload(result)

      expect(result.isError).toBe(true)
      expect(data.passed).toBe(false)
      expect(data.warnings[0]).toMatch(/blocked|internal/i)
    },
  )

  it.each([
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://100.64.0.1/',
    'http://198.18.0.1/',
  ])('rejects canonical internal or special-use URL %s before fetching', async (url) => {
    const fetchImpl = vi.fn(async () => response('blocked', 'text/plain'))
    const result = await handleSessionFetchAndIndex({ dbPath: tmpDbPath(), url }, undefined, {
      fetchImpl,
    })
    const data = payload(result)

    expect(result.isError).toBe(true)
    expect(data.passed).toBe(false)
    expect(data.warnings[0]).toMatch(/blocked|internal/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('still indexes allowed external URLs through the tool', async () => {
    const result = await handleSessionFetchAndIndex(
      { dbPath: tmpDbPath(), url: 'https://example.com/docs' },
      undefined,
      { fetchImpl: vi.fn(async () => response('external docs', 'text/plain')) },
    )
    const data = payload(result)

    expect(result.isError).not.toBe(true)
    expect(data.passed).toBe(true)
    expect(data.counts.indexedChunks).toBe(1)
  })

  it('returns a blocked-host warning when an external URL redirects internally', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('', {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        }),
    )
    const result = await handleSessionFetchAndIndex(
      { dbPath: tmpDbPath(), url: 'https://example.com/redirect' },
      undefined,
      { fetchImpl },
    )
    const data = payload(result)

    expect(result.isError).toBe(true)
    expect(data.passed).toBe(false)
    expect(data.warnings[0]).toMatch(/blocked|internal/i)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
  })

  it('exposes a first-class bounded descriptor', () => {
    expect(sessionFetchAndIndexTool.name).toBe('wp_session_fetch_and_index')
    expect(typeof sessionFetchAndIndexTool.handler).toBe('function')
    expect(sessionFetchAndIndexTool.annotations?.openWorldHint).toBe(true)
  })

  it('indexes fetched HTML without echoing raw large body', async () => {
    const dbPath = tmpDbPath()
    const body = `<h1>Title</h1><p>${'large html body '.repeat(1024)}needle-html</p>`
    const result = await handleSessionFetchAndIndex(
      { dbPath, url: 'https://example.com/page#frag', source: 'web:example' },
      undefined,
      { fetchImpl: vi.fn(async () => response(body, 'text/html')) },
    )
    const data = payload(result)

    expect(data.passed).toBe(true)
    expect(data.source).toBe('web:example')
    expect(data.url).toBe('https://example.com/page')
    expect(data.counts.indexedChunks).toBe(1)
    expect(data.chunkIds).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('needle-html')
    expect(JSON.stringify(result)).not.toContain('large html body')

    const store = new SessionMemoryStore(dbPath)
    expect(store.search({ query: 'needle-html', limit: 2 }).map((chunk) => chunk.source)).toEqual([
      'web:example',
    ])
    store.close()
  })

  it('indexes JSON and text inputs with bounded responses', async () => {
    const jsonDbPath = tmpDbPath()
    const jsonResult = await handleSessionFetchAndIndex(
      { dbPath: jsonDbPath, url: 'https://example.com/data' },
      undefined,
      { fetchImpl: vi.fn(async () => response('{"name":"json-memory"}', 'application/json')) },
    )
    expect(payload(jsonResult).passed).toBe(true)

    const textDbPath = tmpDbPath()
    const textResult = await handleSessionFetchAndIndex(
      { dbPath: textDbPath, url: 'https://example.com/text' },
      undefined,
      { fetchImpl: vi.fn(async () => response('plain text-memory', 'text/plain')) },
    )
    expect(payload(textResult).passed).toBe(true)
    expect(JSON.stringify(textResult)).not.toContain('plain text-memory')
  })

  it('uses indexed chunk text UTF-8 bytes as a conservative fetch gain basis', async () => {
    const result = await handleSessionFetchAndIndex(
      { dbPath: tmpDbPath(), url: 'https://example.com/fetch-basis' },
      undefined,
      { fetchImpl: vi.fn(async () => response('<p>abc😀</p>', 'text/html')) },
    )
    const data = payload(result)

    expect(data.gain).toMatchObject({ rawBasisBytes: 7, rawBytesBasis: 'fetch_indexed_text' })
  })

  it('returns a deterministic bounded error for invalid URLs', async () => {
    const result = await handleSessionFetchAndIndex(
      { dbPath: tmpDbPath(), url: 'not a url' },
      undefined,
      { fetchImpl: vi.fn() },
    )
    const data = payload(result)

    expect(result.isError).toBe(true)
    expect(data.passed).toBe(false)
    expect(data.summary).toBe('session fetch/index rejected invalid URL')
    expect(data.counts).toEqual({ indexedChunks: 0, warningCount: 1 })
    expect(data.warnings).toEqual(['url must be absolute http(s)'])
  })

  it('returns a deterministic bounded outcome for empty fetched content', async () => {
    const result = await handleSessionFetchAndIndex(
      { dbPath: tmpDbPath(), url: 'https://example.com/empty' },
      undefined,
      { fetchImpl: vi.fn(async () => response('   ', 'text/plain')) },
    )
    const data = payload(result)

    expect(result.isError).toBe(true)
    expect(data.passed).toBe(false)
    expect(data.counts).toEqual({ indexedChunks: 0, warningCount: 1 })
    expect(data.warnings).toEqual(['fetched content produced no indexable chunks'])
  })

  it('returns a deterministic bounded timeout/abort outcome', async () => {
    const result = await handleSessionFetchAndIndex(
      { dbPath: tmpDbPath(), url: 'https://example.com/slow', timeoutMs: 1 },
      undefined,
      {
        fetchImpl: vi.fn(
          async (_url: string | URL | Request, init?: RequestInit) =>
            await new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError')),
              )
            }),
        ),
      },
    )
    const data = payload(result)

    expect(result.isError).toBe(true)
    expect(data.passed).toBe(false)
    expect(data.timedOut || data.aborted).toBe(true)
    expect(data.counts.indexedChunks).toBe(0)
    expect(JSON.stringify(result)).not.toContain('example.com/slow body')
  })
})
