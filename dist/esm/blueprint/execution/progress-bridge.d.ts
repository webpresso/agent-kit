import type { Blueprint } from '#core/parser';
import type { BlueprintExecutionMetadata } from '#execution/metadata';
import type { BlueprintLifecycleIntent } from '#lifecycle/engine';
import { z } from 'zod';
import { type BlueprintExecutionBackend, type BlueprintLaunchSpec, type RuntimeStateSnapshot, type RuntimeStateStatus } from './types.js';
export declare const omxTeamTaskStatusSchema: z.ZodEnum<{
    completed: "completed";
    in_progress: "in_progress";
    blocked: "blocked";
    pending: "pending";
    failed: "failed";
}>;
export type OmxTeamTaskStatus = z.infer<typeof omxTeamTaskStatusSchema>;
export declare const omxTeamTaskSnapshotSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
    result: z.ZodOptional<z.ZodString>;
    runtimeTaskId: z.ZodString;
    status: z.ZodEnum<{
        completed: "completed";
        in_progress: "in_progress";
        blocked: "blocked";
        pending: "pending";
        failed: "failed";
    }>;
    subject: z.ZodString;
}, z.core.$strip>;
export type OmxTeamTaskSnapshot = z.infer<typeof omxTeamTaskSnapshotSchema>;
export declare const blueprintProgressBridgeTaskBindingSchema: z.ZodObject<{
    blueprintTaskId: z.ZodString;
    runtimeTaskId: z.ZodString;
    title: z.ZodString;
}, z.core.$strip>;
export type BlueprintProgressBridgeTaskBinding = z.infer<typeof blueprintProgressBridgeTaskBindingSchema>;
export declare const blueprintProgressBridgeStateSchema: z.ZodObject<{
    backend: z.ZodEnum<{
        "omx-team": "omx-team";
        "omx-pll-interactive": "omx-pll-interactive";
    }>;
    blueprintPath: z.ZodString;
    blueprintSlug: z.ZodString;
    executionId: z.ZodString;
    tasks: z.ZodArray<z.ZodObject<{
        blueprintTaskId: z.ZodString;
        runtimeTaskId: z.ZodString;
        title: z.ZodString;
    }, z.core.$strip>>;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type BlueprintProgressBridgeState = z.infer<typeof blueprintProgressBridgeStateSchema>;
export interface BlueprintProgressBridgeProjection {
    intents: BlueprintLifecycleIntent[];
    status: RuntimeStateStatus;
}
export interface RuntimeProgressBridgeResult {
    appliedTransitions: string[];
    blueprint: Blueprint;
    execution: BlueprintExecutionMetadata;
    markdown: string;
}
export declare function buildBlueprintProgressBridgeState(spec: BlueprintLaunchSpec, executionId: string, runtimeTasks: OmxTeamTaskSnapshot[], updatedAt: string): BlueprintProgressBridgeState;
export declare function projectBlueprintLifecycleFromRuntime(blueprint: Blueprint, bridge: BlueprintProgressBridgeState, runtimeTasks: OmxTeamTaskSnapshot[]): BlueprintProgressBridgeProjection;
export declare function normalizeOmxTeamTaskSnapshot(input: Record<string, unknown>): OmxTeamTaskSnapshot;
export declare function sanitizeBlueprintExecutionId(executionId: string): string;
export declare function resolveBlueprintProgressBridgePath(runtimeStateRoot: string, backend: BlueprintExecutionBackend, executionId: string): string;
export declare function runtimeSnapshotPathForExecution(executionId: string, runtimeStateRoot?: string): string;
export declare function applyRuntimeProgressSnapshot(markdown: string, slug: string, input: RuntimeStateSnapshot): RuntimeProgressBridgeResult;
//# sourceMappingURL=progress-bridge.d.ts.map