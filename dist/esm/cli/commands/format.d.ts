import type { CAC } from "cac";
import type { AffectedResolutionDeps } from "#git/affected";
export declare const FORMAT_COMMAND_HELP: string;
interface FormatCommandDeps {
    readonly getGitTopLevel?: AffectedResolutionDeps["getGitTopLevel"];
    readonly getStagedFiles?: AffectedResolutionDeps["getStagedFiles"];
    readonly getBranchChangedFiles?: AffectedResolutionDeps["getBranchChangedFiles"];
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