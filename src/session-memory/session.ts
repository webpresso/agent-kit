/**
 * Session capture, snapshot, and restore primitives — v2 with ctx-rs backend.
 *
 * All methods are non-blocking: errors are logged to stderr and return success.
 *
 * DB location: ~/.webpresso/sessions/<repo-hash>.db
 * Backend: ctx-rs (default) or better-sqlite3 TS engine (fallback via AK_SESSION_ENGINE=ts)
 */
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import type {
  CaptureEventInput,
  RestoreInput,
  RestoreResult,
  SnapshotInput,
  SnapshotResult,
} from './types.js'
import { isUnavailable } from './types.js'
import { getStore } from './store.js'
import { tryLoadCtxRsSync, resolveBackend } from './backend.js'

const SESSIONS_DIR = join(homedir(), '.webpresso', 'sessions')

export function resolveDbPath(repoHash: string, sessionsDir?: string): string {
  const dir = sessionsDir ?? SESSIONS_DIR
  return join(dir, `${repoHash}.db`)
}

function ensureSessionsDir(sessionsDir: string): void {
  mkdirSync(sessionsDir, { recursive: true })
}

function getSessionStore(repoHash: string, sessionsDir?: string) {
  const dir = sessionsDir ?? SESSIONS_DIR
  ensureSessionsDir(dir)
  const dbPath = resolveDbPath(repoHash, sessionsDir)
  return getStore(dbPath)
}

/**
 * Append a tool event to the session event log.
 * Target: <0.5ms (sync better-sqlite3 INSERT or ctx-rs FFI call).
 * Never throws — errors are logged to stderr, returns false on failure.
 */
export function captureEvent(input: CaptureEventInput, sessionsDir?: string): boolean {
  try {
    const dbPath = resolveDbPath(input.repoHash, sessionsDir)
    mkdirSync(join(dbPath, '..'), { recursive: true })
    const eventId = randomUUID()
    const ts = Date.now()

    const backend = resolveBackend()
    if (backend === 'ctx-rs') {
      const ctxRs = tryLoadCtxRsSync()
      if (ctxRs !== null) {
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
      }
      // Fall through to TS engine
    }

    // TS engine path
    const store = getSessionStore(input.repoHash, sessionsDir)
    const db = (store as { getDb?(): unknown }).getDb?.()
    if (db === undefined || db === null) {
      throw new Error('TS store does not expose getDb — ctx-rs fallback failed')
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyDb = db as any
    anyDb
      .prepare(
        'INSERT INTO session_events(session_id, event_id, ts, tool_name, content) VALUES (?, ?, ?, ?, ?)',
      )
      .run(input.event.sessionId, eventId, ts, input.event.toolName, input.event.content)

    return true
  } catch (err: unknown) {
    process.stderr.write(
      `ak-session-memory: captureEvent failed: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return false
  }
}

/**
 * Consolidate recent session events into a snapshot row.
 * Respects a cap (capMs) — partial snapshots are allowed on timeout.
 */
export async function snapshot(input: SnapshotInput, sessionsDir?: string): Promise<SnapshotResult> {
  const snapshotId = randomUUID()
  try {
    const dbPath = resolveDbPath(input.repoHash, sessionsDir)
    const backend = resolveBackend()

    if (backend === 'ctx-rs') {
      const ctxRs = tryLoadCtxRsSync()
      if (ctxRs !== null) {
        const agentId = process.env['CLAUDE_SESSION_ID'] ?? 'unknown'
        const result = ctxRs.snapshot(dbPath, agentId, input.capMs)
        if (isUnavailable(result)) {
          throw new Error('ctx-rs unavailable for snapshot')
        }
        const snap = result as { snapshotId: string; eventCount: number; complete: boolean }
        return {
          snapshotId: snap.snapshotId,
          eventsIncluded: snap.eventCount,
          partial: !snap.complete,
        }
      }
    }

    // TS engine fallback
    return await snapshotTs(input, snapshotId, sessionsDir)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`ak-session-memory: snapshot failed: ${message}\n`)
    return { snapshotId, eventsIncluded: 0, partial: true, error: message }
  }
}

async function snapshotTs(
  input: SnapshotInput,
  snapshotId: string,
  sessionsDir?: string,
): Promise<SnapshotResult> {
  const store = getSessionStore(input.repoHash, sessionsDir)
  const db = (store as { getDb?(): unknown }).getDb?.()
  if (db === undefined || db === null) {
    throw new Error('TS store does not expose getDb')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any

  const events = anyDb
    .prepare(
      `SELECT session_id, event_id, ts, tool_name, content
       FROM session_events
       ORDER BY ts DESC
       LIMIT 200`,
    )
    .all() as Array<{
    session_id: string
    event_id: string
    ts: number
    tool_name: string
    content: string
  }>

  const deadline = Date.now() + input.capMs
  let includedCount = events.length
  let partial = false

  for (let i = 0; i < events.length; i++) {
    if (Date.now() > deadline) {
      includedCount = i
      partial = true
      break
    }
  }

  const eventsToInclude = events.slice(0, includedCount)
  const contentJson = JSON.stringify(eventsToInclude)
  const agentId = process.env['CLAUDE_SESSION_ID'] ?? 'unknown'

  anyDb
    .prepare(
      `INSERT INTO sessions(agent_id, snapshot_id, created_at, status, content_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(agent_id, snapshot_id) DO NOTHING`,
    )
    .run(agentId, snapshotId, Date.now(), partial ? 'partial' : 'complete', contentJson)

  return { snapshotId, eventsIncluded: includedCount, partial }
}

/**
 * Restore session context relevant to the given query.
 * Searches event content for the most relevant chunks and returns them.
 */
export function restore(input: RestoreInput, sessionsDir?: string): RestoreResult {
  try {
    const dbPath = resolveDbPath(input.repoHash, sessionsDir)
    const backend = resolveBackend()

    if (backend === 'ctx-rs') {
      const ctxRs = tryLoadCtxRsSync()
      if (ctxRs !== null) {
        const agentId = process.env['CLAUDE_SESSION_ID'] ?? 'unknown'
        const result = ctxRs.restore(dbPath, agentId, input.query, input.limit ?? 10)
        if (isUnavailable(result)) {
          throw new Error('ctx-rs unavailable for restore')
        }
        const events = result as Array<{
          sessionId: string
          eventId: string
          ts: number
          toolName: string
          content: string
        }>

        // Also search the store for related indexed content
        const store = getSessionStore(input.repoHash, sessionsDir)
        const hits = store.search({ query: input.query, limit: input.limit ?? 10 })

        return {
          hits,
          snapshotId: events.length > 0 ? (events[0]?.sessionId ?? null) : null,
        }
      }
    }

    // TS engine fallback
    const store = getSessionStore(input.repoHash, sessionsDir)
    const db = (store as { getDb?(): unknown }).getDb?.()

    const latestSnapshot =
      db !== undefined && db !== null
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((db as any)
            .prepare(`SELECT snapshot_id FROM sessions ORDER BY created_at DESC LIMIT 1`)
            .get() as { snapshot_id: string } | undefined)
        : undefined

    const hits = store.search({ query: input.query, limit: input.limit ?? 10 })
    return { hits, snapshotId: latestSnapshot?.snapshot_id ?? null }
  } catch (err: unknown) {
    process.stderr.write(
      `ak-session-memory: restore failed: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return { hits: [], snapshotId: null }
  }
}
