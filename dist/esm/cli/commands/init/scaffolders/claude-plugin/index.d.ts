import type { MergeOptions } from "#cli/commands/init/merge";
export declare const CLAUDE_PLUGIN_ID = "agent-kit@webpresso";
export interface EnsureClaudePluginInput {
    options: MergeOptions;
    packageRoot: string;
    env?: NodeJS.ProcessEnv;
    commandExists?: (command: string) => boolean;
    runCommand?: (command: string, args: readonly string[]) => number;
}
export type EnsureClaudePluginResult = {
    kind: "claude-plugin-installed";
    packageRoot: string;
    pluginId: string;
} | {
    kind: "claude-plugin-skipped-dry-run";
    packageRoot: string;
} | {
    kind: "claude-plugin-skipped-opt-out";
    packageRoot: string;
} | {
    kind: "claude-plugin-skipped-package-lifecycle";
    packageRoot: string;
} | {
    kind: "claude-plugin-skipped-no-cli";
    packageRoot: string;
} | {
    kind: "claude-plugin-unavailable";
    packageRoot: string;
} | {
    kind: "claude-plugin-failed";
    packageRoot: string;
    pluginId: string;
    step: "marketplace-add" | "plugin-install" | "plugin-update";
    exitCode: number;
};
export declare function ensureClaudeCodeUserPlugin(input: EnsureClaudePluginInput): EnsureClaudePluginResult;
//# sourceMappingURL=index.d.ts.map