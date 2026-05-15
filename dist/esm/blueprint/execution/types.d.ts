import { z } from 'zod';
import { type BlueprintExecutionBackend } from '#types/execution-backend.js';
export { executionBackendSchema, type BlueprintExecutionBackend } from '#types/execution-backend.js';
export declare const blueprintExecutionModeSchema: z.ZodEnum<{
    interactive: "interactive";
    durable: "durable";
}>;
export type BlueprintExecutionMode = z.infer<typeof blueprintExecutionModeSchema>;
export declare const blueprintTaskBackendHintsSchema: z.ZodObject<{
    buildHeavy: z.ZodOptional<z.ZodBoolean>;
    longRunning: z.ZodOptional<z.ZodBoolean>;
    testHeavy: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type BlueprintTaskBackendHints = z.infer<typeof blueprintTaskBackendHintsSchema>;
export declare const blueprintTaskLaunchSpecSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    dependsOn: z.ZodDefault<z.ZodArray<z.ZodString>>;
    files: z.ZodDefault<z.ZodArray<z.ZodString>>;
    verificationCommands: z.ZodDefault<z.ZodArray<z.ZodString>>;
    concurrencyGroup: z.ZodOptional<z.ZodString>;
    backendHints: z.ZodDefault<z.ZodObject<{
        buildHeavy: z.ZodOptional<z.ZodBoolean>;
        longRunning: z.ZodOptional<z.ZodBoolean>;
        testHeavy: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BlueprintTaskLaunchSpec = z.infer<typeof blueprintTaskLaunchSpecSchema>;
export declare const blueprintExecutionPolicySchema: z.ZodObject<{
    maxParallelism: z.ZodOptional<z.ZodNumber>;
    preferWorktree: z.ZodDefault<z.ZodBoolean>;
    requireVerificationForCompletion: z.ZodDefault<z.ZodBoolean>;
    runtimeStateRoot: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type BlueprintExecutionPolicy = z.infer<typeof blueprintExecutionPolicySchema>;
export declare const blueprintLaunchSpecSchema: z.ZodObject<{
    backend: z.ZodEnum<{
        "omx-team": "omx-team";
        "omx-pll-interactive": "omx-pll-interactive";
        "claude-subagent": "claude-subagent";
        "codex-exec": "codex-exec";
        "local-worktree": "local-worktree";
    }>;
    blueprintPath: z.ZodString;
    blueprintSlug: z.ZodString;
    mode: z.ZodEnum<{
        interactive: "interactive";
        durable: "durable";
    }>;
    policy: z.ZodObject<{
        maxParallelism: z.ZodOptional<z.ZodNumber>;
        preferWorktree: z.ZodDefault<z.ZodBoolean>;
        requireVerificationForCompletion: z.ZodDefault<z.ZodBoolean>;
        runtimeStateRoot: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>;
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        dependsOn: z.ZodDefault<z.ZodArray<z.ZodString>>;
        files: z.ZodDefault<z.ZodArray<z.ZodString>>;
        verificationCommands: z.ZodDefault<z.ZodArray<z.ZodString>>;
        concurrencyGroup: z.ZodOptional<z.ZodString>;
        backendHints: z.ZodDefault<z.ZodObject<{
            buildHeavy: z.ZodOptional<z.ZodBoolean>;
            longRunning: z.ZodOptional<z.ZodBoolean>;
            testHeavy: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BlueprintLaunchSpec = z.infer<typeof blueprintLaunchSpecSchema>;
export declare const blueprintExecutionSpecSchema: z.ZodObject<{
    backend: z.ZodEnum<{
        "omx-team": "omx-team";
        "omx-pll-interactive": "omx-pll-interactive";
        "claude-subagent": "claude-subagent";
        "codex-exec": "codex-exec";
        "local-worktree": "local-worktree";
    }>;
    blueprintPath: z.ZodString;
    blueprintSlug: z.ZodString;
    mode: z.ZodEnum<{
        interactive: "interactive";
        durable: "durable";
    }>;
    policy: z.ZodObject<{
        maxParallelism: z.ZodOptional<z.ZodNumber>;
        preferWorktree: z.ZodDefault<z.ZodBoolean>;
        requireVerificationForCompletion: z.ZodDefault<z.ZodBoolean>;
        runtimeStateRoot: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>;
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        dependsOn: z.ZodDefault<z.ZodArray<z.ZodString>>;
        files: z.ZodDefault<z.ZodArray<z.ZodString>>;
        verificationCommands: z.ZodDefault<z.ZodArray<z.ZodString>>;
        concurrencyGroup: z.ZodOptional<z.ZodString>;
        backendHints: z.ZodDefault<z.ZodObject<{
            buildHeavy: z.ZodOptional<z.ZodBoolean>;
            longRunning: z.ZodOptional<z.ZodBoolean>;
            testHeavy: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BlueprintExecutionSpec = BlueprintLaunchSpec;
export declare const runtimeStateStatusSchema: z.ZodEnum<{
    completed: "completed";
    pending: "pending";
    failed: "failed";
    blocked: "blocked";
    running: "running";
    stopped: "stopped";
}>;
export type RuntimeStateStatus = z.infer<typeof runtimeStateStatusSchema>;
export declare const runtimeStateSnapshotSchema: z.ZodObject<{
    backend: z.ZodEnum<{
        "omx-team": "omx-team";
        "omx-pll-interactive": "omx-pll-interactive";
        "claude-subagent": "claude-subagent";
        "codex-exec": "codex-exec";
        "local-worktree": "local-worktree";
    }>;
    executionId: z.ZodString;
    status: z.ZodEnum<{
        completed: "completed";
        pending: "pending";
        failed: "failed";
        blocked: "blocked";
        running: "running";
        stopped: "stopped";
    }>;
    taskId: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type RuntimeStateSnapshot = z.infer<typeof runtimeStateSnapshotSchema>;
export interface BlueprintExecutionAdapter {
    readonly backend: BlueprintExecutionBackend;
    buildLaunchCommand(spec: BlueprintLaunchSpec): {
        args: string[];
        command: string;
    };
}
export declare const DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT = ".omx/state";
//# sourceMappingURL=types.d.ts.map