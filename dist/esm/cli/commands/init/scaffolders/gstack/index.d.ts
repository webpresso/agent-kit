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
 * `./setup --team`. When Codex is detected, webpresso runs gstack's explicit
 * `./setup --host codex --team` flow from that same checkout so Codex is
 * materialized without accidentally fanning out to every host binary on PATH.
 *
 * Side-effect outside the consumer repo: writes to the user's home dir.
 * This is intentional — gstack is global by design.
 */
import { spawn, spawnSync } from 'node:child_process';
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
    /** DI seam for child_process.spawn. */
    spawn?: SpawnLike;
    /** DI seam for child_process.spawnSync for probes. */
    probeSpawnSync?: typeof spawnSync;
    /** DI seam for fs.existsSync. */
    exists?: typeof existsSync;
    /** DI seam for Codex detection in tests. */
    detectCodex?: (input: {
        spawnSync: typeof spawnSync;
        exists: typeof existsSync;
        codexConfigPath: string;
    }) => boolean;
    /** DI seam for spinner. Defaults to noop when !process.stdout.isTTY, ora otherwise. */
    spinnerFactory?: SpinnerFactory;
    /** DI seam for environment-backed host/output policy. */
    env?: NodeJS.ProcessEnv;
    /** DI seam for user-visible progress lines. */
    log?: (message: string) => void;
    /** DI seam for timing. */
    now?: () => number;
    /** DI seam for platform-specific process behavior. */
    platform?: NodeJS.Platform;
    /** DI seam for signal listener installation. */
    signalTarget?: SignalTarget;
    /** DI seam for process-group signaling. */
    processKill?: typeof process.kill;
    /** DI seam for verbose output streaming. */
    streamOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
    /** Override the session log path. Useful in tests. */
    sessionLogPath?: string;
    /** DI seam for timers. */
    setTimeoutImpl?: typeof setTimeout;
    /** DI seam for timers. */
    clearTimeoutImpl?: typeof clearTimeout;
    /** DI seam for quiet-mode progress heartbeats. */
    heartbeatIntervalMs?: number;
}
export type GstackCodexResult = {
    kind: 'gstack-codex-installed';
    skillsRoot: string;
} | {
    kind: 'gstack-codex-updated';
    skillsRoot: string;
} | {
    kind: 'gstack-codex-already-configured';
    skillsRoot: string;
} | {
    kind: 'gstack-codex-skipped';
    reason: 'not-detected' | 'not-requested';
    skillsRoot: string;
};
export type GstackFailureReason = 'exit-nonzero' | 'inactivity-timeout' | 'signal-interrupted';
type GstackTimedOutCommand = 'git clone' | 'git pull' | GstackSetupCommand;
type GstackFailureBase = {
    exitCode: number;
    reason: GstackFailureReason;
    logPath: string;
    timedOutCommand?: GstackTimedOutCommand;
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
    kind: 'gstack-already-configured';
    root: string;
    codex: GstackCodexResult;
} | {
    kind: 'gstack-skipped-dry-run';
} | ({
    kind: 'gstack-clone-failed';
} & GstackFailureBase) | ({
    kind: 'gstack-pull-failed';
} & GstackFailureBase) | ({
    kind: 'gstack-setup-failed';
    command: GstackSetupCommand;
} & GstackFailureBase);
type GstackSetupHost = 'auto' | 'codex';
type GstackSetupCommand = '--team' | `--host ${GstackSetupHost} --team`;
type SignalTarget = Pick<NodeJS.Process, 'on' | 'off'>;
type SpawnedChild = ReturnType<typeof spawn>;
type SpawnLike = (command: string, args: readonly string[], options: SpawnOptions) => SpawnedChild;
type SpawnOptions = {
    cwd?: string;
    detached: boolean;
    stdio: ['ignore', 'pipe', 'pipe'];
    windowsHide: boolean;
};
/**
 * Ensure gstack is installed and up-to-date.
 * - Not present: clone from main + setup.
 * - Already present and requested host skills exist: return cached unless a
 *   refresh was explicitly requested.
 * - Explicit refresh: pull latest main + re-run setup.
 * - If Codex is detected: materialize Codex skills from the canonical checkout.
 */
export declare function ensureGstack(input: EnsureGstackInput): Promise<EnsureGstackResult>;
export {};
//# sourceMappingURL=index.d.ts.map