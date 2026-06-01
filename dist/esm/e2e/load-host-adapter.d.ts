import type { E2eHostAdapter } from './types.js';
import { type WebpressoConfig } from './config.js';
export interface LoadWebpressoConfigOptions {
    cwd?: string;
}
export interface LoadedWebpressoConfig {
    config: WebpressoConfig;
    configPath: string;
}
export interface LoadedHostAdapter extends LoadedWebpressoConfig {
    adapter: E2eHostAdapter;
    exportName: string;
    moduleSpecifier: string;
}
export declare class WebpressoConfigLoadError extends Error {
    readonly configPath: string;
    readonly cause: Error;
    constructor(configPath: string, cause: Error);
}
export declare class WebpressoConfigExportError extends Error {
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
export declare function getWebpressoConfigPath(cwd?: string): string;
export declare function resolveWebpressoConfigPath(cwd?: string): string;
export declare function findWebpressoConfigPath(cwd?: string): string | null;
export declare function loadWebpressoConfig(options?: LoadWebpressoConfigOptions): Promise<LoadedWebpressoConfig>;
export declare function loadWebpressoConfigSafe(options?: LoadWebpressoConfigOptions): Promise<LoadedWebpressoConfig | null>;
export declare function loadHostAdapter(options?: LoadWebpressoConfigOptions): Promise<LoadedHostAdapter | null>;
export declare function loadConfiguredHostAdapter(cwd?: string): Promise<LoadedHostAdapter | null>;
//# sourceMappingURL=load-host-adapter.d.ts.map