import type { Blueprint } from "#core/parser";
import type { BlueprintExecutionMetadata } from "#execution/metadata";
import type { BlueprintLifecycleIntent } from "#lifecycle/engine";
import { z } from "zod";
import { type BlueprintExecutionBackend, type BlueprintLaunchSpec, type RuntimeStateSnapshot, type RuntimeStateStatus } from "./types.js";
export declare const omxTeamTaskStatusSchema: z.ZodEnum<{
    pending: "pending";
    blocked: "blocked";
    completed: "completed";
    failed: "failed";
    in_progress: "in_progress";
}>;
export type OmxTeamTaskStatus = z.infer<typeof omxTeamTaskStatusSchema>;
export declare const omxTeamTaskSnapshotSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
    evidence: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        command: z.ZodString;
        exit_code: z.ZodNumber;
        result: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
        }>;
        ts: z.ZodString;
        agent: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"test">;
    }, z.core.$strict>, z.ZodObject<{
        target_files: z.ZodArray<z.ZodString>;
        command: z.ZodString;
        exit_code: z.ZodNumber;
        result: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
        }>;
        ts: z.ZodString;
        agent: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"integration">;
    }, z.core.$strict>, z.ZodObject<{
        audit_kind: z.ZodString;
        passed: z.ZodBoolean;
        command: z.ZodOptional<z.ZodString>;
        exit_code: z.ZodOptional<z.ZodNumber>;
        result: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
        }>;
        ts: z.ZodString;
        agent: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"audit">;
    }, z.core.$strict>, z.ZodObject<{
        actor: z.ZodString;
        description: z.ZodString;
        allow_manual: z.ZodLiteral<true>;
        log_excerpt: z.ZodString;
        result: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
        }>;
        ts: z.ZodString;
        agent: z.ZodOptional<z.ZodString>;
        kind: z.ZodLiteral<"manual">;
    }, z.core.$strict>], "kind">>>;
    result: z.ZodOptional<z.ZodString>;
    runtimeTaskId: z.ZodString;
    status: z.ZodEnum<{
        pending: "pending";
        blocked: "blocked";
        completed: "completed";
        failed: "failed";
        in_progress: "in_progress";
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
        "claude-subagent": "claude-subagent";
        "codex-exec": "codex-exec";
        "local-worktree": "local-worktree";
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