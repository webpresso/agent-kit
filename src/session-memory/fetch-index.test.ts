import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { htmlToMarkdown, splitIntoChunks, fetchAndIndex } from './fetch-index.js'
import { closeStore } from './store.js'

let tmpDir: string
let dbPath: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ak-fetch-index-test-'))
  dbPath = join(tmpDir, 'test.db')
})

afterEach(() => {
  closeStore(dbPath)
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('htmlToMarkdown', () => {
  it('strips script and style tags', () => {
    // Note: script content is intentionally not valid JS — just testing stripping
    const html = '<html><script>void 0</script><style>.a{color:red}</style><p>hello</p></html>'
    const md = htmlToMarkdown(html)
    expect(md).not.toContain('void 0')
    expect(md).not.toContain('.a{')
    expect(md).toContain('hello')
  })

  it('converts headings', () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('# Title')
    expect(md).toContain('## Subtitle')
  })

  it('converts bold and italic', () => {
    const html = '<strong>bold</strong> and <em>italic</em>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('**bold**')
    expect(md).toContain('*italic*')
  })

  it('decodes HTML entities', () => {
    const html = '<p>foo &amp; bar &lt;baz&gt;</p>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('foo & bar <baz>')
  })

  it('strips remaining HTML tags', () => {
    const html = '<div class="x"><p>clean</p></div>'
    const md = htmlToMarkdown(html)
    expect(md).not.toContain('<div')
    expect(md).toContain('clean')
  })
})

describe('splitIntoChunks', () => {
  it('returns a single chunk for short text', () => {
    const chunks = splitIntoChunks('short text', 1500)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe('short text')
  })

  it('splits long text into multiple chunks', () => {
    const para = 'A'.repeat(600)
    const text = `${para}\n\n${para}\n\n${para}`
    const chunks = splitIntoChunks(text, 1000)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('produces non-empty chunks', () => {
    const text = 'Para one\n\nPara two\n\nPara three'
    const chunks = splitIntoChunks(text, 20)
    for (const c of chunks) {
      expect(c.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('fetchAndIndex', () => {
  it('fetches and indexes a URL, returns chunk count', async () => {
    const html =
      '<html><body><h1>Test Page</h1><p>This is test content for indexing.</p></body></html>'

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => html,
      }),
    )

    const result = await fetchAndIndex({ url: 'https://example.com/test', dbPath })
    expect(result.url).toBe('https://example.com/test')
    expect(result.chunkCount).toBeGreaterThan(0)
    expect(result.cached).toBe(false)
  })

  it('uses cache on second call within 24h TTL', async () => {
    const html = '<p>cached content here</p>'
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => html,
    })
    vi.stubGlobal('fetch', mockFetch)

    await fetchAndIndex({ url: 'https://example.com/cached', dbPath })
    const second = await fetchAndIndex({
      url: 'https://example.com/cached',
      dbPath,
      cacheTtlMs: 60_000,
    })

    expect(second.cached).toBe(true)
    // fetch should only be called once
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('throws on non-OK HTTP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => 'text/html' },
        text: async () => 'not found',
      }),
    )

    await expect(fetchAndIndex({ url: 'https://example.com/404', dbPath })).rejects.toThrow('404')
  })
})
