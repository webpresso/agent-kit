import { SessionMemoryStore } from './store.js';
import type { SessionMemoryChunk } from './types.js';
export type FetchIndexErrorCode = 'invalid_url' | 'http_error' | 'invalid_json' | 'empty_content' | 'body_too_large' | 'timed_out' | 'aborted' | 'fetch_failed';
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
    fetchImpl?: typeof fetch;
}
export declare function fetchAndIndex(options: FetchAndIndexOptions): Promise<SessionMemoryChunk[]>;
//# sourceMappingURL=fetch-index.d.ts.map