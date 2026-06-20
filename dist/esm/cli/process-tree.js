const DEFAULT_TERMINATION_SIGNAL = 'SIGTERM';
const DEFAULT_ESCALATION_SIGNAL = 'SIGKILL';
const DEFAULT_ESCALATION_DELAY_MS = 1_000;
export function signalProcessTree(child, signal = DEFAULT_TERMINATION_SIGNAL) {
    if (process.platform !== 'win32' && child.pid) {
        try {
            process.kill(-child.pid, signal);
            return;
        }
        catch {
            // Fall through to the direct child below. The process may have exited
            // between timeout/abort and signal delivery, or group kills may be denied.
        }
    }
    child.kill(signal);
}
export function terminateProcessTreeWithEscalation(child, options = {}) {
    const signal = options.signal ?? DEFAULT_TERMINATION_SIGNAL;
    const escalationSignal = options.escalationSignal ?? DEFAULT_ESCALATION_SIGNAL;
    const escalationDelayMs = options.escalationDelayMs ?? DEFAULT_ESCALATION_DELAY_MS;
    signalProcessTree(child, signal);
    const timer = setTimeout(() => {
        signalProcessTree(child, escalationSignal);
    }, escalationDelayMs);
    timer.unref?.();
    return () => clearTimeout(timer);
}
//# sourceMappingURL=process-tree.js.map