import type { CAC } from 'cac';
import { type ChangedFilesResult } from '#git/changed-files';
export declare const LINT_COMMAND_HELP: string;
interface LintCommandDeps {
    readonly getGitTopLevel?: (cwd: string) => string | null;
    readonly getStagedFiles?: (cwd: string) => ChangedFilesResult;
    readonly getBranchChangedFiles?: (cwd: string) => ChangedFilesResult;
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