import type { BlueprintExecutionSpec } from '#index';
import type { CAC } from 'cac';
import { type Blueprint, type BlueprintAuditResult, type CreatedBlueprint, type BlueprintSummary, planStatusSchema } from '#local';
export { formatBlueprintSummaries } from './router-output.js';
type BlueprintStatus = (typeof planStatusSchema.options)[number];
interface BlueprintListOptions {
    json?: boolean;
    noTui?: boolean;
    onlyRoadmaps?: boolean;
    projectRoot?: string;
    status?: string;
}
interface BlueprintShowOptions {
    json?: boolean;
    projectRoot?: string;
}
interface BlueprintMoveOptions {
    forceRecovery?: boolean;
    json?: boolean;
    projectRoot?: string;
}
interface BlueprintAuditOptions {
    all?: boolean;
    json?: boolean;
    projectRoot?: string;
    staged?: boolean;
    strict?: boolean;
}
interface BlueprintNewOptions {
    complexity?: string;
    json?: boolean;
    projectRoot?: string;
    templatePath?: string;
    type?: string;
}
export interface BlueprintCommandOptions extends BlueprintAuditOptions, BlueprintMoveOptions, BlueprintListOptions, BlueprintNewOptions {
    reason?: string;
    '--': string[];
}
export interface ShowBlueprintResult {
    blueprint: Blueprint;
    location: {
        path: string;
        projectRoot: string;
    };
    slug: string;
}
export interface MoveBlueprintResult {
    fromPath: string;
    fromStatus: string;
    message: string;
    moved: boolean;
    slug: string;
    toPath: string;
    toStatus: BlueprintStatus;
    updated: boolean;
}
export interface BlueprintLifecycleMutationResult {
    message: string;
    moved: boolean;
    progress: string;
    slug: string;
    status: string;
    taskId?: string;
}
export interface CreateBlueprintResult extends CreatedBlueprint {
    message: string;
}
export interface ExecuteBlueprintResult {
    action: 'launch' | 'status' | 'resume' | 'stop' | 'logs';
    backend: string;
    executionId: string;
    artifactPaths?: string[];
    bridgePath?: string;
    launchSpec?: BlueprintExecutionSpec;
    logPath?: string;
    message: string;
    output: string;
    runtimeSnapshotPath?: string;
    slug: string;
    status: string;
    teamStateRoot?: string;
}
export declare function listBlueprints(options?: BlueprintListOptions): Promise<BlueprintSummary[]>;
export declare function showBlueprint(slug: string, options?: BlueprintShowOptions): Promise<ShowBlueprintResult>;
export declare function createBlueprint(goal: string, options?: BlueprintNewOptions): Promise<CreateBlueprintResult>;
export declare function executeBlueprint(slug: string, options?: BlueprintMoveOptions): Promise<ExecuteBlueprintResult>;
export declare function controlBlueprintExec(action: 'status' | 'resume' | 'stop', slug: string, options?: BlueprintMoveOptions): Promise<ExecuteBlueprintResult>;
export declare function readBlueprintExecutionLogs(slug: string, options?: BlueprintMoveOptions): Promise<ExecuteBlueprintResult>;
export declare function moveBlueprint(slug: string, status: string, options?: BlueprintMoveOptions): Promise<MoveBlueprintResult>;
export declare function startBlueprint(slug: string, options?: BlueprintMoveOptions): Promise<BlueprintLifecycleMutationResult>;
export declare function parkBlueprint(slug: string, options?: BlueprintMoveOptions): Promise<BlueprintLifecycleMutationResult>;
export declare function finalizeBlueprint(slug: string, options?: BlueprintMoveOptions): Promise<BlueprintLifecycleMutationResult>;
export declare function mutateBlueprintTask(action: 'start' | 'block' | 'unblock' | 'complete', slug: string, taskId: string, options?: BlueprintMoveOptions & {
    reason?: string;
}): Promise<BlueprintLifecycleMutationResult>;
export declare function auditBlueprints(options?: BlueprintAuditOptions): Promise<BlueprintAuditResult>;
export declare function registerBlueprintRouter(cli: CAC): void;
//# sourceMappingURL=router.d.ts.map