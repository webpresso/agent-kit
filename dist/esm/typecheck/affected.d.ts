import ts from "typescript";
export interface AffectedTypecheckOptions {
    readonly repoRoot: string;
    readonly files: readonly string[];
    readonly pretty?: boolean;
}
export interface AffectedTypecheckResult {
    readonly exitCode: number;
    readonly entry: import("#cli/commands/quality-log-store.js").CliLogEntry;
    readonly checkedFiles: readonly string[];
}
interface AffectedClosurePlan {
    readonly program: ts.Program;
    readonly configPath: string;
    readonly changedFiles: readonly ts.SourceFile[];
    readonly closureFiles: readonly ts.SourceFile[];
}
export declare function runAffectedTypecheck(options: AffectedTypecheckOptions): Promise<AffectedTypecheckResult>;
export declare function planAffectedTypecheckClosure(options: AffectedTypecheckOptions): AffectedClosurePlan;
export {};
//# sourceMappingURL=affected.d.ts.map