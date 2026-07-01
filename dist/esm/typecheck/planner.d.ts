export interface TypecheckScope {
    readonly name: string;
    readonly root: string;
    readonly relativeRoot: string;
    readonly kind: "root" | "workspace";
}
export interface PlannedTypecheckCommand {
    readonly scope: TypecheckScope | null;
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly env?: Record<string, string>;
}
export interface TypecheckExecutionPlan {
    readonly repoRoot: string;
    readonly mode: "default" | "files" | "packages";
    readonly commands: readonly PlannedTypecheckCommand[];
    readonly resolvedScopes: readonly TypecheckScope[];
    readonly preambleLine?: string;
}
export interface PlanTypecheckExecutionOptions {
    readonly repoRoot: string;
    readonly defaultScopeRoot?: string;
    readonly files?: readonly string[];
    readonly packages?: readonly string[];
    readonly pretty?: boolean;
}
export declare function planTypecheckExecution(options: PlanTypecheckExecutionOptions): TypecheckExecutionPlan;
export declare function formatResolvedScopesLine(scopes: readonly TypecheckScope[]): string;
//# sourceMappingURL=planner.d.ts.map