export type CheckpointId = string;
export type ThreadId = string;
export interface CheckpointMetadata {
    source: 'auto' | 'user' | 'system';
    step: number;
    createdAt: Date;
    description?: string;
    custom?: Record<string, unknown>;
}
export interface SerializedMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCallId?: string;
    timestamp?: string;
}
export interface SerializedToolCall {
    id?: string;
    name: string;
    input?: Record<string, unknown>;
    args?: Record<string, unknown>;
    output?: unknown;
    result?: unknown;
    status?: 'pending' | 'completed' | 'failed';
    durationMs?: number;
}
export interface SerializedCodeBlock {
    toolCallId: string;
    code: string;
    result?: unknown;
    consoleLogs?: readonly string[];
}
export interface CheckpointState {
    messages: SerializedMessage[];
    toolCalls?: SerializedToolCall[];
    codeBlocks?: readonly SerializedCodeBlock[];
    context?: Record<string, unknown>;
    tokenUsage?: {
        input: number;
        output: number;
        total: number;
    };
}
export interface Checkpoint {
    id: CheckpointId;
    threadId: ThreadId;
    parentId?: CheckpointId;
    state: CheckpointState;
    metadata?: CheckpointMetadata;
    createdAt: Date;
}
export interface CheckpointConfig {
    threadId: ThreadId;
    userId?: string;
    saveInterval?: number;
    maxCheckpoints?: number;
    saveOnEnd?: boolean;
}
export interface ListCheckpointsOptions {
    threadId?: ThreadId;
    limit?: number;
    offset?: number;
    orderBy?: 'createdAt' | 'step';
    order?: 'asc' | 'desc';
}
export interface CheckpointResult {
    success: boolean;
    checkpointId?: CheckpointId;
    error?: string;
}
export interface CheckpointTuple {
    config: CheckpointConfig;
    checkpoint: Checkpoint;
    parentConfig?: CheckpointConfig;
}
//# sourceMappingURL=types.d.ts.map