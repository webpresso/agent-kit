import type { CAC } from "cac";
import type { AffectedResolutionDeps } from "#git/affected";
export declare const TYPECHECK_COMMAND_HELP: string;
export interface TypecheckOptions {
    readonly pretty?: boolean;
    readonly cwd?: string;
    readonly files?: readonly string[];
    readonly packages?: readonly string[];
}
interface TypecheckCommandDeps {
    readonly getGitTopLevel?: AffectedResolutionDeps["getGitTopLevel"];
    readonly getStagedFiles?: AffectedResolutionDeps["getStagedFiles"];
    readonly getBranchChangedFiles?: AffectedResolutionDeps["getBranchChangedFiles"];
}
export interface TypecheckCommandConfig {
    readonly command: string;
    readonly args: readonly string[];
    readonly env?: Record<string, string>;
}
export declare function registerTypecheckCommand(cli: CAC, deps?: TypecheckCommandDeps): void;
export declare function buildTypecheckCommand(options?: TypecheckOptions): TypecheckCommandConfig;
export declare function runTypecheckCommand(options?: TypecheckOptions): Promise<{
    exitCode: number;
    entry: import("./quality-log-store.js").CliLogEntry;
}>;
export {};
//# sourceMappingURL=typecheck.d.ts.map