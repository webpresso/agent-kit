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
 * Build the canonical tombstone shape. Exported for testability.
 */
export declare function buildTombstone(pid: number, ts: number): Tombstone;
//# sourceMappingURL=installer.d.ts.map