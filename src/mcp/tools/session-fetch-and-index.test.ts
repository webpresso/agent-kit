import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import sessionFetchAndIndexTool, { handleSessionFetchAndIndex } from './session-fetch-and-index.js'
import { SessionMemoryStore } from '../../session-memory/store.js'

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
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('wp_session_fetch_and_index tool', () => {
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
    expect(data.counts.indexedChunks).toBeGreaterThan(0)
    expect(data.chunkIds.length).toBeGreaterThan(0)
    expect(JSON.stringify(result)).not.toContain('needle-html')
    expect(JSON.stringify(result)).not.toContain('large html body')

    const store = new SessionMemoryStore(dbPath)
    expect(store.search({ query: 'needle-html', limit: 1 })[0]?.source).toBe('web:example')
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
