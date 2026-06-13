import { SessionMemoryStore } from './store.js';
import type { SessionMemoryChunk } from './types.js';
export interface FetchAndIndexOptions {
    url: string;
    store: SessionMemoryStore;
    source?: string;
    now?: number;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}
export declare function clearFetchIndexCache(): void;
export declare function fetchAndIndex(options: FetchAndIndexOptions): Promise<SessionMemoryChunk[]>;
//# sourceMappingURL=fetch-index.d.ts.map