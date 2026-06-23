/**
 * execution.ts — orchestrator layer.
 *
 * Imports spec, state, and io modules and exposes the high-level actions
 * that CAC command handlers call. No direct node:fs/promises usage here.
 */
import type { BlueprintExecutionArtifacts, BlueprintExecutionBackend, BlueprintLaunchSpec, BlueprintProgressBridgeState, Evidence, OmxTeamTaskSnapshot, RuntimeStateStatus } from '#index';
import { clearBlueprintExecutionState, persistBlueprintExecutionArtifacts, persistBlueprintExecutionMetadata, persistBlueprintProgressBridgeState, readBlueprintExecutionArtifactsState, readBlueprintExecutionState, readBlueprintProgressBridgeState, readBlueprintRuntimeSnapshot, writeBlueprintRuntimeSnapshot } from './execution-io.js';
import { type BlueprintExecutionCompletionEvidence } from './execution-state.js';
import { buildBlueprintExecutionControlCommand, buildBlueprintExecutionLaunchCommand, buildBlueprintExecutionRuntimePaths, buildBlueprintLaunchSpec, type BlueprintExecutionRuntimePaths, type BuildBlueprintLaunchSpecInput } from './execution-spec.js';
export type { BlueprintExecutionCompletionEvidence, BlueprintExecutionRuntimePaths, BuildBlueprintLaunchSpecInput, };
export { buildBlueprintExecutionControlCommand, buildBlueprintExecutionLaunchCommand, buildBlueprintExecutionRuntimePaths, buildBlueprintLaunchSpec, clearBlueprintExecutionState, persistBlueprintExecutionArtifacts, persistBlueprintExecutionMetadata, persistBlueprintProgressBridgeState, readBlueprintExecutionArtifactsState, readBlueprintExecutionState, readBlueprintProgressBridgeState, readBlueprintRuntimeSnapshot, writeBlueprintRuntimeSnapshot, };
export interface ExecutionCommandRunner {
    exec: (command: string, args: string[], options: {
        cwd: string;
    }) => string;
}
export declare const realExecutionCommandRunner: ExecutionCommandRunner;
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
interface SyncBlueprintExecutionProgressOptions {
    evidence?: BlueprintExecutionCompletionEvidence;
    runner?: ExecutionCommandRunner;
}
export declare function launchBlueprintExecution(spec: BlueprintLaunchSpec, projectRoot: string, runner?: ExecutionCommandRunner): BlueprintExecutionLaunchResult;
export declare function describeBlueprintExecutionRuntime(blueprintPath: string): Promise<BlueprintExecutionRuntimeDescription>;
export declare function listOmxTeamTasks(executionId: string, projectRoot: string, runner?: ExecutionCommandRunner): OmxTeamTaskSnapshot[];
export declare function initializeBlueprintExecutionProgressBridge(spec: BlueprintLaunchSpec, executionId: string, projectRoot: string, runner?: ExecutionCommandRunner): Promise<BlueprintProgressBridgeState>;
export declare function reconcileBlueprintRuntimeSnapshot(projectRoot: string, blueprintPath: string, slug: string, snapshot: {
    backend: BlueprintExecutionBackend;
    evidence?: readonly Evidence[];
    executionId: string;
    status: RuntimeStateStatus;
    taskId?: string;
    updatedAt: string;
}, evidence?: BlueprintExecutionCompletionEvidence): Promise<ReconcileBlueprintRuntimeSnapshotResult>;
export declare function syncBlueprintExecutionProgress(blueprintPath: string, slug: string, projectRoot: string, options?: SyncBlueprintExecutionProgressOptions): Promise<SyncBlueprintExecutionProgressResult>;
export declare function controlBlueprintExecution(backend: BlueprintExecutionBackend, action: 'status' | 'resume' | 'stop', executionId: string, projectRoot: string, runner?: ExecutionCommandRunner): BlueprintExecutionControlResult;
export declare function recordLaunchFailure(blueprintPath: string, projectRoot: string, backend: BlueprintExecutionBackend, executionId: string, reason: string): Promise<never>;
export declare function buildStoppedRuntimeEvidence(blueprintPath: string): Promise<BlueprintExecutionCompletionEvidence>;
export declare function readStoredRuntimeSnapshotStatus(blueprintPath: string, projectRoot: string): Promise<RuntimeStateStatus | null>;
//# sourceMappingURL=execution.d.ts.map