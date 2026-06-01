import type { CAC } from 'cac';
import { type LoadWpExtensionsOptions, type WpExtensionAliasV1 } from '#wp-extension';
export interface RegisterWpExtensionsOptions extends LoadWpExtensionsOptions {
    readonly cli: CAC;
    readonly baseCommands: readonly string[];
}
export interface RegisteredWpExtensions {
    readonly aliasMap: ReadonlyMap<string, WpExtensionAliasV1>;
    readonly warnings: readonly string[];
    readonly commandNames: readonly string[];
}
export declare function registerWpExtensions(options: RegisterWpExtensionsOptions): Promise<RegisteredWpExtensions>;
export declare function resolveWpCommandAlias(command: string | undefined, aliasMap: ReadonlyMap<string, WpExtensionAliasV1>): string | undefined;
//# sourceMappingURL=wp-extensions.d.ts.map