import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js';
import { FetchIndexError, fetchAndIndex } from '#session-memory/fetch-index.js';
import { SessionMemoryStore } from '#session-memory/store.js';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
const MAX_RETURNED_IDS = 100;
const MAX_URL_LENGTH = 2048;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_FETCH_BYTES = 256 * 1024;
const MAX_CHUNKS = 100;
const inputSchema = z
    .object({
    cwd: z.string().optional(),
    dbPath: z.string().optional(),
    url: z.string().min(1).max(MAX_URL_LENGTH),
    source: z.string().min(1).max(240).optional(),
    timeoutMs: z
        .number()
        .int()
        .positive()
        .max(MAX_TIMEOUT_MS)
        .optional()
        .default(DEFAULT_TIMEOUT_MS),
    maxBytes: z.number().int().positive().max(MAX_FETCH_BYTES).optional().default(MAX_FETCH_BYTES),
    maxChunks: z.number().int().positive().max(MAX_CHUNKS).optional().default(MAX_CHUNKS),
})
    .strict();
const outputSchema = createSummaryOutputSchema({
    counts: z.object({
        indexedChunks: z.number(),
        warningCount: z.number(),
    }),
    details: z.object({
        source: z.string(),
        url: z.string().optional(),
        chunkIds: z.array(z.string()),
        warnings: z.array(z.string()),
    }),
}).extend({
    source: z.string(),
    url: z.string().optional(),
    chunkIds: z.array(z.string()),
    warnings: z.array(z.string()),
});
function normalizeUrlForResponse(url) {
    try {
        const parsed = new URL(url);
        parsed.hash = '';
        return parsed.toString();
    }
    catch {
        return undefined;
    }
}
function defaultDbPath(cwd) {
    if (process.env.WP_SESSION_MEMORY_INDEX_DB)
        return process.env.WP_SESSION_MEMORY_INDEX_DB;
    try {
        return getSurfacePath('session-memory/index.sqlite', 'worktree', cwd);
    }
    catch (error) {
        if (error instanceof NotInGitRepoError ||
            error?.name === 'NotInGitRepoError') {
            return join(tmpdir(), 'webpresso-session-memory', 'index.sqlite');
        }
        throw error;
    }
}
function sourceFor(input) {
    return input.source ?? normalizeUrlForResponse(input.url) ?? 'web:invalid';
}
function payloadFor(input, chunks, warnings, options = {}) {
    const source = sourceFor(input);
    const chunkIds = chunks.slice(0, MAX_RETURNED_IDS).map((chunk) => chunk.id);
    const passed = options.passed ?? chunks.length > 0;
    return {
        passed,
        summary: options.summary ??
            (passed
                ? `session fetch/index stored ${chunks.length} chunk${chunks.length === 1 ? '' : 's'}`
                : 'session fetch/index stored no chunks'),
        counts: { indexedChunks: chunks.length, warningCount: warnings.length },
        source,
        ...(normalizeUrlForResponse(input.url) ? { url: normalizeUrlForResponse(input.url) } : {}),
        chunkIds,
        warnings: [...warnings],
        details: {
            source,
            ...(normalizeUrlForResponse(input.url) ? { url: normalizeUrlForResponse(input.url) } : {}),
            chunkIds,
            warnings: [...warnings],
        },
        ...(options.timedOut ? { timedOut: true } : {}),
        ...(options.aborted ? { aborted: true } : {}),
    };
}
function warningFor(error) {
    switch (error.code) {
        case 'invalid_url':
            return 'url must be absolute http(s)';
        case 'http_error':
            return error.status === undefined
                ? 'fetch returned an HTTP error'
                : `fetch returned HTTP ${error.status}`;
        case 'invalid_json':
            return 'response body is not valid JSON';
        case 'body_too_large':
            return `response body exceeds ${MAX_FETCH_BYTES} bytes`;
        case 'timed_out':
            return 'fetch timed out';
        case 'aborted':
            return 'fetch aborted';
        case 'empty_content':
            return 'fetched content produced no indexable chunks';
        case 'fetch_failed':
            return 'fetch failed';
    }
}
export async function handleSessionFetchAndIndex(raw, extra, deps = {}) {
    const input = inputSchema.parse(raw ?? {});
    const store = new SessionMemoryStore(input.dbPath ?? defaultDbPath(input.cwd));
    try {
        const chunks = await fetchAndIndex({
            url: input.url,
            source: input.source,
            store,
            timeoutMs: input.timeoutMs,
            maxBytes: input.maxBytes,
            maxChunks: input.maxChunks,
            signal: extra?.signal,
            fetchImpl: deps.fetchImpl,
        });
        if (chunks.length === 0) {
            const result = payloadFor(input, chunks, ['fetched content produced no indexable chunks']);
            return createSummaryResult(result, { isError: true });
        }
        return createSummaryResult(payloadFor(input, chunks, []));
    }
    catch (error) {
        const fetchError = error instanceof FetchIndexError
            ? error
            : new FetchIndexError('fetch_failed', 'fetch failed', { cause: error });
        const summary = fetchError.code === 'invalid_url'
            ? 'session fetch/index rejected invalid URL'
            : fetchError.code === 'timed_out'
                ? 'session fetch/index timed out'
                : fetchError.code === 'aborted'
                    ? 'session fetch/index aborted'
                    : 'session fetch/index failed';
        const result = payloadFor(input, [], [warningFor(fetchError)], {
            passed: false,
            summary,
            timedOut: fetchError.code === 'timed_out',
            aborted: fetchError.code === 'aborted',
        });
        return createSummaryResult(result, { isError: true });
    }
    finally {
        store.close();
    }
}
const tool = {
    name: 'wp_session_fetch_and_index',
    description: 'Fetch an absolute http(s) URL and index bounded content into the local session-memory index.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'Session fetch and index',
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
    },
    handler: handleSessionFetchAndIndex,
};
export default tool;
//# sourceMappingURL=session-fetch-and-index.js.map