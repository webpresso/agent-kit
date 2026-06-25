/**
 * execution-spec.ts — pure spec-building / env-composition logic.
 *
 * Zero I/O. All functions take inputs and return structured objects.
 * Tested by execution-spec.test.ts.
 */
import type { BlueprintExecutionArtifacts, BlueprintExecutionBackend, BlueprintLaunchSpec, RuntimeStateStatus } from "#index";
import type { Blueprint } from "#local";
export interface BuildBlueprintLaunchSpecInput {
    blueprint: Blueprint;
    blueprintPath: string;
    blueprintSlug: string;
}
export interface BlueprintExecutionRuntimePaths {
    artifactPaths: string[];
    bridgePath: string;
    logPath?: string;
    runtimeSnapshotPath: string;
    teamStateRoot: string;
}
export declare function nowIsoTimestamp(): string;
export declare function toProjectRelativePath(projectRoot: string, targetPath: string): string;
export declare function uniqueStrings(values: string[]): string[];
export declare function isMissingFileError(error: unknown): boolean;
export declare function buildListTasksVerificationCommand(executionId: string): string;
export declare function resolveRuntimeSnapshotRelativePath(executionId: string, runtimeStateRoot?: string): string;
export declare function resolveTeamStateRelativePath(executionId: string, runtimeStateRoot?: string): string;
export declare function resolveBridgeRelativePath(backend: BlueprintExecutionBackend, executionId: string, runtimeStateRoot?: string): string;
export declare function resolveBridgeAbsolutePath(projectRoot: string, backend: BlueprintExecutionBackend, executionId: string, runtimeStateRoot?: string): string;
export declare function resolveRuntimeSnapshotAbsolutePath(projectRoot: string, executionId: string, runtimeStateRoot?: string): string;
export declare function buildBlueprintLaunchSpec(input: BuildBlueprintLaunchSpecInput): BlueprintLaunchSpec;
export declare function buildBlueprintExecutionLaunchCommand(spec: BlueprintLaunchSpec): {
    args: string[];
    command: string;
    workerCount: number;
};
export declare function parseTeamExecutionId(output: string): string;
export declare function buildBlueprintExecutionControlCommand(backend: BlueprintExecutionBackend, action: "status" | "resume" | "stop", executionId: string): {
    args: string[];
    command: string;
};
export declare function parseOmxTeamApiResponse<T>(output: string, operation: string): T;
export declare function buildBlueprintExecutionRuntimePaths(backend: BlueprintExecutionBackend, executionId: string, artifacts: BlueprintExecutionArtifacts | null): BlueprintExecutionRuntimePaths;
export declare function resolveControlStatus(action: "status" | "resume" | "stop"): RuntimeStateStatus;
//# sourceMappingURL=execution-spec.d.ts.map