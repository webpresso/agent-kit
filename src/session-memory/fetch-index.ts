import { createHash } from 'node:crypto'

import { isInternalHost } from './ip-guard.js'
import { SessionMemoryStore } from './store.js'
import type { SessionMemoryChunk } from './types.js'

export type FetchIndexErrorCode =
  | 'invalid_url'
  | 'blocked_host'
  | 'http_error'
  | 'invalid_json'
  | 'empty_content'
  | 'body_too_large'
  | 'timed_out'
  | 'aborted'
  | 'fetch_failed'

export class FetchIndexError extends Error {
  readonly code: FetchIndexErrorCode
  readonly status?: number

  constructor(
    code: FetchIndexErrorCode,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message)
    this.name = 'FetchIndexError'
    this.code = code
    if (options.status !== undefined) this.status = options.status
    if (options.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

export interface FetchAndIndexOptions {
  url: string
  store: SessionMemoryStore
  source?: string
  now?: number
  timeoutMs?: number
  maxBytes?: number
  maxChunks?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  allowedHosts?: string[]
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_FETCH_BYTES = 256 * 1024
const DEFAULT_MAX_CHUNKS = 100

function normalizeHostForPolicy(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase()
  const withoutBrackets =
    trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed
  return withoutBrackets.endsWith('.') ? withoutBrackets.slice(0, -1) : withoutBrackets
}

function isAllowedHost(hostname: string, allowedHosts: readonly string[] | undefined): boolean {
  if (!allowedHosts || allowedHosts.length === 0) return false
  const normalized = normalizeHostForPolicy(hostname)
  return allowedHosts.some((allowedHost) => normalizeHostForPolicy(allowedHost) === normalized)
}

function normalizeUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch (error) {
    throw new FetchIndexError('invalid_url', 'url must be absolute http(s)', { cause: error })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new FetchIndexError('invalid_url', 'url must be absolute http(s)')
  }
  if (parsed.username || parsed.password) {
    throw new FetchIndexError('invalid_url', 'url must not contain credentials')
  }
  parsed.hash = ''
  return parsed.toString()
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/giu, '')
    .replace(/<style[\s\S]*?<\/style>/giu, '')
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/giu,
      (_match, level: string, text: string) => `${'#'.repeat(Number(level))} ${stripTags(text)}\n`,
    )
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
  return html
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[ \t\n]+/gu, ' ')
    .trim()
}

function toIndexableText(body: string, contentType: string): string {
  if (contentType.includes('text/html')) return htmlToMarkdown(body)
  if (contentType.includes('application/json')) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2)
    } catch (error) {
      throw new FetchIndexError('invalid_json', 'response body is not valid JSON', { cause: error })
    }
  }
  return body.trim()
}

function chunkText(text: string, source: string, maxChunks: number): SessionMemoryChunk[] {
  const paragraphs = text
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter(Boolean)
  if (paragraphs.length === 0) return []
  return paragraphs.slice(0, maxChunks).map((part, index) => ({
    id: createHash('sha256').update(`${source}\n${index}\n${part}`).digest('hex').slice(0, 24),
    source,
    text: part,
    metadata: { url: source, index },
  }))
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback
  return Math.trunc(value)
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength) {
    const parsed = Number.parseInt(declaredLength, 10)
    if (Number.isFinite(parsed) && parsed > maxBytes) {
      throw new FetchIndexError('body_too_large', `response body exceeds ${maxBytes} bytes`)
    }
  }

  if (!response.body) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new FetchIndexError('body_too_large', `response body exceeds ${maxBytes} bytes`)
    }
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let bytes = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > maxBytes) {
        throw new FetchIndexError('body_too_large', `response body exceeds ${maxBytes} bytes`)
      }
      chunks.push(decoder.decode(next.value, { stream: true }))
    }
    chunks.push(decoder.decode())
    return chunks.join('')
  } finally {
    reader.releaseLock()
  }
}

function wireAbortSignals(
  controller: AbortController,
  signal: AbortSignal | undefined,
): () => void {
  if (!signal) return () => {}
  if (signal.aborted) controller.abort(signal.reason)
  const abort = () => controller.abort(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  return () => signal.removeEventListener('abort', abort)
}

export async function fetchAndIndex(options: FetchAndIndexOptions): Promise<SessionMemoryChunk[]> {
  const normalized = normalizeUrl(options.url)
  const parsed = new URL(normalized)
  const maxBytes = normalizePositiveInt(options.maxBytes, DEFAULT_MAX_FETCH_BYTES)
  const maxChunks = normalizePositiveInt(options.maxChunks, DEFAULT_MAX_CHUNKS)
  const timeoutMs = normalizePositiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS)
  const controller = new AbortController()
  let timedOut = false
  const unwire = wireAbortSignals(controller, options.signal)
  const timeout = setTimeout(
    () => {
      timedOut = true
      controller.abort()
    },
    timeoutMs,
  )

  try {
    if (
      !isAllowedHost(parsed.hostname, options.allowedHosts) &&
      (await isInternalHost(parsed.hostname, { signal: controller.signal, timeoutMs }))
    ) {
      throw new FetchIndexError(
        'blocked_host',
        'url host is blocked because it is or resolves to an internal address',
      )
    }

    const response = await (options.fetchImpl ?? fetch)(normalized, { signal: controller.signal })
    if (!response.ok) {
      throw new FetchIndexError('http_error', `fetch failed with HTTP ${response.status}`, {
        status: response.status,
      })
    }
    const body = await readResponseText(response, maxBytes)
    const text = toIndexableText(body, response.headers.get('content-type') ?? 'text/plain')
    if (!text.trim()) return []
    const source = options.source ?? normalized
    const chunks = chunkText(text, source, maxChunks)
    if (chunks.length === 0) return []
    options.store.indexChunks(chunks)
    return chunks
  } catch (error) {
    if (error instanceof FetchIndexError) throw error
    if (timedOut) throw new FetchIndexError('timed_out', 'fetch timed out', { cause: error })
    if (isAbortError(error) || options.signal?.aborted) {
      throw new FetchIndexError('aborted', 'fetch aborted', { cause: error })
    }
    throw new FetchIndexError('fetch_failed', 'fetch failed', { cause: error })
  } finally {
    clearTimeout(timeout)
    unwire()
  }
}
