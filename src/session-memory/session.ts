import { Database } from '#db/sqlite.js'

import type {
  RestoreInput,
  RestoredSessionEvent,
  SessionCaptureInput,
  SnapshotInput,
  SnapshotResult,
} from './types.js'

type EventRow = {
  session_id: string
  event_id: string
  ts: string
  tool_name: string
  content: string
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  agent_id TEXT NOT NULL,
  snapshot_id TEXT PRIMARY KEY,
  repo_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  content_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_repo_created ON sessions(repo_hash, created_at DESC);
CREATE TABLE IF NOT EXISTS session_events (
  session_id TEXT NOT NULL,
  event_id TEXT PRIMARY KEY,
  repo_hash TEXT NOT NULL,
  ts TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_events_repo_ts ON session_events(repo_hash, ts DESC);
CREATE VIRTUAL TABLE IF NOT EXISTS session_events_fts
  USING fts5(session_id UNINDEXED, event_id UNINDEXED, repo_hash UNINDEXED, tool_name UNINDEXED, content, tokenize='porter');
`

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export class SessionMemorySessionStore {
  private readonly db: Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec(SCHEMA_SQL)
  }

  close(): void {
    this.db.close()
  }

  captureEvent(input: SessionCaptureInput): string {
    const sessionId = input.sessionId ?? `${input.repoHash}:${input.agentId ?? 'default'}`
    const eventId = input.event.eventId ?? newId('evt')
    const ts = input.event.ts ?? new Date().toISOString()
    this.db
      .prepare<[string, string, string, string, string, string]>(
        `INSERT OR REPLACE INTO session_events (session_id, event_id, repo_hash, ts, tool_name, content)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(sessionId, eventId, input.repoHash, ts, input.event.toolName, input.event.content)
    this.db.prepare<[string]>('DELETE FROM session_events_fts WHERE event_id = ?').run(eventId)
    this.db
      .prepare<[string, string, string, string, string]>(
        'INSERT INTO session_events_fts (session_id, event_id, repo_hash, tool_name, content) VALUES (?, ?, ?, ?, ?)',
      )
      .run(sessionId, eventId, input.repoHash, input.event.toolName, input.event.content)
    return eventId
  }

  snapshot(input: SnapshotInput): SnapshotResult {
    const started = performance.now()
    const capMs = input.capMs ?? 5000
    const sessionId = input.sessionId ?? `${input.repoHash}:${input.agentId ?? 'default'}`
    const rows = this.db
      .prepare<[string, string], EventRow>(
        `SELECT session_id, event_id, ts, tool_name, content
         FROM session_events
         WHERE repo_hash = ? AND session_id = ?
         ORDER BY ts ASC`,
      )
      .all(input.repoHash, sessionId)
    const included: EventRow[] = []
    for (const row of rows) {
      if (performance.now() - started >= capMs) break
      included.push(row)
    }
    const status: SnapshotResult['status'] = included.length < rows.length ? 'partial' : 'complete'
    const content = included.map((row) => `[${row.ts}] ${row.tool_name}: ${row.content}`).join('\n')
    const snapshotId = newId('snap')
    this.db
      .prepare<[string, string, string, string, string, string]>(
        `INSERT INTO sessions (agent_id, snapshot_id, repo_hash, created_at, status, content_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.agentId ?? 'default',
        snapshotId,
        input.repoHash,
        new Date().toISOString(),
        status,
        JSON.stringify({ events: included, content }),
      )
    return { snapshotId, sessionId, status, eventCount: included.length, content }
  }

  restore(input: RestoreInput): RestoredSessionEvent[] {
    const query = input.query
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .map((token) => `"${token.replaceAll('"', '""')}"`)
      .join(' ')
    if (!query) return []
    const rows = this.db
      .prepare<[string, string, number], EventRow & { score: number }>(
        `SELECT e.session_id, e.event_id, e.ts, e.tool_name, e.content, bm25(session_events_fts) * -1 AS score
         FROM session_events_fts f
         JOIN session_events e ON e.event_id = f.event_id
         WHERE session_events_fts MATCH ? AND e.repo_hash = ?
         ORDER BY score DESC, e.ts DESC
         LIMIT ?`,
      )
      .all(query, input.repoHash, input.limit ?? 5)
    return rows.map((row) => ({
      sessionId: row.session_id,
      eventId: row.event_id,
      ts: row.ts,
      toolName: row.tool_name,
      content: row.content,
      score: row.score,
    }))
  }
}
