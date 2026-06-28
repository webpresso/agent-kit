import type { CAC } from "cac";
import type { AffectedResolutionDeps } from "#git/affected";
export declare const LINT_COMMAND_HELP: string;
interface LintCommandDeps {
    readonly getGitTopLevel?: AffectedResolutionDeps["getGitTopLevel"];
    readonly getStagedFiles?: AffectedResolutionDeps["getStagedFiles"];
    readonly getBranchChangedFiles?: AffectedResolutionDeps["getBranchChangedFiles"];
}
export declare function registerLintCommand(cli: CAC, deps?: LintCommandDeps): void;
export declare function buildLintCommand(options?: {
    readonly files?: readonly string[];
    readonly fix?: boolean;
    readonly cwd?: string;
}): {
    command: string;
    args: readonly string[];
};
export {};
//# sourceMappingURL=lint.d.ts.map