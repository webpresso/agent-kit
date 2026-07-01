import { z } from "zod";
import { type Evidence } from "#evidence.js";
import { type BlueprintExecutionBackend } from "#types/execution-backend.js";
export { executionBackendSchema, type BlueprintExecutionBackend, } from "#types/execution-backend.js";
export declare const blueprintExecutionModeSchema: z.ZodEnum<{
    durable: "durable";
    interactive: "interactive";
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
        durable: "durable";
        interactive: "interactive";
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
        durable: "durable";
        interactive: "interactive";
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
export declare const blueprintDerivedHandoffCodexGoalSchema: z.ZodObject<{
    objective_hash: z.ZodOptional<z.ZodString>;
    status_at_handoff: z.ZodOptional<z.ZodString>;
    thread_id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type BlueprintDerivedHandoffCodexGoal = z.infer<typeof blueprintDerivedHandoffCodexGoalSchema>;
export declare const blueprintDerivedHandoffOmxContextSchema: z.ZodObject<{
    execution_id: z.ZodOptional<z.ZodString>;
    goal_id: z.ZodOptional<z.ZodString>;
    ledger_path: z.ZodOptional<z.ZodString>;
    mode: z.ZodOptional<z.ZodString>;
    plan_path: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
    state_paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type BlueprintDerivedHandoffOmxContext = z.infer<typeof blueprintDerivedHandoffOmxContextSchema>;
export declare const blueprintDerivedHandoffSchema: z.ZodObject<{
    blueprint_path: z.ZodString;
    blueprint_slug: z.ZodString;
    codex_goal: z.ZodOptional<z.ZodObject<{
        objective_hash: z.ZodOptional<z.ZodString>;
        status_at_handoff: z.ZodOptional<z.ZodString>;
        thread_id: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    content_hash: z.ZodString;
    derived: z.ZodLiteral<true>;
    generated_at: z.ZodOptional<z.ZodString>;
    generated_by: z.ZodOptional<z.ZodString>;
    head_at_ingest: z.ZodNullable<z.ZodString>;
    "non-authoritative": z.ZodLiteral<true>;
    omx_context: z.ZodOptional<z.ZodObject<{
        execution_id: z.ZodOptional<z.ZodString>;
        goal_id: z.ZodOptional<z.ZodString>;
        ledger_path: z.ZodOptional<z.ZodString>;
        mode: z.ZodOptional<z.ZodString>;
        plan_path: z.ZodOptional<z.ZodString>;
        session_id: z.ZodOptional<z.ZodString>;
        state_paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BlueprintDerivedHandoff = z.infer<typeof blueprintDerivedHandoffSchema>;
export declare const runtimeStateStatusSchema: z.ZodEnum<{
    pending: "pending";
    running: "running";
    blocked: "blocked";
    completed: "completed";
    failed: "failed";
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
    executionId: z.ZodString;
    status: z.ZodEnum<{
        pending: "pending";
        running: "running";
        blocked: "blocked";
        completed: "completed";
        failed: "failed";
        stopped: "stopped";
    }>;
    taskId: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type RuntimeStateSnapshot = z.infer<typeof runtimeStateSnapshotSchema>;
export type RuntimeStateSnapshotEvidence = Evidence;
export interface BlueprintExecutionAdapter {
    readonly backend: BlueprintExecutionBackend;
    buildLaunchCommand(spec: BlueprintLaunchSpec): {
        args: string[];
        command: string;
    };
}
export declare const DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT = ".omx/state";
//# sourceMappingURL=types.d.ts.map