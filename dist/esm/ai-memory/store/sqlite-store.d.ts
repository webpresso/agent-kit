import { BaseCheckpointSaver } from "#ai-memory/checkpoint/saver.js";
import type { Checkpoint, CheckpointConfig, CheckpointId, CheckpointResult, CheckpointState, ListCheckpointsOptions, ThreadId } from "#ai-memory/checkpoint/types.js";
import type { FactDatabase } from "#ai-memory/facts/consolidator.js";
import type { Fact, FactId, FactRetrievalOptions, RetrievedFact } from "#ai-memory/facts/types.js";
import type { MemoryStore } from "#ai-memory/hierarchy/retriever.js";
export declare class SqliteAiMemoryStore extends BaseCheckpointSaver implements FactDatabase, MemoryStore {
    private readonly db;
    constructor(dbPath: string);
    close(): void;
    save(config: CheckpointConfig, state: CheckpointState, parentId?: CheckpointId): Promise<CheckpointResult>;
    loadLatest(threadId: ThreadId): Promise<Checkpoint | null>;
    load(checkpointId: CheckpointId): Promise<Checkpoint | null>;
    list(options?: ListCheckpointsOptions): Promise<Checkpoint[]>;
    delete(checkpointId: CheckpointId): Promise<CheckpointResult>;
    delete(id: FactId): Promise<void>;
    clearThread(threadId: ThreadId): Promise<CheckpointResult>;
    findByThread(threadId: string): Promise<Fact[]>;
    update(id: FactId, updates: Partial<Fact>): Promise<void>;
    insert(fact: Fact): Promise<void>;
    getLatestCheckpoint(threadId: string): Promise<Checkpoint | null>;
    getFacts(options: FactRetrievalOptions): Promise<RetrievedFact[]>;
    touchFact(factId: string): Promise<void>;
    private getFactById;
    private estimateRelevance;
    private mapCheckpoint;
    private mapFact;
}
//# sourceMappingURL=sqlite-store.d.ts.map