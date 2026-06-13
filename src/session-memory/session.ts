import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { Database } from '#db/sqlite.js'

import type {
  RestoreInput,
  RestoredSessionEvent,
  SessionCaptureInput,
  SessionContinuityEventType,
  SessionMemoryUnifiedResult,
  SnapshotInput,
  SnapshotResult,
  CaptureEventInput,
  RestoreResult,
} from './types.js'
import { loadNativeSessionMemoryEngine } from './native-runtime.js'

export const SESSION_MEMORY_SCHEMA_VERSION = 2

const DEFAULT_PRIORITY = 50
const DEFAULT_MAX_EVENT_BYTES = 4096
const DEFAULT_MAX_SNAPSHOT_BYTES = 64 * 1024
const DEFAULT_MAX_CAPTURE_BYTES = 64 * 1024
const REQUIRED_EVENT_COLUMNS = [
  'session_id',
  'event_id',
  'repo_hash',
  'ts',
  'event_type',
  'tool_name',
  'content',
  'summary',
  'priority',
  'metadata_json',
] as const

type EventRow = {
  session_id: string
  event_id: string
  repo_hash: string
  ts: string
  event_type: SessionContinuityEventType
  tool_name: string
  content: string
  summary: string | null
  priority: number
  metadata_json: string
}

type EventEnvelope = {
  sessionId: string
  eventId: string
  ts: string
  eventType: SessionContinuityEventType
  toolName: string
  content: string
  summary?: string
  priority: number
  metadata: Record<string, unknown>
}

export interface SessionContinuityStats {
  eventCount: number
  repoCount: number
  sessionCount: number
  snapshotCount: number
}

export interface SessionContinuityPurgeOptions {
  repoHash?: string
  sessionId?: string
  confirm?: boolean
  allowGlobal?: boolean
}

export interface SessionContinuityPurgeResult {
  dryRun: boolean
  matchedEventCount: number
  deletedEventCount: number
  matchedSnapshotCount: number
  deletedSnapshotCount: number
  warnings: string[]
}

export interface SessionContinuityDoctorResult {
  ok: boolean
  eventCount: number
  repoCount: number
  sessionCount: number
  snapshotCount: number
  warnings: string[]
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
  event_type TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  priority INTEGER NOT NULL DEFAULT 50,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_session_events_repo_ts ON session_events(repo_hash, ts DESC);
CREATE VIRTUAL TABLE IF NOT EXISTS session_events_fts
  USING fts5(session_id UNINDEXED, event_id UNINDEXED, repo_hash UNINDEXED, tool_name UNINDEXED, content, tokenize='porter');
`

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  if (maxBytes < 0 || byteLength(value) <= maxBytes) return { value, truncated: false }
  let bytes = 0
  let output = ''
  for (const char of value) {
    const charBytes = byteLength(char)
    if (bytes + charBytes > maxBytes) break
    output += char
    bytes += charBytes
  }
  return { value: output, truncated: true }
}

function unifiedPreview(value: string, maxBytes: number): string {
  return truncateUtf8(value, maxBytes).value
}

function normalizeLimit(value: number | undefined, fallback: number, max = 50): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.trunc(value), max)
}

function dedupeUnifiedResults(
  results: SessionMemoryUnifiedResult[],
  limit: number,
): SessionMemoryUnifiedResult[] {
  const seen = new Set<string>()
  return results
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.timestamp.localeCompare(a.timestamp) ||
        a.provenance.id.localeCompare(b.provenance.id),
    )
    .filter((result) => {
      if (seen.has(result.dedupeKey)) return false
      seen.add(result.dedupeKey)
      return true
    })
    .slice(0, limit)
}

function normalizePriority(priority: number | undefined): number {
  if (typeof priority !== 'number' || !Number.isFinite(priority)) return DEFAULT_PRIORITY
  return Math.trunc(priority)
}

function normalizePlainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(value, (_key, nested) => {
    if (typeof nested === 'bigint') return nested.toString()
    if (typeof nested === 'object' && nested !== null) {
      if (seen.has(nested)) return '[Circular]'
      seen.add(nested)
    }
    return nested
  })
}

function normalizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  return JSON.parse(safeJsonStringify(normalizePlainRecord(metadata))) as Record<string, unknown>
}

function parseMetadata(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown
    return normalizePlainRecord(parsed)
  } catch {
    // Corrupt metadata should not make restore or snapshot fail.
  }
  return {}
}

function ftsContent(row: Pick<EventRow, 'content' | 'summary' | 'event_type'>): string {
  return [row.event_type, row.summary, row.content].filter(Boolean).join('\n')
}

function rowToEnvelope(row: EventRow, maxEventBytes: number): EventEnvelope {
  const metadata = parseMetadata(row.metadata_json)
  const truncated = truncateUtf8(row.content, maxEventBytes)
  if (truncated.truncated) metadata.truncated = true
  return {
    sessionId: row.session_id,
    eventId: row.event_id,
    ts: row.ts,
    eventType: row.event_type,
    toolName: row.tool_name,
    content: truncated.value,
    ...(row.summary ? { summary: row.summary } : {}),
    priority: normalizePriority(row.priority),
    metadata,
  }
}

export class SessionMemorySessionStore {
  private readonly db: Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    const hadSessionEventsTable = this.hasSessionEventsTable()
    this.db.exec(SCHEMA_SQL)
    this.ensureCurrentSchema(hadSessionEventsTable)
  }

  close(): void {
    this.db.close()
  }

  captureEvent(input: SessionCaptureInput): string {
    const sessionId = input.sessionId ?? `${input.repoHash}:${input.agentId ?? 'default'}`
    const eventId = input.event.eventId ?? newId('evt')
    const ts = input.event.ts ?? new Date().toISOString()
    const eventType = input.event.eventType
    const priority = normalizePriority(input.event.priority)
    const metadata = normalizeMetadata(input.event.metadata)
    const content = truncateUtf8(input.event.content, DEFAULT_MAX_CAPTURE_BYTES)
    if (content.truncated) metadata.truncated = true
    const metadataJson = safeJsonStringify(metadata)
    this.db
      .prepare<
        [string, string, string, string, string, string, string, string | null, number, string]
      >(
        `INSERT OR REPLACE INTO session_events
           (session_id, event_id, repo_hash, ts, event_type, tool_name, content, summary, priority, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId,
        eventId,
        input.repoHash,
        ts,
        eventType,
        input.event.toolName,
        content.value,
        input.event.summary ?? null,
        priority,
        metadataJson,
      )
    this.db.prepare<[string]>('DELETE FROM session_events_fts WHERE event_id = ?').run(eventId)
    this.db
      .prepare<[string, string, string, string, string]>(
        'INSERT INTO session_events_fts (session_id, event_id, repo_hash, tool_name, content) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        sessionId,
        eventId,
        input.repoHash,
        input.event.toolName,
        ftsContent({
          content: content.value,
          summary: input.event.summary ?? null,
          event_type: eventType,
        }),
      )
    return eventId
  }

  snapshot(input: SnapshotInput): SnapshotResult {
    const started = performance.now()
    const capMs = input.capMs ?? 5000
    const sessionId = input.sessionId ?? `${input.repoHash}:${input.agentId ?? 'default'}`
    const minPriority = input.minPriority ?? Number.MIN_SAFE_INTEGER
    const maxEventBytes = input.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES
    const maxSnapshotBytes = input.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES
    const rows = this.db
      .prepare<[string, string, number], EventRow>(
        `SELECT session_id, event_id, repo_hash, ts, event_type, tool_name, content, summary, priority, metadata_json
         FROM session_events
         WHERE repo_hash = ? AND session_id = ? AND priority >= ?
         ORDER BY priority DESC, ts DESC, event_id ASC`,
      )
      .all(input.repoHash, sessionId, minPriority)
    const included: EventEnvelope[] = []
    const lines: string[] = []
    let usedBytes = 0
    let exhausted = false
    for (const row of rows) {
      if (performance.now() - started >= capMs) {
        exhausted = true
        break
      }
      const line = JSON.stringify(rowToEnvelope(row, maxEventBytes))
      const lineBytes = byteLength(line) + (lines.length > 0 ? 1 : 0)
      if (usedBytes + lineBytes > maxSnapshotBytes) {
        exhausted = true
        break
      }
      included.push(rowToEnvelope(row, maxEventBytes))
      lines.push(line)
      usedBytes += lineBytes
    }
    const status: SnapshotResult['status'] =
      exhausted || included.length < rows.length ? 'partial' : 'complete'
    const content = lines.join('\n')
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
        safeJsonStringify({ events: included, content }),
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
        `SELECT e.session_id, e.event_id, e.repo_hash, e.ts, e.event_type, e.tool_name, e.content, e.summary,
                e.priority, e.metadata_json, bm25(session_events_fts) * -1 AS score
         FROM session_events_fts f
         JOIN session_events e ON e.event_id = f.event_id
         WHERE session_events_fts MATCH ? AND e.repo_hash = ?
         ORDER BY score DESC, e.ts DESC
         LIMIT ?`,
      )
      .all(query, input.repoHash, input.limit ?? 5)
    return rows.map((row) => {
      const envelope = rowToEnvelope(row, DEFAULT_MAX_EVENT_BYTES)
      return {
        ...envelope,
        score: row.score,
      }
    })
  }

  stats(): SessionContinuityStats {
    const eventCount =
      this.db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM session_events').get()
        ?.count ?? 0
    const repoCount =
      this.db
        .prepare<[], { count: number }>(
          'SELECT COUNT(DISTINCT repo_hash) AS count FROM session_events',
        )
        .get()?.count ?? 0
    const sessionCount =
      this.db
        .prepare<[], { count: number }>(
          'SELECT COUNT(DISTINCT session_id) AS count FROM session_events',
        )
        .get()?.count ?? 0
    const snapshotCount =
      this.db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM sessions').get()
        ?.count ?? 0
    return { eventCount, repoCount, sessionCount, snapshotCount }
  }

  purge(options: SessionContinuityPurgeOptions = {}): SessionContinuityPurgeResult {
    const where: string[] = []
    const params: string[] = []
    if (options.repoHash) {
      where.push('repo_hash = ?')
      params.push(options.repoHash)
    }
    if (options.sessionId) {
      where.push('session_id = ?')
      params.push(options.sessionId)
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const eventIds = this.db
      .prepare<string[], { event_id: string }>(
        `SELECT event_id FROM session_events ${whereSql} ORDER BY event_id ASC`,
      )
      .all(...params)
    const matchedEventCount = eventIds.length
    const matchedSnapshotCount = options.sessionId
      ? 0
      : (this.db
          .prepare<string[], { count: number }>(
            `SELECT COUNT(*) AS count FROM sessions ${options.repoHash ? 'WHERE repo_hash = ?' : ''}`,
          )
          .get(...(options.repoHash ? [options.repoHash] : []))?.count ?? 0)
    const dryRun = options.confirm !== true
    const warnings: string[] = []
    if (options.confirm === true && where.length === 0 && options.allowGlobal !== true) {
      warnings.push('global purge requires allowGlobal=true')
      return {
        dryRun: true,
        matchedEventCount,
        deletedEventCount: 0,
        matchedSnapshotCount,
        deletedSnapshotCount: 0,
        warnings,
      }
    }
    if (dryRun || (matchedEventCount === 0 && matchedSnapshotCount === 0)) {
      return {
        dryRun,
        matchedEventCount,
        deletedEventCount: 0,
        matchedSnapshotCount,
        deletedSnapshotCount: 0,
        warnings,
      }
    }

    const tx = this.db.transaction((rawEventIds: unknown) => {
      for (const row of rawEventIds as Array<{ event_id: string }>) {
        this.db
          .prepare<[string]>('DELETE FROM session_events_fts WHERE event_id = ?')
          .run(row.event_id)
        this.db.prepare<[string]>('DELETE FROM session_events WHERE event_id = ?').run(row.event_id)
      }
      if (!options.sessionId) {
        if (options.repoHash) {
          this.db
            .prepare<[string]>('DELETE FROM sessions WHERE repo_hash = ?')
            .run(options.repoHash)
        } else {
          this.db.prepare<[]>('DELETE FROM sessions').run()
        }
      }
    })
    tx(eventIds)
    return {
      dryRun: false,
      matchedEventCount,
      deletedEventCount: matchedEventCount,
      matchedSnapshotCount,
      deletedSnapshotCount: matchedSnapshotCount,
      warnings,
    }
  }

  doctor(): SessionContinuityDoctorResult {
    const warnings: string[] = []
    const quickCheck = this.db.prepare<[], { quick_check: string }>('PRAGMA quick_check').get()
    if (quickCheck?.quick_check !== 'ok') warnings.push('session store quick_check failed')
    const stats = this.stats()
    return {
      ok: warnings.length === 0,
      eventCount: stats.eventCount,
      repoCount: stats.repoCount,
      sessionCount: stats.sessionCount,
      snapshotCount: stats.snapshotCount,
      warnings,
    }
  }

  restoreUnified(input: RestoreInput): SessionMemoryUnifiedResult[] {
    if (input.sourceTypes && !input.sourceTypes.includes('continuity_event')) return []
    const limit = normalizeLimit(input.limit, 5)
    const restored = this.restore({ ...input, limit: Math.max(limit * 2, limit) })
    return dedupeUnifiedResults(
      restored.map((event) => ({
        sourceType: 'continuity_event' as const,
        provenance: {
          kind: 'continuity_event' as const,
          id: event.eventId,
          repoHash: input.repoHash,
          sessionId: event.sessionId,
          eventId: event.eventId,
        },
        dedupeKey: `continuity_event:${input.repoHash}:${event.eventId}`,
        score: event.score,
        tier: 'event_fts' as const,
        timestamp: event.ts,
        preview: unifiedPreview(event.content, normalizeLimit(input.maxPreviewBytes, 1024)),
        metadata: {
          ...event.metadata,
          eventType: event.eventType,
          toolName: event.toolName,
          priority: event.priority,
          ...(event.summary ? { summary: event.summary } : {}),
        },
      })),
      limit,
    )
  }

  private hasSessionEventsTable(): boolean {
    return Boolean(
      this.db
        .prepare<[], { name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_events'",
        )
        .get(),
    )
  }

  private ensureCurrentSchema(hadSessionEventsTable: boolean): void {
    const currentVersion =
      this.db.prepare<[], { user_version: number }>('PRAGMA user_version').get()?.user_version ?? 0
    if (currentVersion >= SESSION_MEMORY_SCHEMA_VERSION) return

    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.assertHardCutSchemaInTransaction(hadSessionEventsTable)
      this.rebuildFtsInTransaction()
      this.db.exec(`PRAGMA user_version = ${SESSION_MEMORY_SCHEMA_VERSION}`)
      this.db.exec('COMMIT')
    } catch (error) {
      if (this.db.inTransaction) this.db.exec('ROLLBACK')
      throw error
    }
  }

  private assertHardCutSchemaInTransaction(hadSessionEventsTable: boolean): void {
    const columns = new Set(
      this.db
        .prepare<[], { name: string }>('PRAGMA table_info(session_events)')
        .all()
        .map((column) => column.name),
    )
    const missingColumns = REQUIRED_EVENT_COLUMNS.filter((column) => !columns.has(column))
    if (hadSessionEventsTable && missingColumns.length > 0) {
      throw new Error(
        `session-memory hard cut requires a fresh typed event schema; missing columns: ${missingColumns.join(', ')}`,
      )
    }
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_session_events_repo_priority_ts ON session_events(repo_hash, priority DESC, ts DESC)',
    )
  }

  private rebuildFtsInTransaction(): void {
    this.db.exec('DELETE FROM session_events_fts')
    const rows = this.db
      .prepare<[], EventRow>(
        `SELECT session_id, event_id, repo_hash, ts, event_type, tool_name, content, summary, priority, metadata_json
         FROM session_events`,
      )
      .all()
    const insert = this.db.prepare<[string, string, string, string, string]>(
      'INSERT INTO session_events_fts (session_id, event_id, repo_hash, tool_name, content) VALUES (?, ?, ?, ?, ?)',
    )
    for (const row of rows) {
      insert.run(row.session_id, row.event_id, row.repo_hash, row.tool_name, ftsContent(row))
    }
  }
}

const NATIVE_SESSIONS_DIR = join(homedir(), '.webpresso', 'sessions')

export function resolveDbPath(repoHash: string, sessionsDir?: string): string {
  return join(sessionsDir ?? NATIVE_SESSIONS_DIR, `${repoHash}.db`)
}

function ensureDbParent(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true })
}

function resolveActiveSessionId(): string {
  return process.env['WP_SESSION_ID'] ?? process.env['CLAUDE_SESSION_ID'] ?? 'unknown'
}

function sessionMemoryCaptureDisabled(): boolean {
  return process.env['WEBPRESSO_SESSION_MEMORY'] === '0'
}

function resolveLatestSnapshotId(
  dbPath: string,
  repoHash: string,
  sessionId: string,
): string | null {
  const db = new Database(dbPath)
  try {
    const scoped = db
      .prepare<[string, string], { snapshot_id: string }>(
        'SELECT snapshot_id FROM sessions WHERE repo_hash = ? AND agent_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
      )
      .get(repoHash, sessionId)
    return scoped?.snapshot_id ?? null
  } finally {
    db.close()
  }
}

export function captureEvent(input: CaptureEventInput, sessionsDir?: string): boolean {
  if (sessionMemoryCaptureDisabled()) return false
  const dbPath = resolveDbPath(input.repoHash, sessionsDir)
  ensureDbParent(dbPath)
  loadNativeSessionMemoryEngine().captureEvent(
    dbPath,
    input.repoHash,
    input.event.sessionId ?? resolveActiveSessionId(),
    randomUUID(),
    input.event.toolName,
    input.event.content,
  )
  return true
}

export function flushCapturedEvents(repoHash: string, sessionsDir?: string): number {
  const dbPath = resolveDbPath(repoHash, sessionsDir)
  ensureDbParent(dbPath)
  const runtime = loadNativeSessionMemoryEngine()
  return runtime.flushEventsForDb ? runtime.flushEventsForDb(dbPath) : runtime.flushEvents()
}

export async function snapshot(
  input: SnapshotInput,
  sessionsDir?: string,
): Promise<SnapshotResult> {
  const dbPath = resolveDbPath(input.repoHash, sessionsDir)
  ensureDbParent(dbPath)
  const sessionId = input.sessionId ?? resolveActiveSessionId()
  const result = loadNativeSessionMemoryEngine().snapshot(
    dbPath,
    input.repoHash,
    sessionId,
    input.capMs ?? 5_000,
  )
  return {
    snapshotId: result.snapshotId,
    sessionId,
    status: result.complete ? 'complete' : 'partial',
    eventCount: result.eventCount,
    content: '',
    eventsIncluded: result.eventCount,
    partial: !result.complete,
  }
}

export function restore(input: RestoreInput, sessionsDir?: string): RestoreResult {
  const dbPath = resolveDbPath(input.repoHash, sessionsDir)
  ensureDbParent(dbPath)
  const sessionId = input.sessionId ?? resolveActiveSessionId()
  if (input.snapshotId) {
    const db = new Database(dbPath)
    try {
      const row = db
        .prepare<[string, string, string], { content_json: string }>(
          'SELECT content_json FROM sessions WHERE snapshot_id = ? AND repo_hash = ? AND agent_id = ? LIMIT 1',
        )
        .get(input.snapshotId, input.repoHash, sessionId)
      if (!row) return { hits: [], snapshotId: null }
      const parsed = JSON.parse(row.content_json) as
        | Array<{ event_id?: string; tool_name?: string; content?: string }>
        | { events?: Array<{ event_id?: string; tool_name?: string; content?: string }> }
      const events = Array.isArray(parsed) ? parsed : (parsed.events ?? [])
      const hits = events
        .map((event, index) => ({
          content: event.content ?? '',
          source: `session:${event.tool_name ?? 'unknown'}`,
          rank: index + 1,
          tier: 'levenshtein' as const,
        }))
        .filter((hit) => hit.content.length > 0)
        .slice(0, input.limit ?? 10)
      return { hits, snapshotId: input.snapshotId }
    } finally {
      db.close()
    }
  }
  const runtime = loadNativeSessionMemoryEngine()
  if (runtime.flushEventsForDb) runtime.flushEventsForDb(dbPath)
  else runtime.flushEvents()
  const hits = runtime
    .restore(dbPath, input.repoHash, sessionId, input.query, input.limit ?? 10)
    .map((event, index) => ({
      content: event.content,
      source: `session:${event.toolName}`,
      rank: index + 1,
      tier: 'levenshtein' as const,
    }))
  return {
    hits,
    snapshotId: resolveLatestSnapshotId(dbPath, input.repoHash, sessionId),
  }
}
