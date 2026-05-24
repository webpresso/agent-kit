import type { CAC } from 'cac';
import type { SpawnSyncReturns } from 'node:child_process';
export declare const TYPECHECK_COMMAND_HELP: string;
export interface TypecheckOptions {
    readonly pretty?: boolean;
}
export interface TypecheckCommandConfig {
    readonly command: string;
    readonly args: readonly string[];
}
export interface TypecheckCommandDeps {
    readonly run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>;
}
export declare function registerTypecheckCommand(cli: CAC): void;
export declare function buildTypecheckCommand(options?: TypecheckOptions): TypecheckCommandConfig;
export declare function runTypecheckCommand(options?: TypecheckOptions, deps?: TypecheckCommandDeps): number;
//# sourceMappingURL=typecheck.d.ts.map