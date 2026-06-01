import type { CAC } from 'cac';
import type { SpawnSyncReturns } from 'node:child_process';
export declare const PACKAGE_MANAGER_VERBS: readonly ["install", "add", "remove", "update", "exec", "run"];
export type PackageManagerVerb = (typeof PACKAGE_MANAGER_VERBS)[number];
export interface PackageManagerCommandConfig {
    readonly command: string;
    readonly args: readonly string[];
}
export interface PackageManagerCommandDeps {
    readonly run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>;
}
export declare function registerPackageManagerCommand(cli: CAC, verb: PackageManagerVerb): void;
export declare function buildPackageManagerCommand(verb: PackageManagerVerb, argv?: readonly string[]): PackageManagerCommandConfig;
export declare function runPackageManagerCommand(verb: PackageManagerVerb, deps?: PackageManagerCommandDeps): number;
//# sourceMappingURL=package-manager.d.ts.map