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
/**
 * Plan a reverse-closure typecheck per owning tsconfig.
 *
 * Each changed file is grouped under the nearest `tsconfig.json` walking up to
 * (and including) the repo root, so files under a workspace package's own
 * `tsconfig.json` (e.g. `packages/agent-config`) are typechecked in *their*
 * program instead of being dropped by the root program (whose `include` only
 * covers `src/**`). Fail-closed is preserved: if no closure plan can be built
 * for any changed file, this throws.
 */
export declare function planAffectedTypecheckClosures(options: AffectedTypecheckOptions): AffectedClosurePlan[];
/**
 * Single-tsconfig closure planner (root program). Retained for the root-scoped
 * case and the closure unit tests; throws when the changed files are not inside
 * the resolved program.
 */
export declare function planAffectedTypecheckClosure(options: AffectedTypecheckOptions): AffectedClosurePlan;
export declare function collectAffectedDiagnostics(program: ts.Program, files: readonly ts.SourceFile[]): readonly ts.Diagnostic[];
export {};
//# sourceMappingURL=affected.d.ts.map