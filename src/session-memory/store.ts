import { createHash } from 'node:crypto'

import { Database } from '#db/sqlite.js'

import type {
  IndexedSessionMemoryChunk,
  SessionMemoryChunk,
  SessionMemorySearchOptions,
  SessionMemorySearchResult,
  ChunkInsertInput,
  SearchHit,
  SearchOptions,
  SessionMemoryUnifiedResult,
} from './types.js'
import type { SessionGainEventInput, SessionGainStats, SessionGainToolStats } from './gain-types.js'

type ChunkRow = {
  id: string
  source: string
  text: string
  metadata_json: string
  created_at: string
}

type SearchTier = SessionMemorySearchResult['tier']

export interface SessionMemoryIndexStats {
  chunkCount: number
  sourceCount: number
  sources: string[]
}

export interface SessionMemoryIndexPurgeOptions {
  source?: string
  confirm?: boolean
  allowGlobal?: boolean
}

export interface SessionMemoryIndexPurgeResult {
  dryRun: boolean
  matchedCount: number
  deletedCount: number
  matchedGainEventCount: number
  deletedGainEventCount: number
  source?: string
  warnings: string[]
}

export interface SessionMemoryIndexDoctorResult {
  ok: boolean
  chunkCount: number
  sourceCount: number
  warnings: string[]
}

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
CREATE TABLE IF NOT EXISTS session_memory_gain_events (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  raw_basis_bytes INTEGER NOT NULL,
  returned_tool_result_bytes INTEGER NOT NULL,
  gain_bytes INTEGER NOT NULL,
  approx_tokens_saved INTEGER NOT NULL,
  raw_bytes_basis TEXT NOT NULL,
  precision TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_memory_gain_events_tool
  ON session_memory_gain_events(tool_name);
CREATE INDEX IF NOT EXISTS idx_session_memory_gain_events_created
  ON session_memory_gain_events(created_at);
`

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes < 0 || byteLength(value) <= maxBytes) return value
  let bytes = 0
  let output = ''
  for (const char of value) {
    const charBytes = byteLength(char)
    if (bytes + charBytes > maxBytes) break
    output += char
    bytes += charBytes
  }
  return output
}

function contentFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function normalizeLimit(value: number | undefined, fallback: number, max = 50): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.trunc(value), max)
}

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

function dedupeUnifiedResults(
  results: SessionMemoryUnifiedResult[],
  limit: number,
): SessionMemoryUnifiedResult[] {
  const seen = new Set<string>()
  return results
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.timestamp.localeCompare(b.timestamp) ||
        a.provenance.id.localeCompare(b.provenance.id),
    )
    .filter((result) => {
      if (seen.has(result.dedupeKey)) return false
      seen.add(result.dedupeKey)
      return true
    })
    .slice(0, limit)
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

  searchUnified(options: SessionMemorySearchOptions): SessionMemoryUnifiedResult[] {
    if (options.sourceTypes && !options.sourceTypes.includes('indexed_chunk')) return []
    const limit = normalizeLimit(options.limit, 5)
    const ftsQuery = escapeFtsQuery(options.query)
    if (!ftsQuery) return []
    let raw = this.searchFts('porter', ftsQuery, options.source, Math.max(limit * 2, limit))
    if (raw.length === 0) {
      raw = this.searchFts('trigram', ftsQuery, options.source, Math.max(limit * 2, limit))
    }
    if (raw.length === 0) {
      raw = this.searchLevenshtein(options.query, options.source, Math.max(limit * 2, limit))
    }
    return dedupeUnifiedResults(
      raw.map((result) => this.mapUnifiedResult(result, options.maxPreviewBytes)),
      limit,
    )
  }

  count(): number {
    const row = this.db
      .prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM session_memory_chunks')
      .get()
    return row?.count ?? 0
  }

  stats(): SessionMemoryIndexStats {
    const chunkCount = this.count()
    const sources = this.db
      .prepare<[], { source: string }>(
        'SELECT DISTINCT source FROM session_memory_chunks ORDER BY source ASC',
      )
      .all()
      .map((row) => row.source)
    return { chunkCount, sourceCount: sources.length, sources }
  }

  recordGainEvent(event: SessionGainEventInput): string {
    const createdAt = event.createdAt ?? new Date().toISOString()
    const baseId = createHash('sha256')
      .update(event.toolName)
      .update('\0')
      .update(createdAt)
      .update('\0')
      .update(String(event.rawBasisBytes))
      .update('\0')
      .update(String(event.returnedToolResultBytes))
      .update('\0')
      .update(String(event.gainBytes))
      .update('\0')
      .update(String(event.approxTokensSaved))
      .update('\0')
      .update(event.rawBytesBasis)
      .update('\0')
      .update(event.precision)
      .digest('hex')
      .slice(0, 32)
    const insert = this.db.prepare<
      [string, string, number, number, number, number, string, string, string]
    >(
      `INSERT OR IGNORE INTO session_memory_gain_events
         (id, tool_name, raw_basis_bytes, returned_tool_result_bytes, gain_bytes,
          approx_tokens_saved, raw_bytes_basis, precision, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (let suffix = 0; suffix < 1_000; suffix += 1) {
      const id = suffix === 0 ? baseId : `${baseId}-${suffix}`
      const result = insert.run(
        id,
        event.toolName,
        event.rawBasisBytes,
        event.returnedToolResultBytes,
        event.gainBytes,
        event.approxTokensSaved,
        event.rawBytesBasis,
        event.precision,
        createdAt,
      )
      if (result.changes > 0) return id
    }
    throw new Error('unable to allocate session gain event id')
  }

  gainStats(): SessionGainStats {
    const totals = this.db
      .prepare<
        [],
        {
          eventCount: number
          rawBasisBytes: number | null
          returnedToolResultBytes: number | null
          gainBytes: number | null
          approxTokensSaved: number | null
        }
      >(
        `SELECT
           COUNT(*) AS eventCount,
           SUM(raw_basis_bytes) AS rawBasisBytes,
           SUM(returned_tool_result_bytes) AS returnedToolResultBytes,
           SUM(gain_bytes) AS gainBytes,
           SUM(approx_tokens_saved) AS approxTokensSaved
         FROM session_memory_gain_events`,
      )
      .get()
    const byTool = this.db
      .prepare<
        [],
        {
          toolName: string
          eventCount: number
          rawBasisBytes: number | null
          returnedToolResultBytes: number | null
          gainBytes: number | null
          approxTokensSaved: number | null
        }
      >(
        `SELECT
           tool_name AS toolName,
           COUNT(*) AS eventCount,
           SUM(raw_basis_bytes) AS rawBasisBytes,
           SUM(returned_tool_result_bytes) AS returnedToolResultBytes,
           SUM(gain_bytes) AS gainBytes,
           SUM(approx_tokens_saved) AS approxTokensSaved
         FROM session_memory_gain_events
         GROUP BY tool_name
         ORDER BY gainBytes DESC, tool_name ASC`,
      )
      .all()
      .map(
        (row): SessionGainToolStats => ({
          toolName: row.toolName,
          eventCount: row.eventCount,
          rawBasisBytes: row.rawBasisBytes ?? 0,
          returnedToolResultBytes: row.returnedToolResultBytes ?? 0,
          gainBytes: row.gainBytes ?? 0,
          approxTokensSaved: row.approxTokensSaved ?? 0,
        }),
      )
    return {
      eventCount: totals?.eventCount ?? 0,
      rawBasisBytes: totals?.rawBasisBytes ?? 0,
      returnedToolResultBytes: totals?.returnedToolResultBytes ?? 0,
      gainBytes: totals?.gainBytes ?? 0,
      approxTokensSaved: totals?.approxTokensSaved ?? 0,
      byTool,
    }
  }

  purge(options: SessionMemoryIndexPurgeOptions = {}): SessionMemoryIndexPurgeResult {
    const ids = options.source
      ? this.db
          .prepare<[string], { id: string }>(
            'SELECT id FROM session_memory_chunks WHERE source = ? ORDER BY id ASC',
          )
          .all(options.source)
      : this.db
          .prepare<[], { id: string }>('SELECT id FROM session_memory_chunks ORDER BY id ASC')
          .all()
    const matchedCount = ids.length
    const matchedGainEventCount = options.source ? 0 : this.gainStats().eventCount
    const dryRun = options.confirm !== true
    const warnings: string[] = []
    if (options.confirm === true && !options.source && options.allowGlobal !== true) {
      warnings.push('global purge requires allowGlobal=true')
      return {
        dryRun: true,
        matchedCount,
        deletedCount: 0,
        matchedGainEventCount,
        deletedGainEventCount: 0,
        warnings,
      }
    }
    if (dryRun || (matchedCount === 0 && matchedGainEventCount === 0)) {
      return {
        dryRun,
        matchedCount,
        deletedCount: 0,
        matchedGainEventCount,
        deletedGainEventCount: 0,
        ...(options.source ? { source: options.source } : {}),
        warnings,
      }
    }

    const tx = this.db.transaction((rawIds: unknown) => {
      for (const row of rawIds as Array<{ id: string }>) {
        this.db.prepare<[string]>('DELETE FROM session_memory_chunks_fts WHERE id = ?').run(row.id)
        this.db.prepare<[string]>('DELETE FROM session_memory_chunks_tri WHERE id = ?').run(row.id)
        this.db.prepare<[string]>('DELETE FROM session_memory_chunks WHERE id = ?').run(row.id)
      }
      if (!options.source) {
        this.db.prepare('DELETE FROM session_memory_gain_events').run()
      }
    })
    tx(ids)
    return {
      dryRun: false,
      matchedCount,
      deletedCount: matchedCount,
      matchedGainEventCount,
      deletedGainEventCount: options.source ? 0 : matchedGainEventCount,
      ...(options.source ? { source: options.source } : {}),
      warnings,
    }
  }

  doctor(): SessionMemoryIndexDoctorResult {
    const warnings: string[] = []
    const quickCheck = this.db.prepare<[], { quick_check: string }>('PRAGMA quick_check').get()
    if (quickCheck?.quick_check !== 'ok') warnings.push('index store quick_check failed')
    const stats = this.stats()
    return {
      ok: warnings.length === 0,
      chunkCount: stats.chunkCount,
      sourceCount: stats.sourceCount,
      warnings,
    }
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
    const cappedLimit = normalizeLimit(limit, 5, 50)
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
      .slice(0, cappedLimit)
      .map((item) => this.mapResult(item.row, item.score, 'levenshtein'))
  }

  private mapUnifiedResult(
    result: SessionMemorySearchResult,
    maxPreviewBytes: number | undefined,
  ): SessionMemoryUnifiedResult {
    const dedupeKey = `indexed_chunk:${result.source}:${contentFingerprint(result.text)}`
    return {
      sourceType: 'indexed_chunk',
      provenance: { kind: 'indexed_chunk', id: result.id, source: result.source },
      dedupeKey,
      score: result.score,
      tier:
        result.tier === 'porter'
          ? 'chunk_porter'
          : result.tier === 'trigram'
            ? 'chunk_trigram'
            : 'chunk_levenshtein',
      timestamp: result.createdAt,
      preview: truncateUtf8(result.text, normalizeLimit(maxPreviewBytes, 1024)),
      metadata: result.metadata,
    }
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

const DEFAULT_SEARCH_LIMIT = 5

export interface SessionStore {
  insertChunks(chunks: readonly ChunkInsertInput[]): void
  search(options: SearchOptions): readonly SearchHit[]
  getDbPath(): string
}

class LocalSessionStore implements SessionStore {
  private readonly store: SessionMemoryStore
  private insertedChunkCount = 0

  constructor(private readonly dbPath: string) {
    this.store = new SessionMemoryStore(dbPath)
  }

  insertChunks(chunks: readonly ChunkInsertInput[]): void {
    for (const chunk of chunks) {
      const sequence = this.insertedChunkCount
      this.insertedChunkCount += 1
      const id = createHash('sha256')
        .update(chunk.source)
        .update('\0')
        .update(String(sequence))
        .update('\0')
        .update(chunk.content)
        .digest('hex')
        .slice(0, 32)
      this.store.indexChunk({
        id: `chunk:${id}`,
        source: chunk.source,
        text: chunk.content,
        metadata: { kind: 'session_memory_chunk', sequence },
      })
    }
  }

  search(options: SearchOptions): readonly SearchHit[] {
    if (options.query.trim().length === 0) return []
    return this.store
      .search({
        query: options.query,
        limit: options.limit ?? DEFAULT_SEARCH_LIMIT,
        source: options.source,
      })
      .filter((hit) => (options.source ? hit.source === options.source : true))
      .map((hit, index) => ({
        content: hit.text,
        source: hit.source,
        rank: index + 1,
        tier: hit.tier,
      }))
  }

  close(): void {
    this.store.close()
  }

  getDbPath(): string {
    return this.dbPath
  }
}

const storeCache = new Map<string, SessionStore>()

export function getStore(dbPath: string): SessionStore {
  const cached = storeCache.get(dbPath)
  if (cached !== undefined) return cached
  const store = new LocalSessionStore(dbPath)
  storeCache.set(dbPath, store)
  return store
}

export function resetStoreCacheForTests(): void {
  for (const store of storeCache.values()) {
    if ('close' in store && typeof store.close === 'function') store.close()
  }
  storeCache.clear()
}
