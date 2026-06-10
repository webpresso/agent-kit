/**
 * Deferred install scheduler.
 *
 * The auto-update flow calls this synchronously after detecting an
 * available release. We DON'T wait for the install to finish — the parent
 * process exits cleanly and the install completes in a detached child.
 * The next invocation of `webpresso` picks up the new binary.
 *
 * Invariants (per plan Architecture decision 3 and Implementation surface
 * "Auto-update wiring"):
 *
 *   - Synchronous: returns before the install starts.
 *   - Detached + unref: the install survives the parent exit.
 *   - Tombstone before spawn: `autoInstallInProgress = <pid+ts>` is written
 *     to the configstore at `<state-root>/update-notifier-cache.json`
 *     *before* the spawn fires, so concurrent invocations within the
 *     lockout window (60s) skip the spawn.
 *   - Stdio captured to file: child stdout / stderr are piped to
 *     `<state-root>/auto-update.log` via an `openSync` file descriptor —
 *     not via Node IPC, which would tie child lifetime to parent.
 *   - Best-effort: any failure inside this function is logged via
 *     `logUpdateError` and swallowed; the user never sees an exception
 *     from a successful CLI run.
 */
/**
 * Concurrency-lockout window: a tombstone younger than this is considered
 * active; further `scheduleDeferredInstall` calls become no-ops.
 */
export declare const LOCKOUT_MS = 60000;
export interface InstallPlan {
    command: string[];
}
export interface Tombstone {
    autoInstallInProgress: {
        pid: number;
        ts: number;
    };
}
export interface ScheduleResult {
    /** Did we actually fork the install child? */
    spawned: boolean;
    /** When falsy, the human-facing reason for skipping. */
    reason?: string;
}
/**
 * Schedule a deferred install for the supplied command. Synchronous —
 * spawn() returns immediately; the child runs in the background. The parent
 * is free to `process.exit(0)` after this call returns.
 */
export declare function scheduleDeferredInstall(plan: InstallPlan): ScheduleResult;
/**
 * Clear the install-in-progress tombstone. Called by the install wrapper
 * on exit, or by tests. Best-effort.
 */
export declare function clearInstallTombstone(): void;
/**
 * Whether the given tombstone is within the lockout window relative to `now`.
 * Exported for testability.
 */
export declare function isTombstoneFresh(tombstone: Tombstone, now: number): boolean;
/**
 * Whether a process with the given pid is currently alive on this host.
 *
 * `process.kill(pid, 0)` sends no signal but performs the same existence /
 * permission checks the kernel would for a real signal:
 *
 *   - success            → the process exists and we may signal it → alive
 *   - throws `EPERM`     → the process exists but is owned by another user
 *                          (we lack permission to signal it) → alive
 *   - throws `ESRCH`     → no such process → not alive
 *
 * Any other error (or a non-positive / non-finite pid) is treated as
 * "cannot prove dead" → alive, so the time-based guard stays in control and
 * we never tear down a real in-progress install on an unexpected errno.
 *
 * Exported for testability.
 */
export declare function isProcessAlive(pid: number): boolean;
/**
 * Whether the given tombstone represents an install that is genuinely still
 * in progress, and should therefore block a new spawn.
 *
 * A tombstone is only an active lockout when BOTH hold:
 *
 *   1. its recorded `pid` is still alive on this host, AND
 *   2. it is within the lockout window (`isTombstoneFresh`).
 *
 * The liveness check is the primary guard: if the recorded process is gone
 * (SIGKILL / crash before `clearInstallTombstone`), the tombstone is treated
 * as stale regardless of its age, so a dead installer never blocks installs
 * globally for the full lockout window. The age check remains a secondary
 * guard for the rare case where the OS recycled the pid onto an unrelated
 * live process — there, age bounds how long we honour an ambiguous match.
 *
 * `isAlive` is injectable for deterministic testing; it defaults to the real
 * `process.kill(pid, 0)` liveness probe.
 *
 * Exported for testability.
 */
export declare function isTombstoneActive(tombstone: Tombstone, now: number, isAlive?: (pid: number) => boolean): boolean;
/**
 * Build the canonical tombstone shape. Exported for testability.
 */
export declare function buildTombstone(pid: number, ts: number): Tombstone;
//# sourceMappingURL=installer.d.ts.map