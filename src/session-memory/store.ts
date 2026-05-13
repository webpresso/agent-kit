/**
 * SQLite FTS5 store for session memory.
 *
 * Three-tier search fallback (porter → trigram → IDF-weighted Levenshtein).
 * Algorithm credit: context-mode (ELv2) — ported to TypeScript, same logic.
 *
 * Schema is forward-compatible with v2 ctx-rs (Rust) engine.
 * Migration v1→v2: swap engine binary, keep .db file — invisible to consumers.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import type Database from 'better-sqlite3'
import BetterSqlite3 from 'better-sqlite3'

import type { ChunkInsertInput, IndexStats, SearchHit, SearchOptions } from './types.js'
import { BunSqliteStore } from './bun-store.js'

const OPTIMIZE_EVERY = 50
const DEFAULT_LIMIT = 5

// ── Schema ───────────────────────────────────────────────────────────────────

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
    id       INTEGER PRIMARY KEY,
    label    TEXT    UNIQUE NOT NULL,
    indexed_at   INTEGER NOT NULL,
    chunk_count  INTEGER NOT NULL DEFAULT 0
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

// ── Levenshtein distance ─────────────────────────────────────────────────────

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

// ── Store class ──────────────────────────────────────────────────────────────

export class SessionStore {
  private readonly db: Database.Database
  private insertCount = 0

  constructor(dbPath: string) {
    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true })

    this.db = new BetterSqlite3(dbPath)

    // Performance pragmas
    this.db.pragma('journal_mode=WAL')
    this.db.pragma('synchronous=NORMAL')
    this.db.pragma(`mmap_size=${256 * 1024 * 1024}`)

    // Initialize schema
    this.db.exec(SCHEMA_SQL)
  }

  /**
   * Insert chunks. Idempotent per source: re-indexing a source removes old chunks
   * and replaces them, so chunk count stays accurate.
   */
  insertChunks(chunks: readonly ChunkInsertInput[]): void {
    const insertPorter = this.db.prepare<[string, string]>(
      'INSERT INTO chunks(content, source) VALUES (?, ?)',
    )
    const insertTrigram = this.db.prepare<[string, string]>(
      'INSERT INTO chunks_trigram(content, source) VALUES (?, ?)',
    )
    const upsertSource = this.db.prepare<[string, number, number]>(
      `INSERT INTO sources(label, indexed_at, chunk_count)
       VALUES (?, ?, ?)
       ON CONFLICT(label) DO UPDATE SET indexed_at=excluded.indexed_at, chunk_count=excluded.chunk_count`,
    )
    const deletePorter = this.db.prepare<[string]>(
      "DELETE FROM chunks WHERE source = ?",
    )
    const deleteTrigram = this.db.prepare<[string]>(
      "DELETE FROM chunks_trigram WHERE source = ?",
    )

    const runBatch = this.db.transaction((chunkBatch: readonly ChunkInsertInput[]) => {
      // Group by source for idempotent re-index
      const bySource = new Map<string, ChunkInsertInput[]>()
      for (const c of chunkBatch) {
        const existing = bySource.get(c.source) ?? []
        existing.push(c)
        bySource.set(c.source, existing)
      }

      for (const [source, sourceChunks] of bySource) {
        // Remove old entries for this source
        deletePorter.run(source)
        deleteTrigram.run(source)

        // Insert new chunks
        for (const chunk of sourceChunks) {
          insertPorter.run(chunk.content, chunk.source)
          insertTrigram.run(chunk.content, chunk.source)
        }

        upsertSource.run(source, Date.now(), sourceChunks.length)
      }
    })

    runBatch(chunks)

    this.insertCount += chunks.length
    if (this.insertCount >= OPTIMIZE_EVERY) {
      this.db.exec("INSERT INTO chunks(chunks) VALUES('optimize')")
      this.insertCount = 0
    }

    // Update vocabulary IDF scores after bulk insert
    this.updateVocabulary()
  }

  /**
   * Three-tier search:
   *   1. Porter FTS5 BM25 (best semantic match)
   *   2. Trigram FTS5 (substring / partial-word match)
   *   3. IDF-weighted Levenshtein (fuzzy fallback for typos)
   *
   * Algorithm credit: context-mode (ELv2) — same algorithm, ported to TypeScript.
   */
  search(options: SearchOptions): readonly SearchHit[] {
    const limit = options.limit ?? DEFAULT_LIMIT
    const { query, source } = options

    // Tier 1: Porter FTS5 BM25
    const porterHits = this.searchPorter(query, limit, source)
    if (porterHits.length > 0) return porterHits

    // Tier 2: Trigram FTS5
    const trigramHits = this.searchTrigram(query, limit, source)
    if (trigramHits.length > 0) return trigramHits

    // Tier 3: IDF-weighted Levenshtein
    return this.searchLevenshtein(query, limit, source)
  }

  stats(): IndexStats {
    const chunkCount = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as { cnt: number }
    ).cnt
    const sourceCount = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM sources').get() as { cnt: number }
    ).cnt
    return { chunkCount, sourceCount }
  }

  close(): void {
    this.db.close()
  }

  /** Expose the raw database for session operations (session.ts uses it). */
  getDb(): Database.Database {
    return this.db
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private searchPorter(query: string, limit: number, source?: string): readonly SearchHit[] {
    try {
      // Escape FTS5 query — wrap in quotes to handle special chars
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
      // FTS5 syntax error or empty result — fall through to trigram
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
    // IDF-weighted Levenshtein: score candidates by edit distance then weight by IDF
    const candidateSql = source
      ? 'SELECT content, source FROM chunks WHERE source = ? LIMIT 500'
      : 'SELECT content, source FROM chunks LIMIT 500'
    const candidates = source
      ? (this.db.prepare(candidateSql).all(source) as Array<{
          content: string
          source: string
        }>)
      : (this.db.prepare(candidateSql).all() as Array<{ content: string; source: string }>)

    if (candidates.length === 0) return []

    // Fetch IDF scores for query terms
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const idfMap = new Map<string, number>()
    for (const term of terms) {
      const row = this.db
        .prepare('SELECT idf_score FROM vocabulary WHERE term = ?')
        .get(term) as { idf_score: number } | undefined
      idfMap.set(term, row?.idf_score ?? 1.0)
    }

    const scored = candidates.map((c) => {
      const words = c.content.toLowerCase().split(/\s+/).filter(Boolean)
      // Minimum Levenshtein distance between query and any word in content
      let minDist = Infinity
      let idfWeight = 1.0
      for (const term of terms) {
        for (const word of words) {
          const dist = levenshtein(term, word)
          if (dist < minDist) {
            minDist = dist
            idfWeight = idfMap.get(term) ?? 1.0
          }
        }
      }
      // Lower distance + higher IDF = better score (negative for rank convention)
      const score = minDist === Infinity ? Infinity : minDist / idfWeight
      return { content: c.content, source: c.source, rank: score, tier: 'levenshtein' as const }
    })

    return scored
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)
      .filter((h) => h.rank < Infinity)
  }

  private updateVocabulary(): void {
    // Compute IDF scores: log(N / df) where N = total docs, df = docs containing term
    // Simplified: use FTS5 term statistics via content scan (vocabulary is best-effort)
    try {
      const rows = this.db
        .prepare('SELECT content FROM chunks LIMIT 2000')
        .all() as Array<{ content: string }>
      const n = rows.length
      if (n === 0) return

      const df = new Map<string, number>()
      for (const row of rows) {
        const terms = new Set(row.content.toLowerCase().split(/\s+/).filter(Boolean))
        for (const term of terms) {
          df.set(term, (df.get(term) ?? 0) + 1)
        }
      }

      const upsert = this.db.prepare<[string, number]>(
        'INSERT INTO vocabulary(term, idf_score) VALUES(?, ?) ON CONFLICT(term) DO UPDATE SET idf_score=excluded.idf_score',
      )
      const batch = this.db.transaction(() => {
        for (const [term, docFreq] of df) {
          const idf = Math.log((n + 1) / (docFreq + 1)) + 1
          upsert.run(term, idf)
        }
      })
      batch()
    } catch {
      // Vocabulary update is best-effort; never block on failure
    }
  }
}

// ── Store registry (one instance per db path) ────────────────────────────────

const registry = new Map<string, SessionStore>()

export function getStore(dbPath: string): SessionStore {
  const existing = registry.get(dbPath)
  if (existing) return existing
  const engine = process.env['AK_SESSION_ENGINE']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store: SessionStore = engine === 'bun' ? (new BunSqliteStore(dbPath) as any) : new SessionStore(dbPath)
  registry.set(dbPath, store)
  return store
}

export function closeStore(dbPath: string): void {
  const store = registry.get(dbPath)
  if (store) {
    store.close()
    registry.delete(dbPath)
  }
}
