import type { ChildProcess } from 'node:child_process'

const SIGNAL_TO_EXIT_CODE: Readonly<Partial<Record<NodeJS.Signals, number>>> = {
  SIGINT: 2,
  SIGKILL: 9,
  SIGTERM: 15,
}

export const PROCESS_TREE_FORCE_KILL_GRACE_MS = 5_000

export function exitCodeFromSignal(signal: NodeJS.Signals | null): number {
  if (!signal) return 1
  return 128 + (SIGNAL_TO_EXIT_CODE[signal] ?? 15)
}

export function killProcessTree(
  child: Pick<ChildProcess, 'pid' | 'kill'>,
  signal: NodeJS.Signals,
): void {
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      // Fall through to direct-child signal delivery.
    }
  }
  child.kill(signal)
}

export function forceKillProcessTree(child: Pick<ChildProcess, 'pid' | 'kill'>): void {
  if (process.platform === 'win32' || !child.pid) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // Best-effort cleanup only; the group may already be gone.
  }
}
