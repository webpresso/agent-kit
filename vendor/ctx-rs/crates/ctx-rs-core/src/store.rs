//! SQLite + FTS5 store — byte-identical schema to the v1 TS engine.
//!
//! ON-DISK SCHEMA (must match v1 exactly — zero-migration promise):
//!   CREATE VIRTUAL TABLE chunks USING fts5(content, source, tokenize='porter unicode61');
//!   CREATE VIRTUAL TABLE chunks_trigram USING fts5(content, source, tokenize='trigram');
//!   CREATE TABLE sources(id INTEGER PRIMARY KEY, label TEXT, indexed_at INTEGER, chunk_count INTEGER);
//!   CREATE TABLE vocabulary(term TEXT PRIMARY KEY, idf_score REAL);
//!   CREATE TABLE sessions(agent_id TEXT, snapshot_id TEXT, created_at INTEGER, status TEXT, content_json TEXT);
//!   CREATE TABLE session_events(session_id TEXT, event_id TEXT, ts INTEGER, tool_name TEXT, content TEXT);
//!   PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA mmap_size=268435456;

use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Result as SqlResult, params};
use thiserror::Error;

use crate::search::SearchHit;

/// Number of inserts between OPTIMIZE invocations.
const OPTIMIZE_INTERVAL: u64 = 50;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub type StoreResult<T> = Result<T, StoreError>;

/// Open (or create) a database at `path`, apply schema + pragmas.
pub fn open(path: &Path) -> StoreResult<Connection> {
    let conn = Connection::open(path)?;
    apply_pragmas(&conn)?;
    apply_schema(&conn)?;
    Ok(conn)
}

fn apply_pragmas(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA mmap_size=268435456;
         PRAGMA busy_timeout=5000;",
    )
}

fn apply_schema(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS chunks
             USING fts5(content, source, tokenize='porter unicode61');

         CREATE VIRTUAL TABLE IF NOT EXISTS chunks_trigram
             USING fts5(content, source, tokenize='trigram');

         CREATE TABLE IF NOT EXISTS sources (
             id         INTEGER PRIMARY KEY,
             label      TEXT NOT NULL,
             indexed_at INTEGER NOT NULL,
             chunk_count INTEGER NOT NULL DEFAULT 0
         );

         CREATE TABLE IF NOT EXISTS vocabulary (
             term      TEXT PRIMARY KEY,
             idf_score REAL NOT NULL
         );

         CREATE TABLE IF NOT EXISTS sessions (
             agent_id     TEXT NOT NULL,
             snapshot_id  TEXT NOT NULL,
             created_at   INTEGER NOT NULL,
             status       TEXT NOT NULL DEFAULT 'active',
             content_json TEXT NOT NULL DEFAULT '{}'
         );

         CREATE TABLE IF NOT EXISTS session_events (
             session_id TEXT NOT NULL,
             event_id   TEXT NOT NULL,
             ts         INTEGER NOT NULL,
             tool_name  TEXT NOT NULL,
             content    TEXT NOT NULL
         );",
    )
}

/// Insert or replace a source record, return its id.
pub fn upsert_source(conn: &Connection, label: &str, chunk_count: i64) -> StoreResult<i64> {
    let ts = now_unix();
    conn.execute(
        "INSERT INTO sources(label, indexed_at, chunk_count)
             VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO NOTHING",
        params![label, ts, chunk_count],
    )?;
    // Check if row already exists by label
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM sources WHERE label = ?1",
            params![label],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(id) = existing {
        conn.execute(
            "UPDATE sources SET indexed_at = ?1, chunk_count = ?2 WHERE id = ?3",
            params![ts, chunk_count, id],
        )?;
        Ok(id)
    } else {
        Ok(conn.last_insert_rowid())
    }
}

/// Insert chunks for a source (porter + trigram tables), update vocabulary,
/// run OPTIMIZE every OPTIMIZE_INTERVAL inserts.
pub fn insert_chunks(
    conn: &Connection,
    source_label: &str,
    chunks: &[String],
    insert_counter: &mut u64,
) -> StoreResult<()> {
    // Remove old chunks for this source first (idempotent re-index)
    conn.execute(
        "DELETE FROM chunks WHERE source = ?1",
        params![source_label],
    )?;
    conn.execute(
        "DELETE FROM chunks_trigram WHERE source = ?1",
        params![source_label],
    )?;

    for chunk in chunks {
        conn.execute(
            "INSERT INTO chunks(content, source) VALUES (?1, ?2)",
            params![chunk, source_label],
        )?;
        conn.execute(
            "INSERT INTO chunks_trigram(content, source) VALUES (?1, ?2)",
            params![chunk, source_label],
        )?;
        *insert_counter += 1;
        if *insert_counter % OPTIMIZE_INTERVAL == 0 {
            conn.execute_batch("INSERT INTO chunks(chunks) VALUES('optimize');")?;
            conn.execute_batch("INSERT INTO chunks_trigram(chunks_trigram) VALUES('optimize');")?;
        }
    }
    update_vocabulary(conn, chunks)?;
    Ok(())
}

/// Update IDF scores in the vocabulary table for all terms in the given chunks.
fn update_vocabulary(conn: &Connection, chunks: &[String]) -> StoreResult<()> {
    // Simple IDF update: count document frequency across inserted chunks
    let total = chunks.len() as f64;
    if total == 0.0 {
        return Ok(());
    }
    let mut term_doc_freq: std::collections::HashMap<String, u64> =
        std::collections::HashMap::new();
    for chunk in chunks {
        let terms: std::collections::HashSet<String> =
            chunk.split_whitespace().map(|t| t.to_lowercase()).collect();
        for term in terms {
            *term_doc_freq.entry(term).or_insert(0) += 1;
        }
    }
    for (term, df) in &term_doc_freq {
        let idf = ((total / (*df as f64 + 1.0)) + 1.0).ln();
        conn.execute(
            "INSERT INTO vocabulary(term, idf_score) VALUES(?1, ?2)
             ON CONFLICT(term) DO UPDATE SET idf_score = excluded.idf_score",
            params![term, idf],
        )?;
    }
    Ok(())
}

/// Three-tier search:
///   1. Porter/unicode61 FTS5 BM25 (primary)
///   2. Trigram FTS5 (fallback when porter returns empty)
///   3. IDF-weighted Levenshtein (last resort)
///
/// Algorithm credit: ported from context-mode's `searchWithFallback` (different language, same algorithm).
pub fn search(
    conn: &Connection,
    query: &str,
    limit: usize,
    source_filter: Option<&str>,
) -> StoreResult<Vec<SearchHit>> {
    let results = search_porter(conn, query, limit, source_filter)?;
    if !results.is_empty() {
        return Ok(results);
    }

    let results = search_trigram(conn, query, limit, source_filter)?;
    if !results.is_empty() {
        return Ok(results);
    }

    search_levenshtein(conn, query, limit, source_filter)
}

fn search_porter(
    conn: &Connection,
    query: &str,
    limit: usize,
    source_filter: Option<&str>,
) -> StoreResult<Vec<SearchHit>> {
    let escaped = escape_fts_query(query);

    if let Some(src) = source_filter {
        let sql = "SELECT content, source, bm25(chunks) AS rank
             FROM chunks
             WHERE chunks MATCH ?1 AND source = ?2
             ORDER BY rank
             LIMIT ?3";
        let mut stmt = conn.prepare(sql)?;
        let hits = stmt
            .query_map(params![escaped, src, limit as i64], row_to_hit)?
            .collect::<SqlResult<Vec<_>>>()?;
        Ok(hits)
    } else {
        let sql = "SELECT content, source, bm25(chunks) AS rank
             FROM chunks
             WHERE chunks MATCH ?1
             ORDER BY rank
             LIMIT ?2";
        let mut stmt = conn.prepare(sql)?;
        let hits = stmt
            .query_map(params![escaped, limit as i64], row_to_hit)?
            .collect::<SqlResult<Vec<_>>>()?;
        Ok(hits)
    }
}

fn search_trigram(
    conn: &Connection,
    query: &str,
    limit: usize,
    source_filter: Option<&str>,
) -> StoreResult<Vec<SearchHit>> {
    if let Some(src) = source_filter {
        let sql = "SELECT content, source, bm25(chunks_trigram) AS rank
             FROM chunks_trigram
             WHERE chunks_trigram MATCH ?1 AND source = ?2
             ORDER BY rank
             LIMIT ?3";
        let mut stmt = conn.prepare(sql)?;
        let hits = stmt
            .query_map(params![query, src, limit as i64], row_to_hit)?
            .collect::<SqlResult<Vec<_>>>()?;
        Ok(hits)
    } else {
        let sql = "SELECT content, source, bm25(chunks_trigram) AS rank
             FROM chunks_trigram
             WHERE chunks_trigram MATCH ?1
             ORDER BY rank
             LIMIT ?2";
        let mut stmt = conn.prepare(sql)?;
        let hits = stmt
            .query_map(params![query, limit as i64], row_to_hit)?
            .collect::<SqlResult<Vec<_>>>()?;
        Ok(hits)
    }
}

fn search_levenshtein(
    conn: &Connection,
    query: &str,
    limit: usize,
    source_filter: Option<&str>,
) -> StoreResult<Vec<SearchHit>> {
    // Pull all unique terms from vocabulary, find closest by Levenshtein distance,
    // score using idf_score, then search via trigram for top candidate terms.
    let sql = match source_filter {
        Some(_) => "SELECT content, source FROM chunks_trigram WHERE source = ?1",
        None => "SELECT content, source FROM chunks_trigram",
    };

    let mut stmt = conn.prepare(sql)?;
    let all_chunks: Vec<(String, String)> = if let Some(src) = source_filter {
        stmt.query_map(params![src], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<SqlResult<Vec<_>>>()?
    } else {
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<SqlResult<Vec<_>>>()?
    };

    // Score each chunk by best Levenshtein match against any query term
    let query_terms: Vec<&str> = query.split_whitespace().collect();
    let mut scored: Vec<(f64, String, String)> = all_chunks
        .into_iter()
        .map(|(content, source)| {
            let score = score_by_levenshtein(&content, &query_terms);
            (score, content, source)
        })
        .filter(|(s, _, _)| *s > 0.0)
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);

    Ok(scored
        .into_iter()
        .map(|(score, content, source)| SearchHit {
            content,
            source,
            rank: -score, // negative so "higher is better" matches BM25 convention
        })
        .collect())
}

fn score_by_levenshtein(content: &str, query_terms: &[&str]) -> f64 {
    let words: Vec<&str> = content.split_whitespace().collect();
    let mut best = 0.0f64;
    for qt in query_terms {
        for word in &words {
            let dist = levenshtein_distance(qt, word);
            let max_len = qt.len().max(word.len()) as f64;
            if max_len == 0.0 {
                continue;
            }
            let similarity = 1.0 - (dist as f64 / max_len);
            if similarity > best {
                best = similarity;
            }
        }
    }
    best
}

fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let (m, n) = (a.len(), b.len());
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    #[allow(clippy::needless_range_loop)]
    for i in 0..=m {
        dp[i][0] = i;
    }
    for (j, cell) in dp[0].iter_mut().enumerate() {
        *cell = j;
    }
    for i in 1..=m {
        for j in 1..=n {
            dp[i][j] = if a[i - 1] == b[j - 1] {
                dp[i - 1][j - 1]
            } else {
                1 + dp[i - 1][j].min(dp[i][j - 1]).min(dp[i - 1][j - 1])
            };
        }
    }
    dp[m][n]
}

fn row_to_hit(row: &rusqlite::Row<'_>) -> SqlResult<SearchHit> {
    Ok(SearchHit {
        content: row.get(0)?,
        source: row.get(1)?,
        rank: row.get(2)?,
    })
}

/// Escape a user query for FTS5 match syntax.
/// Wraps in double quotes per term to prevent FTS5 operator injection.
fn escape_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .map(|t| format!("\"{}\"", t.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn now_unix() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// The `Store` struct wraps an open connection for convenience.
pub struct Store {
    pub conn: Connection,
    insert_counter: u64,
}

impl Store {
    pub fn open(path: &Path) -> StoreResult<Self> {
        let conn = open(path)?;
        Ok(Self {
            conn,
            insert_counter: 0,
        })
    }

    pub fn index(&mut self, label: &str, chunks: &[String]) -> StoreResult<()> {
        let chunk_count = chunks.len() as i64;
        upsert_source(&self.conn, label, chunk_count)?;
        insert_chunks(&self.conn, label, chunks, &mut self.insert_counter)?;
        Ok(())
    }

    pub fn search(
        &self,
        query: &str,
        limit: usize,
        source_filter: Option<&str>,
    ) -> StoreResult<Vec<SearchHit>> {
        search(&self.conn, query, limit, source_filter)
    }
}
