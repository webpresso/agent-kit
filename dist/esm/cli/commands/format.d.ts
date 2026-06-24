import type { CAC } from 'cac';
import { type ChangedFilesResult } from '#git/changed-files';
export declare const FORMAT_COMMAND_HELP: string;
interface FormatCommandDeps {
    readonly getGitTopLevel?: (cwd: string) => string | null;
    readonly getStagedFiles?: (cwd: string) => ChangedFilesResult;
    readonly getBranchChangedFiles?: (cwd: string) => ChangedFilesResult;
}
export declare function registerFormatCommand(cli: CAC, deps?: FormatCommandDeps): void;
export declare function buildFormatCommand(options: {
    readonly files?: readonly string[];
    readonly check?: boolean;
}): {
    command: string;
    args: readonly string[];
};
export {};
//# sourceMappingURL=format.d.ts.map