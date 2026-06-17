import type { MergeOptions } from '#cli/commands/init/merge';
/**
 * Codex consumes agent-kit skills through its native plugin system (verified
 * against codex-cli 0.139.0). Unlike Claude, Codex does **not** expose a plugin
 * whose marketplace `source` is the marketplace root itself — the plugin must
 * live in a subdirectory of the marketplace root, referenced by an object
 * `source` (`{ source: "local", path: "./plugins/<name>" }`) in a Codex-native
 * `.agents/plugins/marketplace.json`. The legacy `.claude-plugin/marketplace.json`
 * (string `source: "./"`) is silently ignored by Codex's plugin discovery.
 *
 * So we build a tiny staging marketplace whose `plugins/agent-kit` entry is a
 * symlink to the installed agent-kit package root (which ships `.codex-plugin/
 * plugin.json` + `skills/`), then:
 *   `codex plugin marketplace add <staging>` && `codex plugin add agent-kit@webpresso`
 * Codex copies the plugin into its own cache at install time, so the staging
 * dir only needs to exist at setup time; we keep it at a stable cache path so
 * re-runs are idempotent.
 */
export declare const CODEX_MARKETPLACE_NAME = "webpresso";
export declare const CODEX_PLUGIN_ID = "agent-kit@webpresso";
export interface EnsureCodexPluginInput {
    options: MergeOptions;
    packageRoot: string;
    /** Stable dir where the staging marketplace is built. Defaults to a cache path. */
    stagingRoot?: string;
    commandExists?: (command: string) => boolean;
    runCommand?: (command: string, args: readonly string[]) => number;
}
export type EnsureCodexPluginResult = {
    kind: 'codex-plugin-installed';
    packageRoot: string;
    pluginId: string;
    stagingRoot: string;
} | {
    kind: 'codex-plugin-skipped-dry-run';
    packageRoot: string;
} | {
    kind: 'codex-plugin-skipped-opt-out';
    packageRoot: string;
} | {
    kind: 'codex-plugin-skipped-no-cli';
    packageRoot: string;
} | {
    kind: 'codex-plugin-unavailable';
    packageRoot: string;
} | {
    kind: 'codex-plugin-failed';
    packageRoot: string;
    pluginId: string;
    stagingRoot: string;
    step: 'marketplace-add' | 'plugin-add';
    exitCode: number;
};
/**
 * Build (or refresh) the staging marketplace: a `plugins/agent-kit` symlink to
 * the real package plus a Codex-native `.agents/plugins/marketplace.json`.
 */
export declare function buildCodexStagingMarketplace(stagingRoot: string, packageRoot: string): void;
export declare function ensureCodexUserPlugin(input: EnsureCodexPluginInput): EnsureCodexPluginResult;
//# sourceMappingURL=index.d.ts.map