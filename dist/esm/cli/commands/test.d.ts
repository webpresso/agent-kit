import type { CommandConfig, TestCommandOptions } from "#test";
import type { CAC } from "cac";
import type { AffectedResolutionDeps } from "#git/affected";
export declare const TEST_COMMAND_HELP: string;
export interface AkTestCommandInput extends TestCommandOptions {
    cwd?: string;
    package?: readonly string[] | string;
    file?: readonly string[] | string;
    passthrough?: readonly string[];
}
interface TestCommandDeps {
    readonly getGitTopLevel?: AffectedResolutionDeps["getGitTopLevel"];
    readonly getStagedFiles?: AffectedResolutionDeps["getStagedFiles"];
    readonly getBranchChangedFiles?: AffectedResolutionDeps["getBranchChangedFiles"];
    readonly discoverTestFiles?: (changedFiles: string[], cwd: string) => string[];
}
export declare function createAkTestCommandConfig(input: AkTestCommandInput): CommandConfig;
export declare function registerTestCommand(cli: CAC, deps?: TestCommandDeps): void;
export {};
//# sourceMappingURL=test.d.ts.map