import { Database } from '#db/sqlite.js'

import type {
  IndexedSessionMemoryChunk,
  SessionMemoryChunk,
  SessionMemorySearchOptions,
  SessionMemorySearchResult,
} from './types.js'

type ChunkRow = {
  id: string
  source: string
  text: string
  metadata_json: string
  created_at: string
}

type SearchTier = SessionMemorySearchResult['tier']

// Search fallback uses a three-tier local ranking design:
// porter FTS, then trigram FTS, then IDF-weighted Levenshtein.
const OPTIMIZE_INTERVAL = 50

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS session_memory_chunks (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  text TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_memory_chunks_source
  ON session_memory_chunks(source);
CREATE VIRTUAL TABLE IF NOT EXISTS session_memory_chunks_fts
  USING fts5(id UNINDEXED, source UNINDEXED, text, tokenize='porter');
CREATE VIRTUAL TABLE IF NOT EXISTS session_memory_chunks_tri
  USING fts5(id UNINDEXED, source UNINDEXED, text, tokenize='trigram');
`

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 0)
}

function escapeFtsQuery(query: string): string {
  return tokenize(query)
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(' ')
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost)
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[b.length] ?? 0
}

function parseMetadata(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {}
}

export class SessionMemoryStore {
  private readonly db: Database
  private insertsSinceOptimize = 0

  constructor(dbPath: string | { readonly memory: true }) {
    this.db = new Database(typeof dbPath === 'string' ? dbPath : ':memory:')
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA mmap_size = 268435456')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec(SCHEMA_SQL)
  }

  close(): void {
    this.db.close()
  }

  indexChunk(chunk: SessionMemoryChunk): void {
    const createdAt = chunk.createdAt ?? new Date().toISOString()
    const metadataJson = JSON.stringify(chunk.metadata ?? {})
    this.db
      .prepare<[string, string, string, string, string]>(
        `INSERT INTO session_memory_chunks (id, source, text, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source,
           text = excluded.text,
           metadata_json = excluded.metadata_json,
           created_at = excluded.created_at`,
      )
      .run(chunk.id, chunk.source, chunk.text, metadataJson, createdAt)
    this.db.prepare<[string]>('DELETE FROM session_memory_chunks_fts WHERE id = ?').run(chunk.id)
    this.db.prepare<[string]>('DELETE FROM session_memory_chunks_tri WHERE id = ?').run(chunk.id)
    this.db
      .prepare<[string, string, string]>(
        'INSERT INTO session_memory_chunks_fts (id, source, text) VALUES (?, ?, ?)',
      )
      .run(chunk.id, chunk.source, chunk.text)
    this.db
      .prepare<[string, string, string]>(
        'INSERT INTO session_memory_chunks_tri (id, source, text) VALUES (?, ?, ?)',
      )
      .run(chunk.id, chunk.source, chunk.text)
    this.insertsSinceOptimize += 1
    if (this.insertsSinceOptimize >= OPTIMIZE_INTERVAL) {
      this.db.exec(
        "INSERT INTO session_memory_chunks_fts(session_memory_chunks_fts) VALUES('optimize')",
      )
      this.db.exec(
        "INSERT INTO session_memory_chunks_tri(session_memory_chunks_tri) VALUES('optimize')",
      )
      this.insertsSinceOptimize = 0
    }
  }

  indexChunks(chunks: readonly SessionMemoryChunk[]): void {
    const tx = this.db.transaction((items: unknown) => {
      for (const chunk of items as readonly SessionMemoryChunk[]) this.indexChunk(chunk)
    })
    tx(chunks)
  }

  search(options: SessionMemorySearchOptions): SessionMemorySearchResult[] {
    const limit = options.limit ?? 5
    const ftsQuery = escapeFtsQuery(options.query)
    if (!ftsQuery) return []
    const scoped = this.searchFts('porter', ftsQuery, options.source, limit)
    if (scoped.length > 0) return scoped
    const trigram = this.searchFts('trigram', ftsQuery, options.source, limit)
    if (trigram.length > 0) return trigram
    const fuzzy = this.searchLevenshtein(options.query, options.source, limit)
    if (fuzzy.length > 0) return fuzzy
    return options.source ? this.search({ ...options, source: undefined }) : []
  }

  count(): number {
    const row = this.db
      .prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM session_memory_chunks')
      .get()
    return row?.count ?? 0
  }

  private searchFts(
    tier: Exclude<SearchTier, 'levenshtein'>,
    query: string,
    source: string | undefined,
    limit: number,
  ): SessionMemorySearchResult[] {
    const table = tier === 'porter' ? 'session_memory_chunks_fts' : 'session_memory_chunks_tri'
    const sourceFilter = source ? 'AND c.source = ?' : ''
    const params = source
      ? ([query, source, limit] as [string, string, number])
      : ([query, limit] as [string, number])
    const rows = this.db
      .prepare<typeof params, ChunkRow & { score: number }>(
        `SELECT c.id, c.source, c.text, c.metadata_json, c.created_at, bm25(${table}) * -1 AS score
         FROM ${table} f
         JOIN session_memory_chunks c ON c.id = f.id
         WHERE ${table} MATCH ? ${sourceFilter}
         ORDER BY score DESC
         LIMIT ?`,
      )
      .all(...params)
    return rows.map((row) => this.mapResult(row, row.score, tier))
  }

  private searchLevenshtein(
    query: string,
    source: string | undefined,
    limit: number,
  ): SessionMemorySearchResult[] {
    const rows = source
      ? this.db
          .prepare<[string], ChunkRow>(
            'SELECT id, source, text, metadata_json, created_at FROM session_memory_chunks WHERE source = ?',
          )
          .all(source)
      : this.db
          .prepare<[], ChunkRow>(
            'SELECT id, source, text, metadata_json, created_at FROM session_memory_chunks',
          )
          .all()
    const queryTokens = tokenize(query)
    return rows
      .map((row) => {
        const textTokens = tokenize(row.text)
        const bestDistance = Math.min(
          ...queryTokens.map((needle) =>
            Math.min(...textTokens.map((token) => levenshtein(needle, token))),
          ),
        )
        const idfWeight = 1 + Math.log(1 + rows.length / Math.max(1, textTokens.length))
        return { row, score: idfWeight / (1 + bestDistance) }
      })
      .filter((item) => Number.isFinite(item.score) && item.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => this.mapResult(item.row, item.score, 'levenshtein'))
  }

  private mapResult(row: ChunkRow, score: number, tier: SearchTier): SessionMemorySearchResult {
    const chunk: IndexedSessionMemoryChunk = {
      id: row.id,
      source: row.source,
      text: row.text,
      metadata: parseMetadata(row.metadata_json),
      createdAt: row.created_at,
    }
    return { ...chunk, score, tier }
  }
}
