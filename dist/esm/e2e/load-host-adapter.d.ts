import type { E2eHostAdapter } from './types.js';
import { type AgentKitConfig } from './config.js';
export interface LoadAgentKitConfigOptions {
    cwd?: string;
}
export interface LoadedAgentKitConfig {
    config: AgentKitConfig;
    configPath: string;
}
export interface LoadedHostAdapter extends LoadedAgentKitConfig {
    adapter: E2eHostAdapter;
    exportName: string;
    moduleSpecifier: string;
}
export declare class AgentKitConfigLoadError extends Error {
    readonly configPath: string;
    readonly cause: Error;
    constructor(configPath: string, cause: Error);
}
export declare class AgentKitConfigExportError extends Error {
    readonly configPath: string;
    constructor(configPath: string);
}
export declare class HostAdapterModuleLoadError extends Error {
    readonly moduleSpecifier: string;
    readonly configPath: string;
    readonly cause: Error;
    constructor(moduleSpecifier: string, configPath: string, cause: Error);
}
export declare class HostAdapterExportError extends Error {
    readonly moduleSpecifier: string;
    readonly availableExports: readonly string[];
    readonly attemptedExports: readonly string[];
    constructor(moduleSpecifier: string, availableExports: readonly string[], attemptedExports: readonly string[]);
}
export declare function getAgentKitConfigPath(cwd?: string): string;
export declare function resolveAgentKitConfigPath(cwd?: string): string;
export declare function findAgentKitConfigPath(cwd?: string): string | null;
export declare function loadAgentKitConfig(options?: LoadAgentKitConfigOptions): Promise<LoadedAgentKitConfig>;
export declare function loadAgentKitConfigSafe(options?: LoadAgentKitConfigOptions): Promise<LoadedAgentKitConfig | null>;
export declare function loadHostAdapter(options?: LoadAgentKitConfigOptions): Promise<LoadedHostAdapter | null>;
export declare function loadConfiguredHostAdapter(cwd?: string): Promise<LoadedHostAdapter | null>;
//# sourceMappingURL=load-host-adapter.d.ts.map