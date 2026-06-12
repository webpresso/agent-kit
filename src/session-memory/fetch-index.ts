/**
 * HTTP fetch + index: fetch a URL, convert HTML to Markdown, index into the store.
 * 24-hour cache via the sources table (skip re-fetch if indexed_at < 24h ago).
 * Uses native fetch() — Node 24+ baseline, no undici or axios.
 */
import type { FetchIndexResult } from './types.js'
import { getStore } from './store.js'

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000 // 24 hours

/**
 * Minimal HTML → Markdown converter.
 * No external deps — strips tags, converts common block elements.
 */
export function htmlToMarkdown(html: string): string {
  return (
    html
      // Remove <head>...<head> entirely
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      // Remove <script> blocks
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      // Remove <style> blocks
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      // Convert headings
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n')
      // Convert paragraphs
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
      // Convert line breaks
      .replace(/<br\s*\/?>/gi, '\n')
      // Convert bold
      .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
      // Convert italic
      .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
      // Convert code
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
      // Convert pre blocks
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n')
      // Convert list items
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
      // Convert anchors (keep text)
      .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
      // Strip remaining tags
      .replace(/<[^>]+>/g, '')
      // Decode HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // Normalize whitespace: collapse 3+ blank lines to 2
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/**
 * Split markdown text into chunks of approximately chunkSize characters.
 * Splits on paragraph boundaries where possible.
 */
export function splitIntoChunks(text: string, chunkSize = 1500): readonly string[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > chunkSize && current.length > 0) {
      chunks.push(current.trim())
      current = para
    } else {
      current = current ? `${current}\n\n${para}` : para
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim())
  }

  return chunks
}

export interface FetchIndexOptions {
  readonly url: string
  readonly dbPath: string
  /** Override cache TTL in ms (for testing) */
  readonly cacheTtlMs?: number
}

/**
 * Fetch a URL, convert to Markdown, and index into the session store.
 * Respects 24h cache: if the source was indexed recently, skips re-fetch.
 */
export async function fetchAndIndex(options: FetchIndexOptions): Promise<FetchIndexResult> {
  const { url, dbPath, cacheTtlMs = CACHE_TTL_MS } = options
  const store = getStore(dbPath)
  const db = store.getDb()

  // Check cache
  const existingSource = db
    .prepare('SELECT indexed_at, chunk_count FROM sources WHERE label = ?')
    .get(url) as { indexed_at: number; chunk_count: number } | undefined

  if (existingSource && Date.now() - existingSource.indexed_at < cacheTtlMs) {
    return {
      url,
      chunkCount: existingSource.chunk_count,
      cached: true,
      cachedAt: existingSource.indexed_at,
    }
  }

  // Fetch the URL
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'agent-kit/session-memory-index (+https://github.com/webpresso/agent-kit)',
      Accept: 'text/html,text/plain',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const rawText = await response.text()

  const markdown = contentType.includes('text/html') ? htmlToMarkdown(rawText) : rawText

  const chunks = splitIntoChunks(markdown)

  store.insertChunks(chunks.map((content) => ({ content, source: url })))

  return {
    url,
    chunkCount: chunks.length,
    cached: false,
  }
}
