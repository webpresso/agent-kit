/**
 * Process-group-aware termination for spawned dev-servers (wrangler/workerd).
 *
 * Self-contained. Lets consumers replace `child.kill("SIGTERM")` (which leaks
 * the worker's child process group) with a group signal + SIGKILL escalation.
 */
import type { ChildProcess } from "node:child_process";

export interface ProcessTreeTerminationOptions {
  readonly signal?: NodeJS.Signals;
  readonly escalationSignal?: NodeJS.Signals;
  readonly escalationDelayMs?: number;
}

const DEFAULT_TERMINATION_SIGNAL: NodeJS.Signals = "SIGTERM";
const DEFAULT_ESCALATION_SIGNAL: NodeJS.Signals = "SIGKILL";
const DEFAULT_ESCALATION_DELAY_MS = 1_000;

/** Signal the whole process group (Unix `-pid`), falling back to the direct child. */
export function signalProcessTree(
  child: Pick<ChildProcess, "pid" | "kill">,
  signal: NodeJS.Signals = DEFAULT_TERMINATION_SIGNAL,
): void {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Group may be gone or denied; fall through to the direct child.
    }
  }
  child.kill(signal);
}

/**
 * Signal the process group now, then escalate to SIGKILL after a grace delay.
 * Returns a cancel function that clears the escalation timer (call it once the
 * process has exited cleanly).
 */
export function terminateProcessTreeWithEscalation(
  child: Pick<ChildProcess, "pid" | "kill">,
  options: ProcessTreeTerminationOptions = {},
): () => void {
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
