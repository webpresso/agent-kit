import type { Checkpoint, CheckpointConfig, CheckpointId, CheckpointResult, CheckpointState, CheckpointTuple, ListCheckpointsOptions, ThreadId } from "./types.js";
export declare abstract class BaseCheckpointSaver {
    abstract save(config: CheckpointConfig, state: CheckpointState, parentId?: CheckpointId): Promise<CheckpointResult>;
    abstract loadLatest(threadId: ThreadId): Promise<Checkpoint | null>;
    abstract load(checkpointId: CheckpointId): Promise<Checkpoint | null>;
    abstract list(options?: ListCheckpointsOptions): Promise<Checkpoint[]>;
    abstract delete(checkpointId: CheckpointId): Promise<CheckpointResult>;
    abstract clearThread(threadId: ThreadId): Promise<CheckpointResult>;
    getTuple(config: CheckpointConfig): Promise<CheckpointTuple | null>;
    put(config: CheckpointConfig, checkpoint: Omit<Checkpoint, "id" | "createdAt">): Promise<CheckpointResult>;
}
export declare function generateCheckpointId(): CheckpointId;
export declare function generateThreadId(): ThreadId;
//# sourceMappingURL=saver.d.ts.map