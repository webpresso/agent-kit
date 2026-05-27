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
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { getSurfacePath } from '#paths/state-root.js';
import { logUpdateError } from './log.js';
/**
 * Concurrency-lockout window: a tombstone younger than this is considered
 * active; further `scheduleDeferredInstall` calls become no-ops.
 */
export const LOCKOUT_MS = 60_000;
/**
 * Schedule a deferred install for the supplied command. Synchronous —
 * spawn() returns immediately; the child runs in the background. The parent
 * is free to `process.exit(0)` after this call returns.
 */
export function scheduleDeferredInstall(plan) {
    try {
        if (plan.command.length === 0) {
            return { spawned: false, reason: 'empty install command' };
        }
        const configPath = resolveConfigPath();
        if (configPath === null) {
            return { spawned: false, reason: 'state root unavailable' };
        }
        const existing = readTombstone(configPath);
        if (existing !== null && isTombstoneFresh(existing, Date.now())) {
            return {
                spawned: false,
                reason: `recent install in progress (pid=${existing.autoInstallInProgress.pid})`,
            };
        }
        const logPath = resolveLogPath();
        if (logPath === null) {
            return { spawned: false, reason: 'log path unavailable' };
        }
        const tombstone = buildTombstone(process.pid, Date.now());
        writeTombstone(configPath, tombstone);
        const logFd = openLogForAppend(logPath);
        const command = plan.command[0]; // length checked above
        const args = plan.command.slice(1);
        const child = spawn(command, args, {
            detached: true,
            stdio: ['ignore', logFd, logFd],
            windowsHide: true,
        });
        child.unref();
        // Now safe to close our FD — the child has its own duplicates via stdio.
        closeSync(logFd);
        return { spawned: true };
    }
    catch (err) {
        logUpdateError(err);
        return { spawned: false, reason: 'spawn error' };
    }
}
/**
 * Clear the install-in-progress tombstone. Called by the install wrapper
 * on exit, or by tests. Best-effort.
 */
export function clearInstallTombstone() {
    try {
        const configPath = resolveConfigPath();
        if (configPath === null)
            return;
        if (!existsSync(configPath))
            return;
        const current = readTombstone(configPath);
        if (current === null)
            return;
        const next = { ...readRaw(configPath) };
        delete next.autoInstallInProgress;
        writeFileSync(configPath, JSON.stringify(next));
    }
    catch {
        // Best-effort — no caller waits on this.
    }
}
/**
 * Whether the given tombstone is within the lockout window relative to `now`.
 * Exported for testability.
 */
export function isTombstoneFresh(tombstone, now) {
    return now - tombstone.autoInstallInProgress.ts < LOCKOUT_MS;
}
/**
 * Build the canonical tombstone shape. Exported for testability.
 */
export function buildTombstone(pid, ts) {
    return { autoInstallInProgress: { pid, ts } };
}
function resolveConfigPath() {
    try {
        return getSurfacePath('update-notifier-cache.json', 'user');
    }
    catch {
        return null;
    }
}
function resolveLogPath() {
    try {
        return getSurfacePath('auto-update.log', 'user');
    }
    catch {
        return null;
    }
}
function readRaw(configPath) {
    if (!existsSync(configPath))
        return {};
    try {
        const text = readFileSync(configPath, 'utf-8');
        if (text.trim().length === 0)
            return {};
        const parsed = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
            return {};
        return parsed;
    }
    catch {
        return {};
    }
}
function readTombstone(configPath) {
    const raw = readRaw(configPath);
    const value = raw.autoInstallInProgress;
    if (value === undefined || value === null || typeof value !== 'object')
        return null;
    const candidate = value;
    if (typeof candidate.pid !== 'number' || typeof candidate.ts !== 'number')
        return null;
    return { autoInstallInProgress: { pid: candidate.pid, ts: candidate.ts } };
}
function writeTombstone(configPath, tombstone) {
    const dir = dirname(configPath);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    const merged = { ...readRaw(configPath), ...tombstone };
    writeFileSync(configPath, JSON.stringify(merged));
}
function openLogForAppend(logPath) {
    const dir = dirname(logPath);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    // 'a' — create if missing, append, no truncation. Child inherits the offset.
    return openSync(logPath, 'a');
}
//# sourceMappingURL=installer.js.map