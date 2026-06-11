/**
 * HTTP fetch + index — v2 with ctx-rs backend.
 *
 * Fetch a URL, convert HTML→Markdown, chunk, and index into the session store.
 * 24-hour cache via the sources table (skip re-fetch if indexed_at < 24h ago).
 *
 * Backend: ctx-rs fetch_and_index (async) when available; TS engine fallback.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import type { FetchIndexOptions, FetchIndexResult } from './types.js'
import { isUnavailable } from './types.js'
import { getStore } from './store.js'
import { resolveBackend, tryLoadCtxRsSync } from './backend.js'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CacheLookupDb {
  prepare<Params extends unknown[] = [string], Row = { indexed_at: number }>(sql: string): {
    get(...params: Params): Row | undefined | null
  }
}

function isCacheLookupDb(value: unknown): value is CacheLookupDb {
  return typeof value === 'object' && value !== null && 'prepare' in value
}

/**
 * Fetch a URL, convert to Markdown, and index into the session store.
 * Respects 24h cache: if the source was indexed recently, skips re-fetch.
 */
export async function fetchAndIndex(options: FetchIndexOptions): Promise<FetchIndexResult> {
  const { url, dbPath, cacheTtlMs = CACHE_TTL_MS } = options
  mkdirSync(dirname(dbPath), { recursive: true })

  const backend = resolveBackend()

  // Check cache first (TS engine path — ctx-rs also has internal caching via sources table)
  if (backend === 'ts') {
    return fetchAndIndexTs(url, dbPath, cacheTtlMs)
  }

  // ctx-rs path: use the async fetch_and_index FFI call
  const ctxRs = tryLoadCtxRsSync()
  if (ctxRs !== null) {
    // Check cache via sources table (requires opening the DB)
    const store = getStore(dbPath)
    const cachedAt = getCachedAt(store, url)
    if (cachedAt !== null && Date.now() - cachedAt < cacheTtlMs) {
      return { url, chunkCount: 0, cached: true, cachedAt }
    }

    const result = await ctxRs.fetchAndIndex(dbPath, url)
    if (isUnavailable(result)) {
      // Fall back to TS
      return fetchAndIndexTs(url, dbPath, cacheTtlMs)
    }
    const fetchResult = result as { url: string; chunkCount: number; sourceLabel: string }
    return { url: fetchResult.url, chunkCount: fetchResult.chunkCount, cached: false }
  }

  // ctx-rs unavailable — fall back to TS
  return fetchAndIndexTs(url, dbPath, cacheTtlMs)
}

function getCachedAt(store: ReturnType<typeof getStore>, url: string): number | null {
  try {
    const db = (store as { getDb?(): unknown }).getDb?.()
    if (!isCacheLookupDb(db)) return null
    const row = db
      .prepare('SELECT indexed_at FROM sources WHERE label = ?')
      .get(url) as { indexed_at: number } | undefined
    return row?.indexed_at ?? null
  } catch (err: unknown) {
    process.stderr.write(
      `ak-session-memory: getCachedAt failed: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return null
  }
}

async function fetchAndIndexTs(
  url: string,
  dbPath: string,
  cacheTtlMs: number,
): Promise<FetchIndexResult> {
  const store = getStore(dbPath)
  const cachedAt = getCachedAt(store, url)
  if (cachedAt !== null && Date.now() - cachedAt < cacheTtlMs) {
    return { url, chunkCount: 0, cached: true, cachedAt }
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`fetch ${url} failed: ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const rawText = await response.text()
  const markdown = contentType.includes('text/html') ? htmlToMarkdown(rawText) : rawText
  const chunks = splitIntoChunks(markdown)

  store.insertChunks(chunks.map((content) => ({ content, source: url })))

  return { url, chunkCount: chunks.length, cached: false }
}

// ── HTML → Markdown (minimal, no deps) ───────────────────────────────────────

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Text chunking (token-aware approximation) ─────────────────────────────────

const CHUNK_SIZE = 512 // approximate tokens
const WORDS_PER_TOKEN = 0.75 // English average

function splitIntoChunks(text: string): string[] {
  const words = text.split(/\s+/)
  const wordsPerChunk = Math.round(CHUNK_SIZE * WORDS_PER_TOKEN)
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ')
    if (chunk.length > 0) chunks.push(chunk)
  }
  return chunks
}
