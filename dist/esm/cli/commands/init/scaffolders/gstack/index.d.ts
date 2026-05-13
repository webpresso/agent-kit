/**
 * `gstack` scaffolder preset.
 *
 * gstack uses a canonical checkout installed at `~/.claude/skills/gstack/`.
 * Agent-kit owns that checkout bootstrap, then lets gstack's own host-aware
 * setup command materialize additional surfaces such as Codex from the same
 * checkout.
 *
 * Detection for the canonical checkout is path-based, NOT PATH-based: gstack
 * itself is not a CLI binary on $PATH. Checkout bootstrap is a clone +
 * `./setup --team`. When Codex is detected, agent-kit additionally runs
 * gstack's official `./setup --host codex` flow from that same checkout.
 *
 * Side-effect outside the consumer repo: writes to the user's home dir.
 * This is intentional — gstack is global by design.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { MergeOptions } from '#cli/commands/init/merge';
import { type SpinnerFactory } from '#cli/commands/init/scaffolders/spinner';
export interface EnsureGstackInput {
    repoRoot: string;
    options: MergeOptions;
    /** Override gstack install root (defaults to ~/.claude/skills/gstack). Useful in tests. */
    installRoot?: string;
    /** Override Codex config path (defaults to ~/.codex/config.toml). Useful in tests. */
    codexConfigPath?: string;
    /** Override Codex skills root (defaults to ~/.codex/skills). Useful in tests. */
    codexSkillsRoot?: string;
    /** DI seam for child_process.spawnSync. */
    spawn?: typeof spawnSync;
    /** DI seam for fs.existsSync. */
    exists?: typeof existsSync;
    /** DI seam for Codex detection in tests. */
    detectCodex?: (input: {
        spawn: typeof spawnSync;
        exists: typeof existsSync;
        codexConfigPath: string;
    }) => boolean;
    /** DI seam for spinner. Defaults to noop when !process.stdout.isTTY, ora otherwise. */
    spinnerFactory?: SpinnerFactory;
}
export type GstackCodexResult = {
    kind: 'gstack-codex-installed';
    skillsRoot: string;
} | {
    kind: 'gstack-codex-updated';
    skillsRoot: string;
} | {
    kind: 'gstack-codex-skipped';
    reason: 'not-detected';
    skillsRoot: string;
};
export type EnsureGstackResult = {
    kind: 'gstack-installed';
    root: string;
    codex: GstackCodexResult;
} | {
    kind: 'gstack-updated';
    root: string;
    codex: GstackCodexResult;
} | {
    kind: 'gstack-skipped-dry-run';
} | {
    kind: 'gstack-clone-failed';
    exitCode: number;
} | {
    kind: 'gstack-pull-failed';
    exitCode: number;
} | {
    kind: 'gstack-setup-failed';
    exitCode: number;
    command: '--team' | '--host codex';
};
/**
 * Ensure gstack is installed and up-to-date.
 * - Not present: clone from main + setup.
 * - Already present: pull latest main + re-run setup.
 * - If Codex is detected: materialize Codex skills from the canonical checkout.
 */
export declare function ensureGstack(input: EnsureGstackInput): EnsureGstackResult;
//# sourceMappingURL=index.d.ts.map