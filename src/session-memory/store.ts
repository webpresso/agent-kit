/**
 * SQLite FTS5 store for session memory.
 *
 * Three-tier search fallback (porter → trigram → IDF-weighted Levenshtein).
 *
 * Schema is intended to be comparable across the independent v1 and v2
 * replacement candidates without changing the public ak_session_* contract.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import type Database from 'better-sqlite3'
import BetterSqlite3 from 'better-sqlite3'

import type { ChunkInsertInput, IndexStats, SearchHit, SearchOptions } from './types.js'
import {
  computeIdfScores,
  DEFAULT_SEARCH_LIMIT,
  escapeFtsPhrase,
  groupChunksBySource,
  levenshtein,
  OPTIMIZE_EVERY,
  SCHEMA_SQL,
  termsForText,
} from './store-shared.js'

export type ISessionStore = {
  insertChunks(chunks: readonly ChunkInsertInput[]): void
  search(options: SearchOptions): readonly SearchHit[]
  stats(): IndexStats
  close(): void
  getDb(): Database.Database
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
    this.db.pragma('busy_timeout = 250')

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
    const deletePorter = this.db.prepare<[string]>('DELETE FROM chunks WHERE source = ?')
    const deleteTrigram = this.db.prepare<[string]>('DELETE FROM chunks_trigram WHERE source = ?')

    const runBatch = this.db.transaction((chunkBatch: readonly ChunkInsertInput[]) => {
      for (const [source, sourceChunks] of groupChunksBySource(chunkBatch)) {
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
   * Mirrors the current context tool search behavior for parity evaluation.
   */
  search(options: SearchOptions): readonly SearchHit[] {
    const limit = options.limit ?? DEFAULT_SEARCH_LIMIT
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
      const ftsQuery = escapeFtsPhrase(query)
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
    } catch (err: unknown) {
      process.stderr.write(
        `[ak-session] searchPorter error: ${err instanceof Error ? err.message : String(err)}\n`,
      )
      return []
    }
  }

  private searchTrigram(query: string, limit: number, source?: string): readonly SearchHit[] {
    try {
      const ftsQuery = escapeFtsPhrase(query)
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
    } catch (err: unknown) {
      process.stderr.write(
        `[ak-session] searchTrigram error: ${err instanceof Error ? err.message : String(err)}\n`,
      )
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
    const terms = [...termsForText(query)]
    const idfMap = new Map<string, number>()
    for (const term of terms) {
      const row = this.db.prepare('SELECT idf_score FROM vocabulary WHERE term = ?').get(term) as
        | { idf_score: number }
        | undefined
      idfMap.set(term, row?.idf_score ?? 1.0)
    }

    const scored = candidates.map((c) => {
      const words = termsForText(c.content)
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
      const rows = this.db.prepare('SELECT content FROM chunks LIMIT 2000').all() as Array<{
        content: string
      }>
      const n = rows.length
      if (n === 0) return

      const idfScores = computeIdfScores(rows.map((row) => row.content))

      const upsert = this.db.prepare<[string, number]>(
        'INSERT INTO vocabulary(term, idf_score) VALUES(?, ?) ON CONFLICT(term) DO UPDATE SET idf_score=excluded.idf_score',
      )
      const batch = this.db.transaction(() => {
        for (const [term, idf] of idfScores) {
          upsert.run(term, idf)
        }
      })
      batch()
    } catch (err: unknown) {
      process.stderr.write(
        `[ak-session] updateVocabulary error: ${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
  }
}

// ── Store registry (one instance per db path) ────────────────────────────────

const registry = new Map<string, ISessionStore>()

type BunSqliteStoreConstructor = new (dbPath: string) => ISessionStore

function createBunStore(dbPath: string): ISessionStore {
  if (!('Bun' in globalThis)) {
    throw new Error('AK_SESSION_ENGINE=bun requires the Bun runtime')
  }
  const load = new Function('specifier', 'return require(specifier)') as (specifier: string) => {
    BunSqliteStore: BunSqliteStoreConstructor
  }
  const { BunSqliteStore } = load('./bun-store.js')
  return new BunSqliteStore(dbPath)
}

export function getStore(dbPath: string): ISessionStore {
  const existing = registry.get(dbPath)
  if (existing) return existing
  const engine = process.env['AK_SESSION_ENGINE']
  const store: ISessionStore = engine === 'bun' ? createBunStore(dbPath) : new SessionStore(dbPath)
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
