/**
 * `omx` scaffolder preset.
 *
 * Ensures `omx` is installed, then chains `omx setup --yes` after the
 * agent-kit scaffold completes. OMX (oh-my-codex) is the operator-workflow
 * execution layer; it manages its own scaffolding idempotently.
 *
 * Required when downstream features rely on `omx team` (see
 * `cli/commands/blueprint/execution.ts`).
 */
import { spawnSync } from 'node:child_process';
import type { MergeOptions } from '#cli/commands/init/merge';
export interface EnsureOmxInput {
    repoRoot: string;
    options: MergeOptions;
    /** Dependency-injection seam for tests; defaults to node's child_process.spawnSync. */
    spawn?: typeof spawnSync;
    /** Test seam — override `$CODEX_HOME/config.toml` or `~/.codex/config.toml`. */
    configPath?: string;
}
export type EnsureOmxResult = {
    kind: 'omx-ok';
    installed: boolean;
} | {
    kind: 'omx-skipped-dry-run';
} | {
    kind: 'omx-not-found';
    hint: string;
} | {
    kind: 'omx-spawn-failed';
    exitCode: number;
};
/**
 * Removes ALL hook trust state blocks when duplicate `[hooks.state."..."]` keys
 * are detected.
 *
 * The TOML spec forbids duplicate keys; Codex CLI rejects the config outright.
 * Older OMX versions wrote blocks terminated by `# End OMX-owned Codex hook
 * trust state` but without a leading start marker. OMX's own
 * `stripManagedCodexHookTrustState` only strips START→END bounded blocks, so
 * legacy entries accumulate on every `ak setup` run.
 *
 * Detection contract: count unique vs total `[hooks.state."..."]` section
 * headers. If any key appears more than once the file is TOML-invalid. When
 * duplicates exist we strip all hook trust content (entries + OMX block marker
 * comments) so `omx setup --yes` can rewrite exactly one clean managed block.
 */
export declare function deduplicateCodexHookTrustState(config: string): string;
export declare function migrateDeprecatedCodexHooksFeatureFlag(raw: string): string;
/**
 * Ensure `omx` is on PATH then run `omx setup --yes` in the consumer repo.
 * Idempotent: safe to run on every `ak setup`.
 */
export declare function ensureOmx(input: EnsureOmxInput): EnsureOmxResult;
//# sourceMappingURL=index.d.ts.map