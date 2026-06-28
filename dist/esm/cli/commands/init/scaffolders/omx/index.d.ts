/**
 * `omx` scaffolder preset.
 *
 * Refreshes managed tooling through the Vite+ runner bundled by `wp`, ensures `omx` is installed, then chains
 * `omx setup --yes --scope user` after the webpresso scaffold completes.
 * OMX (oh-my-codex) is the operator-workflow
 * execution layer; it manages its own scaffolding idempotently.
 *
 * Required when downstream features rely on `omx team` (see
 * `cli/commands/blueprint/execution.ts`).
 */
import { spawnSync } from "node:child_process";
import type { MergeOptions } from "#cli/commands/init/merge";
import { type GlobalCapableVpCommandInput } from "#cli/commands/init/scaffolders/vp-global.js";
export interface EnsureOmxInput {
    repoRoot: string;
    options: MergeOptions;
    scope?: OmxSetupScope;
    /** Dependency-injection seam for tests; defaults to node's child_process.spawnSync. */
    spawn?: typeof spawnSync;
    /** DI seam for resolving a global-capable vp binary. */
    resolveVpCommand?: () => GlobalCapableVpCommandInput | null;
    /** Test seam — override `$CODEX_HOME/config.toml` or `~/.codex/config.toml`. */
    configPath?: string;
}
export type EnsureOmxResult = {
    kind: "omx-ok";
    installed: boolean;
    removedProjectFiles: string[];
} | {
    kind: "omx-skipped-dry-run";
} | {
    kind: "omx-not-found";
    hint: string;
} | {
    kind: "omx-spawn-failed";
    exitCode: number;
};
type OmxSetupScope = "user" | "project";
/**
 * Removes ALL hook trust state blocks when duplicate `[hooks.state."..."]` keys
 * are detected.
 *
 * The TOML spec forbids duplicate keys; Codex CLI rejects the config outright.
 * Older OMX versions wrote blocks terminated by `# End OMX-owned Codex hook
 * trust state` but without a leading start marker. OMX's own
 * `stripManagedCodexHookTrustState` only strips START→END bounded blocks, so
 * legacy entries accumulate on every `wp setup` run.
 *
 * Detection contract: count unique vs total `[hooks.state."..."]` section
 * headers. If any key appears more than once the file is TOML-invalid. When
 * duplicates exist we strip all hook trust content (entries + OMX block marker
 * comments) so `omx setup --yes --scope user` can rewrite exactly one clean managed block.
 */
export declare function deduplicateCodexHookTrustState(config: string): string;
export declare function migrateDeprecatedCodexHooksFeatureFlag(raw: string): string;
/**
 * Refresh `vp`, ensure `omx` is on PATH, then run
 * `omx setup --yes --scope user` in the consumer repo.
 * Idempotent: safe to run on every `wp setup`.
 */
export declare function ensureOmx(input: EnsureOmxInput): EnsureOmxResult;
export {};
//# sourceMappingURL=index.d.ts.map