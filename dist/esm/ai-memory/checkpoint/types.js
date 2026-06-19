import { z } from 'zod';
export const SerializedMessageSchema = z.looseObject({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string(),
    toolCallId: z.string().optional(),
    timestamp: z.string().optional(),
});
export const SerializedToolCallSchema = z.looseObject({
    id: z.string().optional(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()).optional(),
    args: z.record(z.string(), z.unknown()).optional(),
    output: z.unknown().optional(),
    result: z.unknown().optional(),
    status: z.enum(['pending', 'completed', 'failed']).optional(),
    durationMs: z.number().optional(),
});
export const SerializedCodeBlockSchema = z.looseObject({
    toolCallId: z.string(),
    code: z.string(),
    result: z.unknown().optional(),
    consoleLogs: z.array(z.string()).optional(),
});
export const CheckpointStateSchema = z.looseObject({
    messages: z.array(SerializedMessageSchema),
    toolCalls: z.array(SerializedToolCallSchema).optional(),
    codeBlocks: z.array(SerializedCodeBlockSchema).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
    tokenUsage: z
        .looseObject({
        input: z.number(),
        output: z.number(),
        total: z.number(),
    })
        .optional(),
});
export const CheckpointMetadataSchema = z.looseObject({
    source: z.enum(['auto', 'user', 'system']),
    step: z.number(),
    createdAt: z.coerce.date(),
    description: z.string().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
});
//# sourceMappingURL=types.js.map