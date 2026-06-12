/**
 * Session capture, snapshot, and restore primitives — ctx-rs backend only.
 *
 * Missing ctx-rs runtime is treated as a loud failure: errors are written to
 * stderr and no TS fallback path is attempted on this branch.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { loadCtxRsSync } from './backend.js'
import { getStore } from './store.js'
import type {
  CaptureEventInput,
  RestoreInput,
  RestoreResult,
  SnapshotInput,
  SnapshotResult,
} from './types.js'
import { isUnavailable } from './types.js'

const SESSIONS_DIR = join(homedir(), '.webpresso', 'sessions')

export function resolveDbPath(repoHash: string, sessionsDir?: string): string {
  const dir = sessionsDir ?? SESSIONS_DIR
  return join(dir, `${repoHash}.db`)
}

/**
 * Append a tool event to the session event log.
 * Never throws — errors are logged to stderr and return false.
 */
export function captureEvent(input: CaptureEventInput, sessionsDir?: string): boolean {
  try {
    const dbPath = resolveDbPath(input.repoHash, sessionsDir)
    mkdirSync(join(dbPath, '..'), { recursive: true })
    const ctxRs = loadCtxRsSync()
    const eventId = randomUUID()
    const result = ctxRs.captureEvent(
      dbPath,
      input.event.sessionId,
      eventId,
      input.event.toolName,
      input.event.content,
    )
    if (isUnavailable(result)) {
      throw new Error('ctx-rs unavailable for captureEvent')
    }
    return true
  } catch (err) {
    process.stderr.write(`ak-session-memory: captureEvent failed: ${(err as Error).message}
`)
    return false
  }
}

/**
 * Consolidate recent session events into a snapshot row.
 * Respects a cap (capMs) — partial snapshots are allowed on timeout.
 */
export async function snapshot(
  input: SnapshotInput,
  sessionsDir?: string,
): Promise<SnapshotResult> {
  const snapshotId = randomUUID()
  try {
    const dbPath = resolveDbPath(input.repoHash, sessionsDir)
    const ctxRs = loadCtxRsSync()
    const agentId = process.env['CLAUDE_SESSION_ID'] ?? 'unknown'
    const result = ctxRs.snapshot(dbPath, agentId, input.capMs)
    if (isUnavailable(result)) {
      throw new Error('ctx-rs unavailable for snapshot')
    }
    const snap = result as {
      snapshotId?: string
      snapshot_id?: string
      eventCount?: number
      event_count?: number
      complete: boolean
    }
    return {
      snapshotId: snap.snapshotId ?? snap.snapshot_id ?? snapshotId,
      eventsIncluded: snap.eventCount ?? snap.event_count ?? 0,
      partial: !snap.complete,
    }
  } catch (err) {
    process.stderr.write(`ak-session-memory: snapshot failed: ${(err as Error).message}
`)
    return { snapshotId, eventsIncluded: 0, partial: true }
  }
}

/**
 * Restore session context relevant to the given query.
 */
export function restore(input: RestoreInput, sessionsDir?: string): RestoreResult {
  try {
    const dbPath = resolveDbPath(input.repoHash, sessionsDir)
    const ctxRs = loadCtxRsSync()
    const agentId = process.env['CLAUDE_SESSION_ID'] ?? 'unknown'
    const result = ctxRs.restore(dbPath, agentId, input.query, input.limit ?? 10)
    if (isUnavailable(result)) {
      throw new Error('ctx-rs unavailable for restore')
    }
    const events = result as Array<{
      sessionId?: string
      session_id?: string
      eventId?: string
      event_id?: string
      ts: number
      toolName?: string
      tool_name?: string
      content: string
    }>

    const store = getStore(dbPath)
    const hits = store.search({ query: input.query, limit: input.limit ?? 10 })
    return {
      hits,
      snapshotId: events[0]?.sessionId ?? events[0]?.session_id ?? null,
    }
  } catch (err) {
    process.stderr.write(`ak-session-memory: restore failed: ${(err as Error).message}
`)
    return { hits: [], snapshotId: null }
  }
}
