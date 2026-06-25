import { type MergeOptions, type MergeResult } from "#cli/commands/init/merge";
/**
 * Installs the generated OpenCode plugin bridge under `.opencode/plugins/`.
 *
 * OpenCode auto-loads local JS/TS plugins, so this scaffolder owns the
 * generated file and refreshes it on every `wp setup`.
 */
export declare const OPENCODE_PLUGIN_RELATIVE_PATH = ".opencode/plugins/webpresso-hooks.js";
export declare const OPENCODE_PLUGIN_SUPPORT_LEVEL = "degraded";
export interface ScaffoldOpencodePluginInput {
    repoRoot: string;
    options: MergeOptions;
}
export declare const OPENCODE_PLUGIN_CONTENT: string;
export declare function scaffoldOpencodePlugin(input: ScaffoldOpencodePluginInput): MergeResult;
//# sourceMappingURL=index.d.ts.map