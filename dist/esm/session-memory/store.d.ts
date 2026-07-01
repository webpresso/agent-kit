import type { SessionMemoryChunk, SessionMemorySearchOptions, SessionMemorySearchResult, ChunkInsertInput, SearchHit, SearchOptions, SessionMemoryUnifiedResult, SessionMemoryExactChunk } from "./types.js";
import type { SessionGainEventInput, SessionGainStats } from "./gain-types.js";
export interface SessionMemoryIndexStats {
    chunkCount: number;
    sourceCount: number;
    sources: string[];
}
export interface SessionMemoryIndexPurgeOptions {
    source?: string;
    confirm?: boolean;
    allowGlobal?: boolean;
}
export interface SessionMemoryIndexPurgeResult {
    dryRun: boolean;
    matchedCount: number;
    deletedCount: number;
    matchedGainEventCount: number;
    deletedGainEventCount: number;
    source?: string;
    warnings: string[];
}
export interface SessionMemoryIndexDoctorResult {
    ok: boolean;
    chunkCount: number;
    sourceCount: number;
    warnings: string[];
}
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
    searchUnified(options: SessionMemorySearchOptions): SessionMemoryUnifiedResult[];
    getChunkById(id: string): SessionMemoryExactChunk | undefined;
    getChunksBySource(source: string): SessionMemoryExactChunk[];
    count(): number;
    stats(): SessionMemoryIndexStats;
    recordGainEvent(event: SessionGainEventInput): string;
    gainStats(): SessionGainStats;
    purge(options?: SessionMemoryIndexPurgeOptions): SessionMemoryIndexPurgeResult;
    private deleteNativeSourceTables;
    private tableExists;
    doctor(): SessionMemoryIndexDoctorResult;
    private searchFts;
    private searchLevenshtein;
    private mapUnifiedResult;
    private mapResult;
}
export interface SessionStore {
    insertChunks(chunks: readonly ChunkInsertInput[]): void;
    search(options: SearchOptions): readonly SearchHit[];
    getDbPath(): string;
}
export declare function getStore(dbPath: string): SessionStore;
export declare function resetStoreCacheForTests(): void;
//# sourceMappingURL=store.d.ts.map