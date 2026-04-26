import type { BlueprintExecutionArtifacts, BlueprintExecutionBackend, BlueprintLaunchSpec, BlueprintProgressBridgeState, OmxTeamTaskSnapshot, RuntimeStateStatus } from '#index';
import type { Blueprint } from '#local';
export interface ExecutionCommandRunner {
    exec: (command: string, args: string[], options: {
        cwd: string;
    }) => string;
}
export declare const realExecutionCommandRunner: ExecutionCommandRunner;
export interface BuildBlueprintLaunchSpecInput {
    blueprint: Blueprint;
    blueprintPath: string;
    blueprintSlug: string;
}
export interface BlueprintExecutionLaunchResult {
    args: string[];
    backend: BlueprintExecutionBackend;
    command: string;
    executionId: string;
    output: string;
    workerCount: number;
}
export interface BlueprintExecutionControlResult {
    backend: BlueprintExecutionBackend;
    executionId: string;
    output: string;
    status: RuntimeStateStatus;
}
export interface BlueprintExecutionRuntimePaths {
    artifactPaths: string[];
    bridgePath: string;
    logPath?: string;
    runtimeSnapshotPath: string;
    teamStateRoot: string;
}
export interface BlueprintExecutionRuntimeDescription {
    artifacts: BlueprintExecutionArtifacts | null;
    backend: BlueprintExecutionBackend;
    executionId: string;
    paths: BlueprintExecutionRuntimePaths;
    status: RuntimeStateStatus;
}
export interface SyncBlueprintExecutionProgressResult {
    blueprintPath: string;
    bridgePath: string;
    executionId: string;
    runtimeSnapshotPath: string;
    status: RuntimeStateStatus;
    teamStateRoot: string;
}
export interface ReconcileBlueprintRuntimeSnapshotResult {
    moved: boolean;
    path: string;
    status: RuntimeStateStatus;
}
export interface BlueprintExecutionCompletionEvidence {
    artifacts: string[];
    logPath?: string;
    verifications: string[];
}
interface SyncBlueprintExecutionProgressOptions {
    evidence?: BlueprintExecutionCompletionEvidence;
    runner?: ExecutionCommandRunner;
}
export declare function buildBlueprintLaunchSpec(input: BuildBlueprintLaunchSpecInput): BlueprintLaunchSpec;
export declare function buildBlueprintExecutionLaunchCommand(spec: BlueprintLaunchSpec): {
    args: string[];
    command: string;
    workerCount: number;
};
export declare function launchBlueprintExecution(spec: BlueprintLaunchSpec, projectRoot: string, runner?: ExecutionCommandRunner): BlueprintExecutionLaunchResult;
export declare function buildBlueprintExecutionControlCommand(backend: BlueprintExecutionBackend, action: 'status' | 'resume' | 'stop', executionId: string): {
    args: string[];
    command: string;
};
export declare function persistBlueprintExecutionMetadata(blueprintPath: string, metadata: {
    backend: BlueprintExecutionBackend;
    executionId: string;
    status: RuntimeStateStatus;
    updatedAt: string;
}): Promise<void>;
export declare function readBlueprintExecutionState(blueprintPath: string): Promise<import("#index").BlueprintExecutionMetadata | null>;
export declare function clearBlueprintExecutionState(blueprintPath: string): Promise<void>;
export declare function persistBlueprintExecutionArtifacts(blueprintPath: string, evidence: BlueprintExecutionCompletionEvidence): Promise<void>;
export declare function readBlueprintExecutionArtifactsState(blueprintPath: string): Promise<BlueprintExecutionArtifacts | null>;
export declare function buildBlueprintExecutionRuntimePaths(backend: BlueprintExecutionBackend, executionId: string, artifacts: BlueprintExecutionArtifacts | null): BlueprintExecutionRuntimePaths;
export declare function describeBlueprintExecutionRuntime(blueprintPath: string): Promise<BlueprintExecutionRuntimeDescription>;
export declare function persistBlueprintProgressBridgeState(projectRoot: string, bridge: BlueprintProgressBridgeState, runtimeStateRoot?: string): Promise<string>;
export declare function readBlueprintProgressBridgeState(projectRoot: string, backend: BlueprintExecutionBackend, executionId: string, runtimeStateRoot?: string): Promise<BlueprintProgressBridgeState>;
export declare function writeBlueprintRuntimeSnapshot(projectRoot: string, snapshot: {
    backend: BlueprintExecutionBackend;
    executionId: string;
    status: RuntimeStateStatus;
    taskId?: string;
    updatedAt: string;
}, runtimeStateRoot?: string): Promise<string>;
export declare function readBlueprintRuntimeSnapshot(projectRoot: string, executionId: string, runtimeStateRoot?: string): Promise<{
    backend: "omx-team" | "omx-pll-interactive";
    executionId: string;
    status: "completed" | "blocked" | "pending" | "running" | "failed" | "stopped";
    updatedAt: string;
    taskId?: string | undefined;
}>;
export declare function reconcileBlueprintRuntimeSnapshot(projectRoot: string, blueprintPath: string, slug: string, snapshot: {
    backend: BlueprintExecutionBackend;
    executionId: string;
    status: RuntimeStateStatus;
    taskId?: string;
    updatedAt: string;
}, evidence?: BlueprintExecutionCompletionEvidence): Promise<ReconcileBlueprintRuntimeSnapshotResult>;
export declare function listOmxTeamTasks(executionId: string, projectRoot: string, runner?: ExecutionCommandRunner): OmxTeamTaskSnapshot[];
export declare function initializeBlueprintExecutionProgressBridge(spec: BlueprintLaunchSpec, executionId: string, projectRoot: string, runner?: ExecutionCommandRunner): Promise<BlueprintProgressBridgeState>;
export declare function syncBlueprintExecutionProgress(blueprintPath: string, slug: string, projectRoot: string, options?: SyncBlueprintExecutionProgressOptions): Promise<SyncBlueprintExecutionProgressResult>;
export declare function controlBlueprintExecution(backend: BlueprintExecutionBackend, action: 'status' | 'resume' | 'stop', executionId: string, projectRoot: string, runner?: ExecutionCommandRunner): BlueprintExecutionControlResult;
export declare function recordLaunchFailure(blueprintPath: string, projectRoot: string, backend: BlueprintExecutionBackend, executionId: string, reason: string): Promise<never>;
export declare function buildStoppedRuntimeEvidence(blueprintPath: string): Promise<BlueprintExecutionCompletionEvidence>;
export declare function readStoredRuntimeSnapshotStatus(blueprintPath: string, projectRoot: string): Promise<RuntimeStateStatus | null>;
export {};
//# sourceMappingURL=execution.d.ts.map