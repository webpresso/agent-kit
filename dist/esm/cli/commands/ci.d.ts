import type { CAC } from 'cac';
import type { SpawnSyncReturns } from 'node:child_process';
type PathExists = (path: string) => boolean;
export declare const CI_COMMAND_HELP: string;
export interface CiActOptions {
    readonly workflow?: string;
    readonly job?: string;
    readonly prNumber?: string | number;
    readonly repo?: string;
    readonly chefUrl?: string;
    readonly chefToken?: string;
    readonly allowLocalChefToken?: boolean;
    readonly allowHostMutation?: boolean;
    readonly containerArchitecture?: string;
    readonly platformImage?: string;
    readonly eventPath?: string;
    readonly execute?: boolean;
    readonly direct?: boolean;
}
export interface CiCommandConfig {
    readonly command: string;
    readonly args: readonly string[];
}
export interface CiCommandDeps {
    readonly cwd?: string;
    readonly exists?: PathExists;
    readonly run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>;
    readonly stderr?: Pick<NodeJS.WriteStream, 'write'>;
}
export declare function registerCiCommand(cli: CAC): void;
export declare function buildCiActCommand(options?: CiActOptions, cwd?: string): CiCommandConfig;
export declare function validateCiActCommand(cwd?: string, exists?: PathExists, options?: Pick<CiActOptions, 'direct'>): string | null;
export declare function runCiActCommand(options?: CiActOptions, deps?: CiCommandDeps): number;
export {};
//# sourceMappingURL=ci.d.ts.map