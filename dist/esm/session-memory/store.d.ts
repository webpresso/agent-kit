import type { SessionMemoryChunk, SessionMemorySearchOptions, SessionMemorySearchResult } from './types.js';
export declare class SessionMemoryStore {
    private readonly db;
    private insertsSinceOptimize;
    constructor(dbPath: string | {
        readonly memory: true;
    });
    close(): void;
    indexChunk(chunk: SessionMemoryChunk): void;
    indexChunks(chunks: readonly SessionMemoryChunk[]): void;
    search(options: SessionMemorySearchOptions): SessionMemorySearchResult[];
    count(): number;
    private searchFts;
    private searchLevenshtein;
    private mapResult;
}
//# sourceMappingURL=store.d.ts.map