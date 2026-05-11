/**
 * `gstack` scaffolder preset.
 *
 * gstack is a user-global skill registry installed at `~/.claude/skills/gstack/`.
 * It ships skills like `/qa`, `/ship`, `/review`, `/investigate`, `/browse`
 * that webpresso/ingest-lens both mark as required for AI-assisted work.
 *
 * Detection is path-based, NOT PATH-based: gstack is not a CLI binary on
 * $PATH — it's a directory of skills consumed by Claude Code via
 * `~/.claude/skills/gstack/`. Install is a clone + `./setup --team`.
 *
 * Side-effect outside the consumer repo: writes to the user's home dir.
 * This is intentional — gstack is global by design.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { MergeOptions } from '#cli/commands/init/merge';
export interface EnsureGstackInput {
    repoRoot: string;
    options: MergeOptions;
    /** Override gstack install root (defaults to ~/.claude/skills/gstack). Useful in tests. */
    installRoot?: string;
    /** DI seam for child_process.spawnSync. */
    spawn?: typeof spawnSync;
    /** DI seam for fs.existsSync. */
    exists?: typeof existsSync;
}
export type EnsureGstackResult = {
    kind: 'gstack-installed';
    root: string;
} | {
    kind: 'gstack-updated';
    root: string;
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
};
/**
 * Ensure gstack is installed and up-to-date.
 * - Not present: clone from main + setup.
 * - Already present: pull latest main + re-run setup.
 */
export declare function ensureGstack(input: EnsureGstackInput): EnsureGstackResult;
//# sourceMappingURL=index.d.ts.map