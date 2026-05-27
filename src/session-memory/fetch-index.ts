import { createHash } from 'node:crypto'

import { SessionMemoryStore } from './store.js'
import type { SessionMemoryChunk } from './types.js'

type CacheEntry = { ts: number; body: string; contentType: string }

export interface FetchAndIndexOptions {
  url: string
  store: SessionMemoryStore
  source?: string
  now?: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 24 * 60 * 60 * 1000

export function clearFetchIndexCache(): void {
  cache.clear()
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url)
  parsed.hash = ''
  return parsed.toString()
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/giu, '')
    .replace(/<style[\s\S]*?<\/style>/giu, '')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/giu, (_match, level: string, text: string) => `${'#'.repeat(Number(level))} ${stripTags(text)}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/giu, (_match, text: string) => `- ${stripTags(text)}\n`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/giu, (_match, text: string) => `${stripTags(text)}\n\n`)
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/gu, ' ').replace(/[ \t\n]+/gu, ' ').trim()
}

function toIndexableText(body: string, contentType: string): string {
  if (contentType.includes('text/html')) return htmlToMarkdown(body)
  if (contentType.includes('application/json')) return JSON.stringify(JSON.parse(body), null, 2)
  return body
}

function chunkText(text: string, source: string): SessionMemoryChunk[] {
  const paragraphs = text.split(/\n{2,}/u).map((part) => part.trim()).filter(Boolean)
  const groups = paragraphs.length > 0 ? paragraphs : [text]
  return groups.map((part, index) => ({
    id: createHash('sha256').update(`${source}\n${index}\n${part}`).digest('hex').slice(0, 24),
    source,
    text: part,
    metadata: { url: source, index },
  }))
}

export async function fetchAndIndex(options: FetchAndIndexOptions): Promise<SessionMemoryChunk[]> {
  const normalized = normalizeUrl(options.url)
  const now = options.now ?? Date.now()
  const cached = cache.get(normalized)
  let entry = cached && now - cached.ts < TTL_MS ? cached : undefined
  if (!entry) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
    try {
      const response = await (options.fetchImpl ?? fetch)(normalized, { signal: controller.signal })
      const body = await response.text()
      entry = { ts: now, body, contentType: response.headers.get('content-type') ?? 'text/plain' }
      cache.set(normalized, entry)
    } finally {
      clearTimeout(timeout)
    }
  }
  const text = toIndexableText(entry.body, entry.contentType)
  const source = options.source ?? normalized
  const chunks = chunkText(text, source)
  options.store.indexChunks(chunks)
  return chunks
}
