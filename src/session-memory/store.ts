/**
 * SQLite FTS5 store for session memory — v2 with ctx-rs backend.
 *
 * Three-tier search fallback (porter → trigram → IDF-weighted Levenshtein).
 *
 * Backend selection:
 *   AK_SESSION_ENGINE=ctx-rs (default) → @webpresso/ctx-rs Rust FFI
 *   AK_SESSION_ENGINE=ts               → better-sqlite3 TS engine (v1 fallback)
 *
 * Schema is identical between v1 and v2 — zero-migration promise.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import type { ChunkInsertInput, SearchHit, SearchOptions } from './types.js'
import { isUnavailable } from './types.js'
import { resolveBackend, tryLoadCtxRsSync } from './backend.js'

const DEFAULT_LIMIT = 5

// ── ctx-rs backend (v2 default) ───────────────────────────────────────────────

class CtxRsStore {
  private readonly dbPath: string
  private readonly ctxRs: typeof import('@webpresso/ctx-rs')

  constructor(dbPath: string, ctxRs: typeof import('@webpresso/ctx-rs')) {
    mkdirSync(dirname(dbPath), { recursive: true })
    this.dbPath = dbPath
    this.ctxRs = ctxRs
  }

  insertChunks(chunks: readonly ChunkInsertInput[]): void {
    for (const chunk of chunks) {
      const result = this.ctxRs.index(this.dbPath, chunk.source, chunk.content, false)
      if (isUnavailable(result)) {
        throw new Error('ctx-rs: unavailable during insertChunks')
      }
    }
  }

  search(opts: SearchOptions): readonly SearchHit[] {
    const result = this.ctxRs.search(
      this.dbPath,
      opts.query,
      opts.limit ?? DEFAULT_LIMIT,
      opts.source ?? null,
    )
    if (isUnavailable(result)) {
      return []
    }
    // ctx-rs returns Array<{content, source, rank}> — add tier annotation
    return (result as Array<{ content: string; source: string; rank: number }>).map((h) => ({
      content: h.content,
      source: h.source,
      rank: h.rank,
      tier: 'porter' as const, // BM25 is porter-primary; ctx-rs doesn't expose tier
    }))
  }

  getDbPath(): string {
    return this.dbPath
  }
}

// ── TS backend (v1 fallback) ──────────────────────────────────────────────────

// Lazy import of better-sqlite3 so it's not required when ctx-rs is active.
type BetterSqlite3Module = typeof import('better-sqlite3')
type BetterSqlite3Database = InstanceType<BetterSqlite3Module['default']>

const SCHEMA_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
    content,
    source,
    tokenize='porter unicode61'
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_trigram USING fts5(
    content,
    source,
    tokenize='trigram'
  );
  CREATE TABLE IF NOT EXISTS sources(
    id          INTEGER PRIMARY KEY,
    label       TEXT    UNIQUE NOT NULL,
    indexed_at  INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS vocabulary(
    term      TEXT PRIMARY KEY,
    idf_score REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions(
    agent_id     TEXT NOT NULL,
    snapshot_id  TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    status       TEXT NOT NULL,
    content_json TEXT NOT NULL,
    PRIMARY KEY (agent_id, snapshot_id)
  );
  CREATE TABLE IF NOT EXISTS session_events(
    session_id TEXT    NOT NULL,
    event_id   TEXT    NOT NULL,
    ts         INTEGER NOT NULL,
    tool_name  TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    PRIMARY KEY (session_id, event_id)
  );
`

class TsStore {
  private readonly db: BetterSqlite3Database
  private insertCount = 0

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3') as BetterSqlite3Module
    this.db = new BetterSqlite3.default(dbPath)
    this.db.pragma('journal_mode=WAL')
    this.db.pragma('synchronous=NORMAL')
    this.db.pragma(`mmap_size=${256 * 1024 * 1024}`)
    this.db.exec(SCHEMA_SQL)
  }

  getDb(): BetterSqlite3Database {
    return this.db
  }

  insertChunks(chunks: readonly ChunkInsertInput[]): void {
    const OPTIMIZE_EVERY = 50
    const insertChunk = this.db.prepare<[string, string]>(
      'INSERT INTO chunks(content, source) VALUES (?, ?)',
    )
    const insertTrigram = this.db.prepare<[string, string]>(
      'INSERT INTO chunks_trigram(content, source) VALUES (?, ?)',
    )

    const insert = this.db.transaction((items: readonly ChunkInsertInput[]) => {
      for (const c of items) {
        insertChunk.run(c.content, c.source)
        insertTrigram.run(c.content, c.source)
        this.insertCount++
        if (this.insertCount % OPTIMIZE_EVERY === 0) {
          this.db.exec("INSERT INTO chunks(chunks) VALUES('optimize')")
          this.db.exec("INSERT INTO chunks_trigram(chunks_trigram) VALUES('optimize')")
        }
      }
    })
    insert(chunks)
  }

  search(opts: SearchOptions): readonly SearchHit[] {
    const limit = opts.limit ?? DEFAULT_LIMIT
    const porter = this.searchPorter(opts.query, limit, opts.source)
    if (porter.length > 0) return porter
    const trigram = this.searchTrigram(opts.query, limit, opts.source)
    if (trigram.length > 0) return trigram
    return this.searchLevenshtein(opts.query, limit, opts.source)
  }

  private searchPorter(query: string, limit: number, source?: string): readonly SearchHit[] {
    try {
      const ftsQuery = `"${query.replace(/"/g, '""')}"`
      const sql = source
        ? 'SELECT content, source, rank FROM chunks WHERE source = ? AND chunks MATCH ? ORDER BY rank LIMIT ?'
        : 'SELECT content, source, rank FROM chunks WHERE chunks MATCH ? ORDER BY rank LIMIT ?'
      const rows = source
        ? (this.db.prepare(sql).all(source, ftsQuery, limit) as Array<{
            content: string
            source: string
            rank: number
          }>)
        : (this.db.prepare(sql).all(ftsQuery, limit) as Array<{
            content: string
            source: string
            rank: number
          }>)
      return rows.map((r) => ({ ...r, tier: 'porter' as const }))
    } catch {
      return []
    }
  }

  private searchTrigram(query: string, limit: number, source?: string): readonly SearchHit[] {
    try {
      const ftsQuery = `"${query.replace(/"/g, '""')}"`
      const sql = source
        ? 'SELECT content, source, rank FROM chunks_trigram WHERE source = ? AND chunks_trigram MATCH ? ORDER BY rank LIMIT ?'
        : 'SELECT content, source, rank FROM chunks_trigram WHERE chunks_trigram MATCH ? ORDER BY rank LIMIT ?'
      const rows = source
        ? (this.db.prepare(sql).all(source, ftsQuery, limit) as Array<{
            content: string
            source: string
            rank: number
          }>)
        : (this.db.prepare(sql).all(ftsQuery, limit) as Array<{
            content: string
            source: string
            rank: number
          }>)
      return rows.map((r) => ({ ...r, tier: 'trigram' as const }))
    } catch {
      return []
    }
  }

  private searchLevenshtein(query: string, limit: number, source?: string): readonly SearchHit[] {
    const candidateSql = source
      ? 'SELECT content, source FROM chunks WHERE source = ? LIMIT 500'
      : 'SELECT content, source FROM chunks LIMIT 500'
    const candidates = source
      ? (this.db.prepare(candidateSql).all(source) as Array<{ content: string; source: string }>)
      : (this.db.prepare(candidateSql).all() as Array<{ content: string; source: string }>)

    type WithIdf = { content: string; source: string; rank: number; tier: 'levenshtein' }
    const scored: WithIdf[] = candidates
      .map((c) => {
        const words = c.content.toLowerCase().split(/\s+/)
        const queryWords = query.toLowerCase().split(/\s+/)
        let score = 0
        for (const qw of queryWords) {
          for (const w of words) {
            const dist = levenshtein(qw, w)
            const maxLen = Math.max(qw.length, w.length)
            if (maxLen > 0) {
              const sim = 1 - dist / maxLen
              if (sim > 0.6) score += sim
            }
          }
        }
        return { content: c.content, source: c.source, rank: -score, tier: 'levenshtein' as const }
      })
      .filter((r) => r.rank < 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)

    return scored
  }

  getDbPath(): string {
    return ''
  }
}

// ── Store union type and factory ──────────────────────────────────────────────

export type SessionStore = CtxRsStore | TsStore

const storeCache = new Map<string, SessionStore>()

/**
 * Get or create a SessionStore for the given dbPath.
 * Backend is determined by AK_SESSION_ENGINE env var (default: ctx-rs).
 */
export function getStore(dbPath: string): SessionStore {
  const cached = storeCache.get(dbPath)
  if (cached !== undefined) return cached

  const backend = resolveBackend()
  let store: SessionStore

  if (backend === 'ctx-rs') {
    const ctxRs = tryLoadCtxRsSync()
    if (ctxRs !== null) {
      store = new CtxRsStore(dbPath, ctxRs)
    } else {
      // ctx-rs unavailable — fall back to TS engine silently
      process.stderr.write(
        `ak-session-memory: ctx-rs prebuilt not available, falling back to TS engine\n`,
      )
      store = new TsStore(dbPath)
    }
  } else {
    store = new TsStore(dbPath)
  }

  storeCache.set(dbPath, store)
  return store
}

// ── Levenshtein (used by TsStore) ────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const row: number[] = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = i
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1]! : Math.min(row[j - 1]!, row[j]!, prev) + 1
      row[j - 1] = prev
      prev = val
    }
    row[b.length] = prev
  }
  return row[b.length]!
}
