import type { CAC } from 'cac';
export interface WpExtensionContext {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
}
export interface WpExtensionCommandV1 {
    readonly name: string;
    readonly description: string;
    readonly register: (cli: CAC) => void;
}
export interface WpExtensionAliasV1 {
    readonly name: string;
    readonly commandName: string;
}
export interface WpExtensionV1 {
    readonly apiVersion: '1';
    readonly name: string;
    readonly version: string;
    readonly hostRange: string;
    readonly detect: (context: WpExtensionContext) => boolean | Promise<boolean>;
    readonly commands: readonly WpExtensionCommandV1[];
    readonly aliases?: readonly WpExtensionAliasV1[];
}
export interface LoadedWpExtension {
    readonly packageName: string;
    readonly specifier: string;
    readonly extension?: WpExtensionV1;
    readonly compatible: boolean;
    readonly detected: boolean;
    readonly warnings: readonly string[];
}
export interface WpExtensionAliasResolution {
    readonly aliases: ReadonlyMap<string, WpExtensionAliasV1>;
    readonly warnings: readonly string[];
    readonly acceptedCommandNames: readonly string[];
}
export interface LoadWpExtensionsOptions {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly hostVersion: string;
    readonly importModule?: (specifier: string) => Promise<{
        default?: unknown;
    }>;
    readonly resolveFrom?: (fromFile: string, specifier: string) => string;
    readonly readJsonFile?: (path: string) => unknown;
}
export declare function loadWpExtensions(options: LoadWpExtensionsOptions): Promise<readonly LoadedWpExtension[]>;
export declare function resolveAcceptedExtensionAliases(extensions: readonly LoadedWpExtension[], baseCommands: Iterable<string>, acceptedCommandNames: Iterable<string>): WpExtensionAliasResolution;
export declare function isWpExtensionV1(value: unknown): value is WpExtensionV1;
//# sourceMappingURL=index.d.ts.map