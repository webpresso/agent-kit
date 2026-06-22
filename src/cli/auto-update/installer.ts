/**
 * Deferred install scheduler.
 *
 * The auto-update flow calls this synchronously after detecting an
 * available release. We DON'T wait for the install to finish — the parent
 * process exits cleanly and the install completes in a detached child.
 * The next invocation of `wp` picks up the new binary.
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

import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'

import { getSurfacePath } from '#paths/state-root.js'
import { writeJsonFile } from '#shared-utils/write-json-file.js'
import { logUpdateError } from './log.js'

/**
 * Concurrency-lockout window: a tombstone younger than this is considered
 * active; further `scheduleDeferredInstall` calls become no-ops.
 */
export const LOCKOUT_MS = 60_000

export interface InstallPlan {
  command: string[]
}

export interface Tombstone {
  autoInstallInProgress: {
    pid: number
    ts: number
  }
}

export interface ScheduleResult {
  /** Did we actually fork the install child? */
  spawned: boolean
  /** When falsy, the human-facing reason for skipping. */
  reason?: string
}

/**
 * Schedule a deferred install for the supplied command. Synchronous —
 * spawn() returns immediately; the child runs in the background. The parent
 * is free to `process.exit(0)` after this call returns.
 */
export function scheduleDeferredInstall(plan: InstallPlan): ScheduleResult {
  try {
    if (plan.command.length === 0) {
      return { spawned: false, reason: 'empty install command' }
    }

    const configPath = resolveConfigPath()
    if (configPath === null) {
      return { spawned: false, reason: 'state root unavailable' }
    }

    const existing = readTombstone(configPath)
    if (existing !== null && isTombstoneActive(existing, Date.now())) {
      return {
        spawned: false,
        reason: `recent install in progress (pid=${existing.autoInstallInProgress.pid})`,
      }
    }

    const logPath = resolveLogPath()
    if (logPath === null) {
      return { spawned: false, reason: 'log path unavailable' }
    }

    const tombstone = buildTombstone(process.pid, Date.now())
    writeTombstone(configPath, tombstone)

    const logFd = openLogForAppend(logPath)
    const command = plan.command[0] as string // length checked above
    const args = plan.command.slice(1)

    const child = spawn(command, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    })
    child.unref()
    // Now safe to close our FD — the child has its own duplicates via stdio.
    closeSync(logFd)

    return { spawned: true }
  } catch (err) {
    logUpdateError(err)
    return { spawned: false, reason: 'spawn error' }
  }
}

/**
 * Clear the install-in-progress tombstone. Called by the install wrapper
 * on exit, or by tests. Best-effort.
 */
export function clearInstallTombstone(): void {
  try {
    const configPath = resolveConfigPath()
    if (configPath === null) return
    if (!existsSync(configPath)) return
    const current = readTombstone(configPath)
    if (current === null) return
    const next: Record<string, unknown> = { ...readRaw(configPath) }
    delete next.autoInstallInProgress
    writeJsonFile(configPath, next, { atomic: true, indent: 0, trailingNewline: false })
  } catch {
    // Best-effort — no caller waits on this.
  }
}

/**
 * Whether the given tombstone is within the lockout window relative to `now`.
 * Exported for testability.
 */
export function isTombstoneFresh(tombstone: Tombstone, now: number): boolean {
  return now - tombstone.autoInstallInProgress.ts < LOCKOUT_MS
}

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
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error) {
      const code = (error as { code?: unknown }).code
      if (code === 'ESRCH') return false
      if (code === 'EPERM') return true
    }
    // Unknown errno — fail safe to "alive" so the age guard remains in charge.
    return true
  }
}

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
export function isTombstoneActive(
  tombstone: Tombstone,
  now: number,
  isAlive: (pid: number) => boolean = isProcessAlive,
): boolean {
  if (!isAlive(tombstone.autoInstallInProgress.pid)) return false
  return isTombstoneFresh(tombstone, now)
}

/**
 * Build the canonical tombstone shape. Exported for testability.
 */
export function buildTombstone(pid: number, ts: number): Tombstone {
  return { autoInstallInProgress: { pid, ts } }
}

function resolveConfigPath(): string | null {
  try {
    return getSurfacePath('update-notifier-cache.json', 'user')
  } catch {
    return null
  }
}

function resolveLogPath(): string | null {
  try {
    return getSurfacePath('auto-update.log', 'user')
  } catch {
    return null
  }
}

function readRaw(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) return {}
  try {
    const text = readFileSync(configPath, 'utf-8')
    if (text.trim().length === 0) return {}
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function readTombstone(configPath: string): Tombstone | null {
  const raw = readRaw(configPath)
  const value = raw.autoInstallInProgress
  if (value === undefined || value === null || typeof value !== 'object') return null
  const candidate = value as { pid?: unknown; ts?: unknown }
  if (typeof candidate.pid !== 'number' || typeof candidate.ts !== 'number') return null
  return { autoInstallInProgress: { pid: candidate.pid, ts: candidate.ts } }
}

function writeTombstone(configPath: string, tombstone: Tombstone): void {
  const dir = dirname(configPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const merged = { ...readRaw(configPath), ...tombstone }
  writeJsonFile(configPath, merged, { atomic: true, indent: 0, trailingNewline: false })
}

function openLogForAppend(logPath: string): number {
  const dir = dirname(logPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // 'a' — create if missing, append, no truncation. Child inherits the offset.
  return openSync(logPath, 'a')
}
