import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
import type { SessionMemoryUnifiedResult, SessionMemoryUnifiedSourceType } from '#session-memory/types.js';
export declare const sessionRecallInputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    sessionDbPath: z.ZodOptional<z.ZodString>;
    indexDbPath: z.ZodOptional<z.ZodString>;
    repoHash: z.ZodOptional<z.ZodString>;
    query: z.ZodDefault<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
    sourceTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        continuity_event: "continuity_event";
        indexed_chunk: "indexed_chunk";
    }>>>;
    limit: z.ZodOptional<z.ZodNumber>;
    maxPreviewBytes: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, z.core.$strict>;
export type SessionRecallInput = z.infer<typeof sessionRecallInputSchema>;
export declare const sessionRecallOutputSchema: z.ZodObject<{
    [x: string]: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
    results: z.ZodArray<z.ZodObject<{
        sourceType: z.ZodEnum<{
            continuity_event: "continuity_event";
            indexed_chunk: "indexed_chunk";
        }>;
        provenance: z.ZodObject<{
            kind: z.ZodEnum<{
                continuity_event: "continuity_event";
                indexed_chunk: "indexed_chunk";
            }>;
            id: z.ZodString;
            source: z.ZodOptional<z.ZodString>;
            repoHash: z.ZodOptional<z.ZodString>;
            sessionId: z.ZodOptional<z.ZodString>;
            eventId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        dedupeKey: z.ZodString;
        score: z.ZodNumber;
        tier: z.ZodString;
        timestamp: z.ZodString;
        preview: z.ZodString;
        metadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>>;
    warnings: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export interface SessionRecallPayload {
    readonly [key: string]: unknown;
    readonly passed: boolean;
    readonly summary: string;
    readonly counts: {
        readonly resultCount: number;
        readonly continuityEventCount: number;
        readonly indexedChunkCount: number;
        readonly warningCount: number;
    };
    readonly results: readonly SessionMemoryUnifiedResult[];
    readonly warnings: readonly string[];
    readonly details: {
        readonly results: readonly SessionMemoryUnifiedResult[];
        readonly warnings: readonly string[];
    };
}
type RecallMode = 'restore' | 'search';
export interface BuildRecallPayloadInput {
    readonly input: SessionRecallInput;
    readonly mode: RecallMode;
    readonly sourcePriority: readonly SessionMemoryUnifiedSourceType[];
}
export declare function defaultSessionDbPath(cwd?: string): string;
export declare function defaultIndexDbPath(cwd?: string): string;
export declare function buildRecallPayload(rawInput: SessionRecallInput, mode: RecallMode): SessionRecallPayload;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=session-restore.d.ts.map