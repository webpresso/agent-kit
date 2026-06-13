/**
 * `agent-kit-global` self-update scaffolder.
 *
 * Keeps the globally-distributed `@webpresso/agent-kit` install fresh on every
 * `wp setup`, mirroring how omx / omc / codex / claude self-update their own
 * global installs. The PATH `wp` launcher resolves through this install, so
 * refreshing it here means the next global invocation runs the latest
 * published release.
 *
 * Uses the exact same command the auto-update installer infers
 * (`buildVpGlobalInstallCommand` — single source of truth), so there is no
 * second place that can drift on the install incantation.
 *
 * Skipped (no-op, non-fatal) when:
 *   - `--dry-run` (no writes anywhere),
 *   - `WP_SKIP_AUTO_INSTALL=1` (the documented opt-out, surfaced in the update
 *     banner),
 *   - the running binary resolves into a webpresso source/git clone — a global
 *     install would clobber the developer's working clone with a published
 *     tarball (`detectGitInstall`),
 *   - `vp` is not on PATH (nothing to install with).
 *
 * A failed refresh is reported but NEVER fails consumer setup: keeping the
 * global tool current is ancillary to scaffolding the consumer repo (same
 * warn-only contract as the codex-cli scaffolder).
 */
import { spawnSync } from 'node:child_process';
import type { MergeOptions } from '#cli/commands/init/merge';
import { type SpinnerFactory } from '#cli/commands/init/scaffolders/spinner';
export interface EnsureAgentKitGlobalInput {
    options: MergeOptions;
    /** DI seam for child_process.spawnSync. */
    spawn?: typeof spawnSync;
    /** DI seam for environment-backed opt-out. */
    env?: NodeJS.ProcessEnv;
    /** The running binary path (defaults to process.argv[1]). Used for source-clone detection. */
    argv1?: string;
    /** DI seam for source/git-clone detection. */
    detectGit?: (argv1: string) => string | null;
    /** DI seam for tests/global installs; defaults to the package root owning argv1/import. */
    packageRoot?: string;
    /** DI seam for staging-root fallback when argv1 cannot be mapped back to the owning package. */
    resolvePackageRootForStaging?: (argv1: string) => string | null;
    /** DI seam for spinner. Defaults to noop when !process.stdout.isTTY. */
    spinnerFactory?: SpinnerFactory;
}
export type EnsureAgentKitGlobalResult = {
    kind: 'agent-kit-global-updated';
    command: readonly string[];
    repairedLauncher?: string;
} | {
    kind: 'agent-kit-global-skipped-dry-run';
} | {
    kind: 'agent-kit-global-skipped-opt-out';
} | {
    kind: 'agent-kit-global-skipped-source-clone';
    repoRoot: string;
} | {
    kind: 'agent-kit-global-skipped-no-vp';
    hint: string;
} | {
    kind: 'agent-kit-global-failed';
    exitCode: number;
    command: readonly string[];
} | {
    kind: 'agent-kit-global-repair-failed';
    reason: string;
    command: readonly string[];
};
/**
 * Refresh the single global `@webpresso/agent-kit` install via `vp install -g`.
 */
export declare function ensureAgentKitGlobal(input: EnsureAgentKitGlobalInput): EnsureAgentKitGlobalResult;
//# sourceMappingURL=index.d.ts.map