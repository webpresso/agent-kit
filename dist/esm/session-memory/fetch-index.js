import { createHash } from 'node:crypto';
import { SessionMemoryStore } from './store.js';
export class FetchIndexError extends Error {
    code;
    status;
    constructor(code, message, options = {}) {
        super(message);
        this.name = 'FetchIndexError';
        this.code = code;
        if (options.status !== undefined)
            this.status = options.status;
        if (options.cause !== undefined) {
            ;
            this.cause = options.cause;
        }
    }
}
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_FETCH_BYTES = 256 * 1024;
const DEFAULT_MAX_CHUNKS = 100;
function normalizeUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch (error) {
        throw new FetchIndexError('invalid_url', 'url must be absolute http(s)', { cause: error });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new FetchIndexError('invalid_url', 'url must be absolute http(s)');
    }
    if (parsed.username || parsed.password) {
        throw new FetchIndexError('invalid_url', 'url must not contain credentials');
    }
    parsed.hash = '';
    return parsed.toString();
}
function htmlToMarkdown(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/giu, '')
        .replace(/<style[\s\S]*?<\/style>/giu, '')
        .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/giu, (_match, level, text) => `${'#'.repeat(Number(level))} ${stripTags(text)}\n`)
        .replace(/<li[^>]*>([\s\S]*?)<\/li>/giu, (_match, text) => `- ${stripTags(text)}\n`)
        .replace(/<p[^>]*>([\s\S]*?)<\/p>/giu, (_match, text) => `${stripTags(text)}\n\n`)
        .replace(/<br\s*\/?>/giu, '\n')
        .replace(/<[^>]+>/gu, ' ')
        .replace(/&nbsp;/gu, ' ')
        .replace(/&amp;/gu, '&')
        .replace(/&lt;/gu, '<')
        .replace(/&gt;/gu, '>')
        .replace(/[ \t]+/gu, ' ')
        .replace(/\n{3,}/gu, '\n\n')
        .trim();
}
function stripTags(html) {
    return html
        .replace(/<[^>]+>/gu, ' ')
        .replace(/[ \t\n]+/gu, ' ')
        .trim();
}
function toIndexableText(body, contentType) {
    if (contentType.includes('text/html'))
        return htmlToMarkdown(body);
    if (contentType.includes('application/json')) {
        try {
            return JSON.stringify(JSON.parse(body), null, 2);
        }
        catch (error) {
            throw new FetchIndexError('invalid_json', 'response body is not valid JSON', { cause: error });
        }
    }
    return body.trim();
}
function chunkText(text, source, maxChunks) {
    const paragraphs = text
        .split(/\n{2,}/u)
        .map((part) => part.trim())
        .filter(Boolean);
    if (paragraphs.length === 0)
        return [];
    return paragraphs.slice(0, maxChunks).map((part, index) => ({
        id: createHash('sha256').update(`${source}\n${index}\n${part}`).digest('hex').slice(0, 24),
        source,
        text: part,
        metadata: { url: source, index },
    }));
}
function normalizePositiveInt(value, fallback) {
    if (value === undefined || !Number.isFinite(value) || value <= 0)
        return fallback;
    return Math.trunc(value);
}
function isAbortError(error) {
    return ((error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError'));
}
async function readResponseText(response, maxBytes) {
    const declaredLength = response.headers.get('content-length');
    if (declaredLength) {
        const parsed = Number.parseInt(declaredLength, 10);
        if (Number.isFinite(parsed) && parsed > maxBytes) {
            throw new FetchIndexError('body_too_large', `response body exceeds ${maxBytes} bytes`);
        }
    }
    if (!response.body) {
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > maxBytes) {
            throw new FetchIndexError('body_too_large', `response body exceeds ${maxBytes} bytes`);
        }
        return text;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks = [];
    let bytes = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done)
                break;
            bytes += next.value.byteLength;
            if (bytes > maxBytes) {
                throw new FetchIndexError('body_too_large', `response body exceeds ${maxBytes} bytes`);
            }
            chunks.push(decoder.decode(next.value, { stream: true }));
        }
        chunks.push(decoder.decode());
        return chunks.join('');
    }
    finally {
        reader.releaseLock();
    }
}
function wireAbortSignals(controller, signal) {
    if (!signal)
        return () => { };
    if (signal.aborted)
        controller.abort(signal.reason);
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    return () => signal.removeEventListener('abort', abort);
}
export async function fetchAndIndex(options) {
    const normalized = normalizeUrl(options.url);
    const maxBytes = normalizePositiveInt(options.maxBytes, DEFAULT_MAX_FETCH_BYTES);
    const maxChunks = normalizePositiveInt(options.maxChunks, DEFAULT_MAX_CHUNKS);
    const controller = new AbortController();
    let timedOut = false;
    const unwire = wireAbortSignals(controller, options.signal);
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, normalizePositiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS));
    try {
        const response = await (options.fetchImpl ?? fetch)(normalized, { signal: controller.signal });
        if (!response.ok) {
            throw new FetchIndexError('http_error', `fetch failed with HTTP ${response.status}`, {
                status: response.status,
            });
        }
        const body = await readResponseText(response, maxBytes);
        const text = toIndexableText(body, response.headers.get('content-type') ?? 'text/plain');
        if (!text.trim())
            return [];
        const source = options.source ?? normalized;
        const chunks = chunkText(text, source, maxChunks);
        if (chunks.length === 0)
            return [];
        options.store.indexChunks(chunks);
        return chunks;
    }
    catch (error) {
        if (error instanceof FetchIndexError)
            throw error;
        if (timedOut)
            throw new FetchIndexError('timed_out', 'fetch timed out', { cause: error });
        if (isAbortError(error) || options.signal?.aborted) {
            throw new FetchIndexError('aborted', 'fetch aborted', { cause: error });
        }
        throw new FetchIndexError('fetch_failed', 'fetch failed', { cause: error });
    }
    finally {
        clearTimeout(timeout);
        unwire();
    }
}
//# sourceMappingURL=fetch-index.js.map