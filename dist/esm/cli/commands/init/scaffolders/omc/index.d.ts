import type { MergeOptions } from "#cli/commands/init/merge";
export declare const OMC_MARKETPLACE = "https://github.com/Yeachan-Heo/oh-my-claudecode";
export declare const OMC_PLUGIN_NAME = "oh-my-claudecode";
export declare const OMC_MARKETPLACE_NAME = "omc";
export declare const OMC_PLUGIN_ID = "oh-my-claudecode@omc";
export declare const OMC_SETUP_COMMAND = "/oh-my-claudecode:omc-setup";
export type OmcSetupScope = "user" | "project";
export interface EnsureOmcInput {
    options: MergeOptions;
    scope?: OmcSetupScope;
    commandExists?: (command: string) => boolean;
    runCommand?: (command: string, args: readonly string[]) => number;
}
export type EnsureOmcResult = {
    kind: "omc-installed";
    pluginId: string;
    scope: OmcSetupScope;
} | {
    kind: "omc-skipped-dry-run";
    scope: OmcSetupScope;
} | {
    kind: "omc-skipped-opt-out";
    scope: OmcSetupScope;
} | {
    kind: "omc-skipped-no-cli";
    scope: OmcSetupScope;
} | {
    kind: "omc-failed";
    pluginId: string;
    scope: OmcSetupScope;
    step: "marketplace-add" | "plugin-install";
    exitCode: number;
};
/**
 * Install/refresh Oh My ClaudeCode through Claude Code's plugin system.
 *
 * Upstream OMC does not support direct npm/bun installation; the supported
 * path is Claude Code plugin marketplace add + plugin install, followed by the
 * OMC setup skill inside Claude Code when the operator wants to materialize
 * global/project CLAUDE.md defaults.
 */
export declare function ensureOmc(input: EnsureOmcInput): EnsureOmcResult;
//# sourceMappingURL=index.d.ts.map