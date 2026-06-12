import { loadNativeSessionMemoryEngine } from './native-runtime.js'
import type { FetchIndexOptions, FetchIndexResult } from './types.js'

type CacheEntry = { ts: number; body: string; contentType: string }

const cache = new Map<string, CacheEntry>()
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

function normalizeUrl(url: string): string {
  const parsed = new URL(url)
  parsed.hash = ''
  return parsed.toString()
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/gu, ' ').replace(/[ \t\n]+/gu, ' ').trim()
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/giu, '')
    .replace(/<style[\s\S]*?<\/style>/giu, '')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/giu, (_m, level: string, text: string) => `${'#'.repeat(Number(level))} ${stripTags(text)}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/giu, (_m, text: string) => `- ${stripTags(text)}\n`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/giu, (_m, text: string) => `${stripTags(text)}\n\n`)
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

function toIndexableText(body: string, contentType: string): string {
  if (contentType.includes('text/html')) return htmlToMarkdown(body)
  if (contentType.includes('application/json')) return JSON.stringify(JSON.parse(body), null, 2)
  return body
}

export async function fetchAndIndex(options: FetchIndexOptions): Promise<FetchIndexResult> {
  const normalized = normalizeUrl(options.url)
  const ttl = options.cacheTtlMs ?? DEFAULT_TTL_MS
  const now = Date.now()
  const cached = cache.get(normalized)
  let entry = cached && now - cached.ts < ttl ? cached : undefined
  if (!entry) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    let response: Response
    entry = {
      ts: now,
      body: '',
      contentType: 'text/plain',
    }
    try {
      response = await (options.fetchImpl ?? fetch)(normalized, { signal: controller.signal })
      entry.body = await response.text()
      entry.contentType = response.headers.get('content-type') ?? 'text/plain'
      cache.set(normalized, entry)
    } finally {
      clearTimeout(timeout)
    }
  }
  const text = toIndexableText(entry.body, entry.contentType)
  const chunkCount = loadNativeSessionMemoryEngine().index(
    options.dbPath,
    normalized,
    text,
    false,
  )
  return {
    url: normalized,
    chunkCount,
    cached: cached !== undefined && entry === cached,
    cachedAt: entry.ts,
  }
}

export function clearFetchIndexCache(): void {
  cache.clear()
}
