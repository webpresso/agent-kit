//! SQLite + FTS5 store for the native session-memory engine.
//!
//! ON-DISK SCHEMA:
//!   CREATE VIRTUAL TABLE chunks USING fts5(content, source, tokenize='porter unicode61');
//!   CREATE VIRTUAL TABLE chunks_trigram USING fts5(content, source, tokenize='trigram');
//!   CREATE TABLE sources(id INTEGER PRIMARY KEY, label TEXT UNIQUE, indexed_at INTEGER, chunk_count INTEGER);
//!   CREATE TABLE vocabulary(term TEXT PRIMARY KEY, idf_score REAL);
//!   CREATE TABLE sessions(agent_id TEXT, snapshot_id TEXT PRIMARY KEY, repo_hash TEXT, created_at INTEGER, status TEXT, content_json TEXT);
//!   CREATE TABLE session_events(session_id TEXT, event_id TEXT PRIMARY KEY, repo_hash TEXT, ts INTEGER, event_type TEXT, tool_name TEXT, content TEXT, summary TEXT, priority INTEGER, metadata_json TEXT);
//!   CREATE VIRTUAL TABLE session_events_fts USING fts5(session_id UNINDEXED, event_id UNINDEXED, repo_hash UNINDEXED, tool_name UNINDEXED, content, tokenize='porter');
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
    #[error("Schema error: {0}")]
    Schema(String),
}

pub type StoreResult<T> = Result<T, StoreError>;

/// Open (or create) a database at `path`, apply schema + pragmas.
pub fn open(path: &Path) -> StoreResult<Connection> {
    let conn = Connection::open(path)?;
    apply_pragmas(&conn)?;
    let had_session_events_table = table_exists(&conn, "session_events")?;
    reject_legacy_flat_session_schema(&conn, had_session_events_table)?;
    apply_schema(&conn)?;
    ensure_current_session_schema(&conn, had_session_events_table)?;
    migrate_legacy_time_columns(&conn)?;
    migrate_legacy_chunk_tables(&conn)?;
    Ok(conn)
}

fn table_exists(conn: &Connection, table_name: &str) -> SqlResult<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?1)",
        params![table_name],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value != 0)
}

fn reject_legacy_flat_session_schema(
    conn: &Connection,
    had_session_events_table: bool,
) -> StoreResult<()> {
    if !had_session_events_table {
        return Ok(());
    }
    let columns: std::collections::HashSet<String> = conn
        .prepare("PRAGMA table_info(session_events)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<SqlResult<_>>()?;
    let required = ["event_type", "summary", "priority", "metadata_json"];
    let missing_columns: Vec<&str> = required
        .into_iter()
        .filter(|column| !columns.contains(*column))
        .collect();
    if !missing_columns.is_empty() {
        return Err(StoreError::Schema(format!(
            "session-memory hard cut requires a fresh typed event schema; missing columns: {}",
            missing_columns.join(", ")
        )));
    }
    Ok(())
}

fn ensure_current_session_schema(
    conn: &Connection,
    had_session_events_table: bool,
) -> StoreResult<()> {
    const SESSION_MEMORY_SCHEMA_VERSION: i64 = 2;
    const REQUIRED_EVENT_COLUMNS: &[&str] = &[
        "session_id",
        "event_id",
        "repo_hash",
        "ts",
        "event_type",
        "tool_name",
        "content",
        "summary",
        "priority",
        "metadata_json",
    ];

    let current_version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current_version >= SESSION_MEMORY_SCHEMA_VERSION {
        return Ok(());
    }

    let columns: std::collections::HashSet<String> = conn
        .prepare("PRAGMA table_info(session_events)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<SqlResult<_>>()?;
    let missing_columns: Vec<&str> = REQUIRED_EVENT_COLUMNS
        .iter()
        .copied()
        .filter(|column| !columns.contains(*column))
        .collect();
    if had_session_events_table && !missing_columns.is_empty() {
        return Err(StoreError::Schema(format!(
            "session-memory hard cut requires a fresh typed event schema; missing columns: {}",
            missing_columns.join(", ")
        )));
    }

    rebuild_session_events_fts(conn)?;
    conn.pragma_update(None, "user_version", SESSION_MEMORY_SCHEMA_VERSION)?;
    Ok(())
}

fn rebuild_session_events_fts(conn: &Connection) -> StoreResult<()> {
    conn.execute("DELETE FROM session_events_fts", [])?;
    let rows: Vec<(String, String, String, String, String)> = conn
        .prepare(
            "SELECT session_id, event_id, repo_hash, tool_name,
                    event_type || char(10) || COALESCE(summary || char(10), '') || content
               FROM session_events
              ORDER BY rowid ASC",
        )?
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?
        .collect::<SqlResult<_>>()?;
    for (session_id, event_id, repo_hash, tool_name, content) in rows {
        conn.execute(
            "INSERT INTO session_events_fts(session_id, event_id, repo_hash, tool_name, content)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![session_id, event_id, repo_hash, tool_name, content],
        )?;
    }
    Ok(())
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
             label      TEXT NOT NULL UNIQUE,
             indexed_at INTEGER NOT NULL,
             chunk_count INTEGER NOT NULL DEFAULT 0
         );

         CREATE TABLE IF NOT EXISTS vocabulary (
             term      TEXT PRIMARY KEY,
             idf_score REAL NOT NULL
         );

         CREATE TABLE IF NOT EXISTS sessions (
             agent_id     TEXT NOT NULL,
             snapshot_id  TEXT PRIMARY KEY,
             repo_hash    TEXT NOT NULL,
             created_at   INTEGER NOT NULL,
             status       TEXT NOT NULL DEFAULT 'active',
             content_json TEXT NOT NULL DEFAULT '{}'
         );
         CREATE INDEX IF NOT EXISTS idx_sessions_repo_created
             ON sessions(repo_hash, created_at DESC);

         CREATE TABLE IF NOT EXISTS session_events (
             session_id    TEXT NOT NULL,
             event_id      TEXT PRIMARY KEY,
             repo_hash     TEXT NOT NULL,
             ts            INTEGER NOT NULL,
             event_type    TEXT NOT NULL DEFAULT 'tool_command',
             tool_name     TEXT NOT NULL,
             content       TEXT NOT NULL,
             summary       TEXT,
             priority      INTEGER NOT NULL DEFAULT 50,
             metadata_json TEXT NOT NULL DEFAULT '{}'
         );
         CREATE INDEX IF NOT EXISTS idx_session_events_repo_ts
             ON session_events(repo_hash, ts DESC);
         CREATE INDEX IF NOT EXISTS idx_session_events_repo_priority_ts
             ON session_events(repo_hash, priority DESC, ts DESC);
         CREATE VIRTUAL TABLE IF NOT EXISTS session_events_fts
             USING fts5(session_id UNINDEXED, event_id UNINDEXED, repo_hash UNINDEXED, tool_name UNINDEXED, content, tokenize='porter');

         CREATE TABLE IF NOT EXISTS session_memory_chunks (
             id            TEXT PRIMARY KEY,
             source        TEXT NOT NULL,
             text          TEXT NOT NULL,
             metadata_json TEXT NOT NULL,
             created_at    TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_session_memory_chunks_source
             ON session_memory_chunks(source);
         CREATE VIRTUAL TABLE IF NOT EXISTS session_memory_chunks_fts
             USING fts5(id UNINDEXED, source UNINDEXED, text, tokenize='porter');
         CREATE VIRTUAL TABLE IF NOT EXISTS session_memory_chunks_tri
             USING fts5(id UNINDEXED, source UNINDEXED, text, tokenize='trigram');
         CREATE TABLE IF NOT EXISTS session_memory_gain_events (
             id                         TEXT PRIMARY KEY,
             tool_name                  TEXT NOT NULL,
             raw_basis_bytes            INTEGER NOT NULL,
             returned_tool_result_bytes INTEGER NOT NULL,
             gain_bytes                 INTEGER NOT NULL,
             approx_tokens_saved        INTEGER NOT NULL,
             raw_bytes_basis            TEXT NOT NULL,
             precision                  TEXT NOT NULL,
             created_at                 TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_session_memory_gain_events_tool
             ON session_memory_gain_events(tool_name);
         CREATE INDEX IF NOT EXISTS idx_session_memory_gain_events_created
             ON session_memory_gain_events(created_at);",
    )
}

fn migrate_legacy_time_columns(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "UPDATE session_events
            SET ts = CAST(strftime('%s', ts) AS INTEGER)
          WHERE typeof(ts) = 'text' AND ts GLOB '????-??-??*';

         UPDATE sessions
            SET created_at = CAST(strftime('%s', created_at) AS INTEGER)
          WHERE typeof(created_at) = 'text' AND created_at GLOB '????-??-??*';",
    )
}

fn migrate_legacy_chunk_tables(conn: &Connection) -> StoreResult<()> {
    let legacy_exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='session_memory_chunks'",
        [],
        |row| row.get(0),
    )?;
    if legacy_exists == 0 {
        return Ok(());
    }

    let new_count: i64 = conn.query_row("SELECT COUNT(*) FROM chunks", [], |row| row.get(0))?;
    if new_count > 0 {
        return Ok(());
    }

    let rows: Vec<(String, String)> = conn
        .prepare("SELECT source, text FROM session_memory_chunks ORDER BY created_at ASC")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<SqlResult<Vec<_>>>()?;

    if rows.is_empty() {
        return Ok(());
    }

    let mut source_counts: std::collections::HashMap<String, i64> =
        std::collections::HashMap::new();
    let mut texts: Vec<String> = Vec::with_capacity(rows.len());

    for (source, text) in &rows {
        conn.execute(
            "INSERT INTO chunks(content, source) VALUES (?1, ?2)",
            params![text, source],
        )?;
        conn.execute(
            "INSERT INTO chunks_trigram(content, source) VALUES (?1, ?2)",
            params![text, source],
        )?;
        *source_counts.entry(source.clone()).or_insert(0) += 1;
        texts.push(text.clone());
    }

    let ts = now_unix();
    for (source, chunk_count) in source_counts {
        conn.execute(
            "INSERT INTO sources(label, indexed_at, chunk_count)
                 VALUES (?1, ?2, ?3)
             ON CONFLICT(label) DO UPDATE SET
                 indexed_at = excluded.indexed_at,
                 chunk_count = excluded.chunk_count",
            params![source, ts, chunk_count],
        )?;
    }

    update_vocabulary(conn, &texts)?;
    Ok(())
}

/// Insert or replace a source record, return its id.
pub fn upsert_source(conn: &Connection, label: &str, chunk_count: i64) -> StoreResult<i64> {
    let ts = now_unix();
    conn.execute(
        "INSERT INTO sources(label, indexed_at, chunk_count)
             VALUES (?1, ?2, ?3)
         ON CONFLICT(label) DO UPDATE SET
             indexed_at = excluded.indexed_at,
             chunk_count = excluded.chunk_count",
        params![label, ts, chunk_count],
    )?;
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM sources WHERE label = ?1",
            params![label],
            |r| r.get(0),
        )
        .optional()?;
    Ok(existing.unwrap_or_else(|| conn.last_insert_rowid()))
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
        let current_id = format!("native-index:{source_label}:{}", *insert_counter + 1);
        insert_current_chunk(conn, &current_id, source_label, chunk)?;
        *insert_counter += 1;
        if (*insert_counter).is_multiple_of(OPTIMIZE_INTERVAL) {
            conn.execute_batch("INSERT INTO chunks(chunks) VALUES('optimize');")?;
            conn.execute_batch("INSERT INTO chunks_trigram(chunks_trigram) VALUES('optimize');")?;
        }
    }
    update_vocabulary(conn, chunks)?;
    Ok(())
}

pub fn append_chunk(
    conn: &Connection,
    source_label: &str,
    chunk: &str,
    insert_counter: &mut u64,
) -> StoreResult<()> {
    let ts = now_unix();
    conn.execute(
        "INSERT INTO sources(label, indexed_at, chunk_count)
             VALUES (?1, ?2, 1)
         ON CONFLICT(label) DO UPDATE SET
             indexed_at = excluded.indexed_at,
             chunk_count = sources.chunk_count + 1",
        params![source_label, ts],
    )?;
    conn.execute(
        "INSERT INTO chunks(content, source) VALUES (?1, ?2)",
        params![chunk, source_label],
    )?;
    conn.execute(
        "INSERT INTO chunks_trigram(content, source) VALUES (?1, ?2)",
        params![chunk, source_label],
    )?;
    let current_id = format!("native-command:{source_label}:{}", *insert_counter + 1);
    insert_current_chunk(conn, &current_id, source_label, chunk)?;
    *insert_counter += 1;
    if (*insert_counter).is_multiple_of(OPTIMIZE_INTERVAL) {
        conn.execute_batch("INSERT INTO chunks(chunks) VALUES('optimize');")?;
        conn.execute_batch("INSERT INTO chunks_trigram(chunks_trigram) VALUES('optimize');")?;
    }
    update_vocabulary(conn, &[chunk.to_string()])?;
    Ok(())
}

pub fn clear_source(conn: &Connection, source_label: &str) -> StoreResult<()> {
    conn.execute(
        "DELETE FROM chunks WHERE source = ?1",
        params![source_label],
    )?;
    conn.execute(
        "DELETE FROM chunks_trigram WHERE source = ?1",
        params![source_label],
    )?;
    conn.execute(
        "DELETE FROM sources WHERE label = ?1",
        params![source_label],
    )?;
    conn.execute(
        "DELETE FROM session_memory_chunks_fts WHERE source = ?1",
        params![source_label],
    )?;
    conn.execute(
        "DELETE FROM session_memory_chunks_tri WHERE source = ?1",
        params![source_label],
    )?;
    conn.execute(
        "DELETE FROM session_memory_chunks WHERE source = ?1",
        params![source_label],
    )?;
    Ok(())
}

fn insert_current_chunk(
    conn: &Connection,
    id: &str,
    source_label: &str,
    chunk: &str,
) -> StoreResult<()> {
    let created_at = now_unix().to_string();
    let metadata_json = r#"{"kind":"session_command_output","engine":"native-session-memory"}"#;
    conn.execute(
        "INSERT INTO session_memory_chunks(id, source, text, metadata_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
             source = excluded.source,
             text = excluded.text,
             metadata_json = excluded.metadata_json,
             created_at = excluded.created_at",
        params![id, source_label, chunk, metadata_json, created_at],
    )?;
    conn.execute(
        "DELETE FROM session_memory_chunks_fts WHERE id = ?1",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM session_memory_chunks_tri WHERE id = ?1",
        params![id],
    )?;
    conn.execute(
        "INSERT INTO session_memory_chunks_fts(id, source, text) VALUES (?1, ?2, ?3)",
        params![id, source_label, chunk],
    )?;
    conn.execute(
        "INSERT INTO session_memory_chunks_tri(id, source, text) VALUES (?1, ?2, ?3)",
        params![id, source_label, chunk],
    )?;
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
    let query = query.trim();
    let limit = normalize_search_limit(limit);
    if query.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

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
        if source_filter_matches_entire_store(conn, src)? {
            return search_porter(conn, query, limit, None);
        }

        let sql = "SELECT content, source, bm25(chunks) AS rank
             FROM chunks
             WHERE chunks MATCH ?1 AND source = ?2
             ORDER BY rank ASC, rowid ASC
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
             ORDER BY rank ASC, rowid ASC
             LIMIT ?2";
        let mut stmt = conn.prepare(sql)?;
        let hits = stmt
            .query_map(params![escaped, limit as i64], row_to_hit)?
            .collect::<SqlResult<Vec<_>>>()?;
        Ok(hits)
    }
}

fn source_filter_matches_entire_store(conn: &Connection, source: &str) -> StoreResult<bool> {
    let mut stmt = conn.prepare("SELECT label FROM sources LIMIT 2")?;
    let labels = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(labels.len() == 1 && labels[0] == source)
}

fn search_trigram(
    conn: &Connection,
    query: &str,
    limit: usize,
    source_filter: Option<&str>,
) -> StoreResult<Vec<SearchHit>> {
    let escaped = escape_fts_query(query);

    if let Some(src) = source_filter {
        let sql = "SELECT content, source, bm25(chunks_trigram) AS rank
             FROM chunks_trigram
             WHERE chunks_trigram MATCH ?1 AND source = ?2
             ORDER BY rank ASC, rowid ASC
             LIMIT ?3";
        let mut stmt = conn.prepare(sql)?;
        let hits = stmt
            .query_map(params![escaped, src, limit as i64], |row| {
                Ok(SearchHit {
                    content: row.get(0)?,
                    source: row.get(1)?,
                    rank: row.get(2)?,
                    tier: "trigram".to_string(),
                })
            })?
            .collect::<SqlResult<Vec<_>>>()?;
        Ok(hits)
    } else {
        let sql = "SELECT content, source, bm25(chunks_trigram) AS rank
             FROM chunks_trigram
             WHERE chunks_trigram MATCH ?1
             ORDER BY rank ASC, rowid ASC
             LIMIT ?2";
        let mut stmt = conn.prepare(sql)?;
        let hits = stmt
            .query_map(params![escaped, limit as i64], |row| {
                Ok(SearchHit {
                    content: row.get(0)?,
                    source: row.get(1)?,
                    rank: row.get(2)?,
                    tier: "trigram".to_string(),
                })
            })?
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
    const LEVENSHTEIN_SCAN_CAP: i64 = 1000;
    const MIN_LEVENSHTEIN_SCORE: f64 = 0.60;

    let sql = match source_filter {
        Some(_) => {
            "SELECT rowid, content, source FROM chunks_trigram WHERE source = ?1 ORDER BY rowid ASC LIMIT ?2"
        }
        None => "SELECT rowid, content, source FROM chunks_trigram ORDER BY rowid ASC LIMIT ?1",
    };

    let mut stmt = conn.prepare(sql)?;
    let all_chunks: Vec<(i64, String, String)> = if let Some(src) = source_filter {
        stmt.query_map(params![src, LEVENSHTEIN_SCAN_CAP], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })?
        .collect::<SqlResult<Vec<_>>>()?
    } else {
        stmt.query_map(params![LEVENSHTEIN_SCAN_CAP], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })?
        .collect::<SqlResult<Vec<_>>>()?
    };

    // Score each chunk by best Levenshtein match against any query term.
    let query_terms: Vec<&str> = query.split_whitespace().collect();
    let mut seen = std::collections::HashSet::<(String, String)>::new();
    let mut scored: Vec<(f64, i64, String, String)> = all_chunks
        .into_iter()
        .filter_map(|(rowid, content, source)| {
            let key = (source.clone(), content.clone());
            if !seen.insert(key) {
                return None;
            }
            let score = score_by_levenshtein(&content, &query_terms);
            (score >= MIN_LEVENSHTEIN_SCORE).then_some((score, rowid, content, source))
        })
        .collect();

    scored.sort_by(|a, b| {
        b.0.partial_cmp(&a.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.1.cmp(&b.1))
    });
    scored.truncate(limit);

    Ok(scored
        .into_iter()
        .map(|(score, _, content, source)| SearchHit {
            content,
            source,
            rank: -score, // negative so "higher is better" matches BM25 convention
            tier: "levenshtein".to_string(),
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
        tier: "porter".to_string(),
    })
}

fn normalize_search_limit(limit: usize) -> usize {
    limit.min(50)
}

/// Escape a user query for FTS5 match syntax.
/// Wraps each term in double quotes and doubles embedded quotes to prevent FTS5 operator injection.
fn escape_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .map(|t| format!("\"{}\"", t.replace('"', "\"\"")))
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

    pub fn append(&mut self, label: &str, chunk: &str) -> StoreResult<()> {
        append_chunk(&self.conn, label, chunk, &mut self.insert_counter)
    }

    pub fn clear(&mut self, label: &str) -> StoreResult<()> {
        clear_source(&self.conn, label)
    }
}
