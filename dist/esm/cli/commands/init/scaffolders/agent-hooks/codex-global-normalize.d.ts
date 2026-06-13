import type { MergeOptions, MergeResult } from '#cli/commands/init/merge';
export interface NormalizeGlobalCodexHooksOptions {
    readonly nodeBinary?: string | null;
    readonly omxScriptPath?: string | null;
}
export declare const MANAGED_GLOBAL_CODEX_HOOK_DIRNAME = "managed-hooks";
export declare const MANAGED_OMX_GLOBAL_HOOK_BASENAME = "wp-global-codex-omx-hook.sh";
export declare const MANAGED_OMX_JSON_ONLY_GLOBAL_HOOK_BASENAME = "wp-global-codex-omx-json-hook.sh";
export declare function resolveBinaryOnPath(command: string, pathValue?: string, platformValue?: NodeJS.Platform): string | null;
export declare function resolveInstalledOmxHookScriptPath(homeDir?: string): string | null;
export declare function normalizeGlobalCodexHooksJson(raw: Record<string, unknown>, options: NormalizeGlobalCodexHooksOptions, managedHooksDir?: string): {
    readonly changed: boolean;
    readonly value: Record<string, unknown>;
};
export declare function normalizeGlobalCodexHooksFile(hooksPath: string, options: NormalizeGlobalCodexHooksOptions, mergeOptions?: MergeOptions): MergeResult;
export declare function defaultCodexHooksPathFromConfig(configPath: string): string;
export declare function defaultManagedCodexHooksDir(hooksPath: string): string;
export declare function isManagedOmxGlobalLauncherBasename(basenameValue: string): boolean;
export declare function extractManagedLauncherBasename(command: string): string | null;
//# sourceMappingURL=codex-global-normalize.d.ts.map