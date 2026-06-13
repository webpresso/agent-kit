import type { ChunkInsertInput } from './types.js'

export const OPTIMIZE_EVERY = 50
export const DEFAULT_SEARCH_LIMIT = 5

export const SCHEMA_SQL = `
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

  CREATE INDEX IF NOT EXISTS idx_events_session_ts
    ON session_events(session_id, ts DESC);
`

export function escapeFtsPhrase(query: string): string {
  return `"${query.replace(/"/g, '""')}"`
}

export function levenshtein(a: string, b: string): number {
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

export function groupChunksBySource(
  chunks: readonly ChunkInsertInput[],
): ReadonlyMap<string, readonly ChunkInsertInput[]> {
  const bySource = new Map<string, ChunkInsertInput[]>()
  for (const chunk of chunks) {
    const existing = bySource.get(chunk.source) ?? []
    existing.push(chunk)
    bySource.set(chunk.source, existing)
  }
  return bySource
}

export function termsForText(text: string): readonly string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean)
}

export function computeIdfScores(contents: readonly string[]): ReadonlyMap<string, number> {
  const docCount = contents.length
  const docFrequency = new Map<string, number>()
  for (const content of contents) {
    const terms = new Set(termsForText(content))
    for (const term of terms) {
      docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1)
    }
  }

  const scores = new Map<string, number>()
  for (const [term, freq] of docFrequency) {
    scores.set(term, Math.log((docCount + 1) / (freq + 1)) + 1)
  }
  return scores
}
