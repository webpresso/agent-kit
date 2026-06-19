import { z } from 'zod';
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
export declare const SerializedMessageSchema: z.ZodObject<{
    role: z.ZodEnum<{
        system: "system";
        user: "user";
        assistant: "assistant";
        tool: "tool";
    }>;
    content: z.ZodString;
    toolCallId: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export declare const SerializedToolCallSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    output: z.ZodOptional<z.ZodUnknown>;
    result: z.ZodOptional<z.ZodUnknown>;
    status: z.ZodOptional<z.ZodEnum<{
        pending: "pending";
        completed: "completed";
        failed: "failed";
    }>>;
    durationMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$loose>;
export declare const SerializedCodeBlockSchema: z.ZodObject<{
    toolCallId: z.ZodString;
    code: z.ZodString;
    result: z.ZodOptional<z.ZodUnknown>;
    consoleLogs: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$loose>;
export declare const CheckpointStateSchema: z.ZodObject<{
    messages: z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<{
            system: "system";
            user: "user";
            assistant: "assistant";
            tool: "tool";
        }>;
        content: z.ZodString;
        toolCallId: z.ZodOptional<z.ZodString>;
        timestamp: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>;
    toolCalls: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        output: z.ZodOptional<z.ZodUnknown>;
        result: z.ZodOptional<z.ZodUnknown>;
        status: z.ZodOptional<z.ZodEnum<{
            pending: "pending";
            completed: "completed";
            failed: "failed";
        }>>;
        durationMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$loose>>>;
    codeBlocks: z.ZodOptional<z.ZodArray<z.ZodObject<{
        toolCallId: z.ZodString;
        code: z.ZodString;
        result: z.ZodOptional<z.ZodUnknown>;
        consoleLogs: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$loose>>>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    tokenUsage: z.ZodOptional<z.ZodObject<{
        input: z.ZodNumber;
        output: z.ZodNumber;
        total: z.ZodNumber;
    }, z.core.$loose>>;
}, z.core.$loose>;
export declare const CheckpointMetadataSchema: z.ZodObject<{
    source: z.ZodEnum<{
        system: "system";
        auto: "auto";
        user: "user";
    }>;
    step: z.ZodNumber;
    createdAt: z.ZodCoercedDate<unknown>;
    description: z.ZodOptional<z.ZodString>;
    custom: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$loose>;
//# sourceMappingURL=types.d.ts.map