import { SessionMemoryStore } from './store.js';
import type { SessionMemoryChunk } from './types.js';
export type FetchIndexErrorCode = 'invalid_url' | 'blocked_host' | 'http_error' | 'invalid_json' | 'empty_content' | 'body_too_large' | 'timed_out' | 'aborted' | 'fetch_failed' | 'too_many_redirects';
export declare class FetchIndexError extends Error {
    readonly code: FetchIndexErrorCode;
    readonly status?: number;
    constructor(code: FetchIndexErrorCode, message: string, options?: {
        status?: number;
        cause?: unknown;
    });
}
export interface FetchAndIndexOptions {
    url: string;
    store: SessionMemoryStore;
    source?: string;
    now?: number;
    timeoutMs?: number;
    maxBytes?: number;
    maxChunks?: number;
    signal?: AbortSignal;
}
export declare function fetchAndIndex(options: FetchAndIndexOptions, deps?: {
    readonly fetchImpl?: typeof fetch;
    /** Internal/test-only escape hatch for loopback fixtures; never exposed in CLI/MCP input. */
    readonly allowedHosts?: readonly string[];
}): Promise<SessionMemoryChunk[]>;
//# sourceMappingURL=fetch-index.d.ts.map