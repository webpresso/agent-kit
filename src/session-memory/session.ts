/**
 * Session capture, snapshot, and restore primitives.
 *
 * Wraps the SQLite store for session-event lifecycle management.
 * All methods are non-blocking: errors are logged to stderr and return success.
 *
 * DB location: ~/.webpresso/sessions/<repo-hash>.db
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
import { getStore, type ISessionStore } from './store.js'

function defaultSessionsDir(): string {
  return process.env.AK_SESSION_MEMORY_DIR ?? join(homedir(), '.webpresso', 'sessions')
}

export function resolveDbPath(repoHash: string, sessionsDir?: string): string {
  const dir = sessionsDir ?? defaultSessionsDir()
  return join(dir, `${repoHash}.db`)
}

function ensureSessionsDir(sessionsDir?: string): void {
  mkdirSync(sessionsDir ?? defaultSessionsDir(), { recursive: true })
}

function getSessionStore(repoHash: string, sessionsDir?: string): ISessionStore {
  ensureSessionsDir(sessionsDir)
  const dbPath = resolveDbPath(repoHash, sessionsDir)
  return getStore(dbPath)
}

/**
 * Append a tool event to the session event log.
 * Target: <0.5ms (sync better-sqlite3 INSERT).
 * Never throws — errors are logged to stderr, returns false on failure.
 */
export function captureEvent(input: CaptureEventInput, sessionsDir?: string): boolean {
  try {
    const store = getSessionStore(input.repoHash, sessionsDir)
    const db = store.getDb()
    const eventId = randomUUID()
    const ts = Date.now()

    db.prepare(
      'INSERT INTO session_events(session_id, event_id, ts, tool_name, content) VALUES (?, ?, ?, ?, ?)',
    ).run(input.event.sessionId, eventId, ts, input.event.toolName, input.event.content)

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
 * Returns the snapshot result even if partial.
 */
export async function snapshot(
  input: SnapshotInput,
  sessionsDir?: string,
): Promise<SnapshotResult> {
  const snapshotId = randomUUID()
  try {
    const store = getSessionStore(input.repoHash, sessionsDir)
    const db = store.getDb()

    // Collect pending events (events not yet included in a snapshot)
    const events = db
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

    let partial = false
    let includedCount = events.length

    // Apply time cap — abort consolidation if taking too long
    const startMs = Date.now()
    const capDeadline = startMs + input.capMs

    const consolidate = db.transaction(() => {
      for (let i = 0; i < events.length; i++) {
        if (Date.now() > capDeadline) {
          partial = true
          includedCount = i
          break
        }
      }

      const eventsToInclude = events.slice(0, includedCount)
      const contentJson = JSON.stringify(eventsToInclude)

      const agentId = process.env.CLAUDE_SESSION_ID ?? 'unknown'
      db.prepare(
        `INSERT INTO sessions(agent_id, snapshot_id, created_at, status, content_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(agent_id, snapshot_id) DO NOTHING`,
      ).run(agentId, snapshotId, Date.now(), partial ? 'partial' : 'complete', contentJson)
    })

    consolidate()

    // Also index event content for search
    const eventsForIndex = events.slice(0, includedCount)
    if (eventsForIndex.length > 0) {
      store.insertChunks(
        eventsForIndex.map((e) => ({
          content: `${e.tool_name}: ${e.content}`,
          source: `session:${snapshotId}`,
        })),
      )
    }

    return { snapshotId, eventsIncluded: includedCount, partial }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`ak-session-memory: snapshot failed: ${msg}\n`)
    return { snapshotId, eventsIncluded: 0, partial: true, error: msg }
  }
}

/**
 * Restore session context relevant to the given query.
 * Searches event content for the most relevant chunks and returns them.
 */
export function restore(input: RestoreInput, sessionsDir?: string): RestoreResult {
  try {
    const store = getSessionStore(input.repoHash, sessionsDir)
    const db = store.getDb()

    // Get the most recent snapshot id
    const latestSnapshot = db
      .prepare(
        `SELECT snapshot_id FROM sessions
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get() as { snapshot_id: string } | undefined

    const hits = store.search({
      query: input.query,
      limit: input.limit ?? 10,
      source: input.source,
    })

    return {
      hits,
      snapshotId: latestSnapshot?.snapshot_id ?? null,
    }
  } catch (err: unknown) {
    process.stderr.write(
      `ak-session-memory: restore failed: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return { hits: [], snapshotId: null }
  }
}
