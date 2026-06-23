import { spawnSync, type SpawnOptions, type SpawnSyncOptions } from 'node:child_process';
import { type RuntimeProfile } from './profiles.js';
export type RuntimeSelector = RuntimeProfile | string;
export interface RuntimeEnvCache {
    readonly values: Map<string, Record<string, string>>;
}
export interface ResolveRuntimeEnvironmentOptions {
    readonly cwd?: string;
    readonly profile?: RuntimeSelector;
    readonly environment?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly cache?: RuntimeEnvCache;
}
export interface RuntimeSpawnOptions {
    readonly cwd?: string;
    readonly profile?: RuntimeSelector;
    readonly environment?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly cache?: RuntimeEnvCache;
}
export interface RuntimeCommandOptions extends RuntimeSpawnOptions {
    readonly command: string;
    readonly args?: readonly string[];
    readonly stdio?: SpawnSyncOptions['stdio'];
}
export declare function createRuntimeEnvCache(): RuntimeEnvCache;
export declare function buildRuntimeProcessEnv(cwd?: string, baseEnv?: NodeJS.ProcessEnv, injectedEnv?: Record<string, string>): NodeJS.ProcessEnv;
export declare function resolveRuntimeEnvironment(options?: ResolveRuntimeEnvironmentOptions): Record<string, string>;
export declare function buildRuntimeSpawnOptions(options?: RuntimeSpawnOptions): {
    cwd: string;
    env: NodeJS.ProcessEnv;
    cache: RuntimeEnvCache;
};
export declare function spawnRuntimeCommandSync(options: RuntimeCommandOptions): ReturnType<typeof spawnSync>;
export declare function spawnRuntimeCommand(command: string, args?: readonly string[], options?: RuntimeSpawnOptions & Pick<SpawnOptions, 'stdio' | 'signal'>): import("node:child_process").ChildProcess;
//# sourceMappingURL=executor.d.ts.map