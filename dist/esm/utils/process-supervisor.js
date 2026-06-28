const SIGNAL_TO_EXIT_CODE = {
    SIGINT: 2,
    SIGKILL: 9,
    SIGTERM: 15,
};
export const PROCESS_TREE_FORCE_KILL_GRACE_MS = 5_000;
export function exitCodeFromSignal(signal) {
    if (!signal)
        return 1;
    return 128 + (SIGNAL_TO_EXIT_CODE[signal] ?? 15);
}
export function killProcessTree(child, signal) {
    if (process.platform !== "win32" && child.pid) {
        try {
            process.kill(-child.pid, signal);
            return;
        }
        catch {
            // Fall through to direct-child signal delivery.
        }
    }
    child.kill(signal);
}
export function forceKillProcessTree(child) {
    if (process.platform === "win32" || !child.pid)
        return;
    try {
        process.kill(-child.pid, "SIGKILL");
    }
    catch {
        // Best-effort cleanup only; the group may already be gone.
    }
}
//# sourceMappingURL=process-supervisor.js.map