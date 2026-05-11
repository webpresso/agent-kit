import type { BlueprintAuditResult, BlueprintSummary } from '#local';
import type { BlueprintCommandOptions, BlueprintLifecycleMutationResult, CreateBlueprintResult, ExecuteBlueprintResult, MoveBlueprintResult, ShowBlueprintResult } from './router.js';
/**
 * Thrown by `executeBlueprintSubcommand` when `audit` finds issues and
 * the caller should exit with a non-zero code.  Keeps `process.exit` out
 * of the dispatch layer so tests can assert on it without spawning a
 * subprocess.
 */
export declare class BlueprintAuditFailedError extends Error {
    readonly result: BlueprintAuditResult;
    constructor(result: BlueprintAuditResult);
}
interface BlueprintCommandDependencies {
    auditBlueprints: (options: BlueprintCommandOptions) => Promise<BlueprintAuditResult>;
    controlBlueprintExec: (action: 'status' | 'resume' | 'stop', slug: string, options: BlueprintCommandOptions) => Promise<ExecuteBlueprintResult>;
    readBlueprintExecutionLogs: (slug: string, options: BlueprintCommandOptions) => Promise<ExecuteBlueprintResult>;
    createBlueprint: (goal: string, options: BlueprintCommandOptions) => Promise<CreateBlueprintResult>;
    executeBlueprint: (slug: string, options: BlueprintCommandOptions) => Promise<ExecuteBlueprintResult>;
    parkBlueprint: (slug: string, options: BlueprintCommandOptions) => Promise<BlueprintLifecycleMutationResult>;
    finalizeBlueprint: (slug: string, options: BlueprintCommandOptions) => Promise<BlueprintLifecycleMutationResult>;
    formatBlueprintAudit: (result: BlueprintAuditResult) => string;
    formatBlueprintCreation: (result: CreateBlueprintResult) => string;
    formatBlueprintDetails: (result: ShowBlueprintResult) => string;
    formatBlueprintExecution: (result: ExecuteBlueprintResult) => string;
    formatBlueprintSummaries: (summaries: BlueprintSummary[]) => string;
    getHelpText: () => string;
    listBlueprints: (options: BlueprintCommandOptions) => Promise<BlueprintSummary[]>;
    moveBlueprint: (slug: string, status: string, options: BlueprintCommandOptions) => Promise<MoveBlueprintResult>;
    mutateBlueprintTask: (action: 'start' | 'block' | 'unblock' | 'complete', slug: string, taskId: string, options: BlueprintCommandOptions & {
        reason?: string;
    }) => Promise<BlueprintLifecycleMutationResult>;
    printBlueprintOutput: (value: object | string, asJson?: boolean) => void;
    showBlueprint: (slug: string, options: BlueprintCommandOptions) => Promise<ShowBlueprintResult>;
    startBlueprint: (slug: string, options: BlueprintCommandOptions) => Promise<BlueprintLifecycleMutationResult>;
}
export declare function executeBlueprintSubcommand(subcommand: string | undefined, args: string[], options: BlueprintCommandOptions, deps: BlueprintCommandDependencies): Promise<void>;
export {};
//# sourceMappingURL=router-dispatch.d.ts.map