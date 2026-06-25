import { type ChangedFilesResult, type ChangedFilesReason } from "#git/changed-files";
export interface AffectedCliFlags {
    readonly affected?: unknown;
    readonly branch?: unknown;
}
export type AffectedExecutionPolicy = "fallback-full" | "fail-closed";
export interface AffectedRequest<Target> {
    readonly commandName: string;
    readonly cwd?: string;
    readonly affected: boolean;
    readonly branch: boolean;
    readonly baseRef?: string;
    readonly explicitTargets?: readonly unknown[];
    readonly explicitTargetFlags?: string;
    readonly policy: AffectedExecutionPolicy;
    readonly mapChangedFiles: (files: readonly string[], repoRoot: string) => readonly Target[];
    readonly emptyMessage: (scope: AffectedScope) => string;
    readonly degradedFallbackMessage: (reason: ChangedFilesReason) => string;
    readonly degradedFailClosedMessage: (reason: ChangedFilesReason) => string;
}
export type AffectedScope = "staged" | "branch";
export type AffectedResolution<Target> = {
    readonly kind: "disabled";
    readonly cwd: string;
} | {
    readonly kind: "invalid";
    readonly message: string;
} | {
    readonly kind: "scoped";
    readonly cwd: string;
    readonly scope: AffectedScope;
    readonly changedFiles: readonly string[];
    readonly targets: readonly Target[];
} | {
    readonly kind: "empty";
    readonly cwd: string;
    readonly scope: AffectedScope;
    readonly message: string;
} | {
    readonly kind: "degraded-fallback";
    readonly cwd: string;
    readonly scope: AffectedScope;
    readonly reason: ChangedFilesReason;
    readonly message: string;
} | {
    readonly kind: "degraded-fail-closed";
    readonly cwd: string;
    readonly scope: AffectedScope;
    readonly reason: ChangedFilesReason;
    readonly message: string;
};
export interface AffectedResolutionDeps {
    readonly getGitTopLevel?: (cwd: string) => string | null;
    readonly getStagedFiles?: (cwd: string) => ChangedFilesResult;
    readonly getBranchChangedFiles?: (cwd: string, baseRef?: string) => ChangedFilesResult;
}
export interface AffectedOptionRegistrar<TCommand> {
    option(name: string, description: string): TCommand;
}
export declare function addAffectedOptions<TCommand extends AffectedOptionRegistrar<TCommand>>(command: TCommand): TCommand;
export declare function resolveAffectedTargets<Target>(request: AffectedRequest<Target>, deps?: AffectedResolutionDeps): AffectedResolution<Target>;
//# sourceMappingURL=affected.d.ts.map