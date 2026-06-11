/**
 * Session capture, snapshot, and restore primitives — v2 with ctx-rs backend.
 *
 * All methods are non-blocking: errors are logged to stderr and return success.
 *
 * DB location: ~/.webpresso/sessions/<repo-hash>.db
 * Backend: ctx-rs (default) or the TypeScript SQLite engine (fallback via AK_SESSION_ENGINE=ts)
 */
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
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

interface TsDb {
  prepare<Params extends unknown[] = unknown[], ReturnType = Record<string, unknown>>(
    sql: string,
  ): {
    get(...params: Params): ReturnType | undefined | null
    all(...params: Params): ReturnType[]
    run(...params: Params): { changes: number; lastInsertRowid: number | bigint }
  }
}

function getTsDb(repoHash: string, sessionsDir?: string): TsDb {
  const store = getSessionStore(repoHash, sessionsDir)
  const db = (store as { getDb?(): TsDb }).getDb?.()
  if (db === undefined || db === null) {
    throw new Error('TS store does not expose getDb')
  }
  return db
}


function resolveActiveSessionId(): string | null {
  return process.env['CLAUDE_SESSION_ID'] ?? null
}

function resolveLatestSnapshotId(db: TsDb, sessionId: string | null): string | null {
  if (sessionId !== null) {
    const scoped = db
      .prepare<[string], { snapshot_id: string }>(
        'SELECT snapshot_id FROM sessions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1',
      )
      .get(sessionId)
    if (scoped?.snapshot_id) return scoped.snapshot_id
  }

  const latest = db
    .prepare<[], { snapshot_id: string }>(
      'SELECT snapshot_id FROM sessions ORDER BY created_at DESC LIMIT 1',
    )
    .get()
  return latest?.snapshot_id ?? null
}
/**
 * Append a tool event to the session event log.
 * Target: <0.5ms (sync better-sqlite3 INSERT or ctx-rs FFI call).
 * Never throws — errors are logged to stderr, returns false on failure.
 */
export function captureEvent(input: CaptureEventInput, sessionsDir?: string): boolean {
  try {
    const dbPath = resolveDbPath(input.repoHash, sessionsDir)
    mkdirSync(dirname(dbPath), { recursive: true })
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
    const db = getTsDb(input.repoHash, sessionsDir)
    db
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
        const agentId = resolveActiveSessionId() ?? 'unknown'
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
  const db = getTsDb(input.repoHash, sessionsDir)

  const sessionId = resolveActiveSessionId()
  const events = (sessionId !== null
    ? db
        .prepare<[string], {
          session_id: string
          event_id: string
          ts: number
          tool_name: string
          content: string
        }>(
          `SELECT session_id, event_id, ts, tool_name, content
           FROM session_events
           WHERE session_id = ?
           ORDER BY ts DESC
           LIMIT 200`,
        )
        .all(sessionId)
    : db
        .prepare<[], {
          session_id: string
          event_id: string
          ts: number
          tool_name: string
          content: string
        }>(
          `SELECT session_id, event_id, ts, tool_name, content
           FROM session_events
           ORDER BY ts DESC
           LIMIT 200`,
        )
        .all()) as Array<{
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

  db
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
        const agentId = resolveActiveSessionId() ?? 'unknown'
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

        const snapshotId = resolveLatestSnapshotId(getTsDb(input.repoHash, sessionsDir), resolveActiveSessionId())
        return {
          hits,
          snapshotId,
        }
      }
    }

    // TS engine fallback
    const store = getSessionStore(input.repoHash, sessionsDir)
    const db = getTsDb(input.repoHash, sessionsDir)
    const hits = store.search({ query: input.query, limit: input.limit ?? 10 })
    return { hits, snapshotId: resolveLatestSnapshotId(db, resolveActiveSessionId()) }
  } catch (err: unknown) {
    process.stderr.write(
      `ak-session-memory: restore failed: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return { hits: [], snapshotId: null }
  }
}
