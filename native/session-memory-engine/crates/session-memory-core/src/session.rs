//! Session capture, snapshot, and restore primitives.
//!
//! Schema:
//!   sessions(agent_id TEXT, snapshot_id TEXT, created_at INTEGER, status TEXT, content_json TEXT)
//!   session_events(session_id TEXT, event_id TEXT, ts INTEGER, tool_name TEXT, content TEXT)

use std::path::Path;
use std::time::{Duration, Instant};

use rusqlite::{Connection, Result as SqlResult, params};
use thiserror::Error;

use crate::search::SearchHit;
use crate::store::{StoreError, StoreResult, now_unix, open, search};

#[derive(Debug, Error)]
pub enum SessionError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Store error: {0}")]
    Store(#[from] StoreError),
}

pub type SessionResult<T> = Result<T, SessionError>;

/// A single session event returned from restore.
#[derive(Debug, Clone)]
pub struct EventHit {
    pub session_id: String,
    pub event_id: String,
    pub ts: i64,
    pub tool_name: String,
    pub content: String,
}

/// Result of a snapshot operation.
#[derive(Debug, Clone)]
pub struct SnapshotResult {
    pub snapshot_id: String,
    pub event_count: usize,
    /// True if the snapshot was created within the time cap; false if it timed out (partial).
    pub complete: bool,
}

/// Capture a single tool event to the session log. Target: <0.5ms sync write.
pub fn capture_event(
    conn: &Connection,
    repo_hash: &str,
    session_id: &str,
    event_id: &str,
    tool_name: &str,
    content: &str,
) -> SessionResult<()> {
    let ts = now_unix();
    let inserted = conn.execute(
        "INSERT OR IGNORE INTO session_events(
             session_id, event_id, repo_hash, ts, event_type, tool_name, content, summary, priority, metadata_json
         )
         VALUES(?1, ?2, ?3, ?4, 'tool_command', ?5, ?6, NULL, 50, '{}')",
        params![session_id, event_id, repo_hash, ts, tool_name, content],
    )?;
    if inserted == 0 {
        conn.execute(
            "UPDATE session_events
                SET session_id = ?1, repo_hash = ?3, ts = ?4, event_type = 'tool_command',
                    tool_name = ?5, content = ?6, summary = NULL, priority = 50, metadata_json = '{}'
              WHERE event_id = ?2",
            params![session_id, event_id, repo_hash, ts, tool_name, content],
        )?;
        conn.execute(
            "DELETE FROM session_events_fts WHERE event_id = ?1",
            params![event_id],
        )?;
    }
    conn.execute(
        "INSERT INTO session_events_fts(session_id, event_id, repo_hash, tool_name, content)
         VALUES(?1, ?2, ?3, ?4, ?5)",
        params![
            session_id,
            event_id,
            repo_hash,
            tool_name,
            format!("tool_command\n{content}")
        ],
    )?;
    Ok(())
}

/// Consolidate pending events for `agent_id` into a snapshot row.
///
/// `cap_ms`: maximum milliseconds allowed; if exceeded, returns partial gracefully.
pub fn snapshot(
    conn: &Connection,
    repo_hash: &str,
    agent_id: &str,
    cap_ms: u64,
) -> SessionResult<SnapshotResult> {
    let deadline = Instant::now() + Duration::from_millis(cap_ms);

    let mut stmt = conn.prepare(
        "SELECT event_id, tool_name, content FROM session_events
         WHERE repo_hash = ?1 AND session_id = ?2
         ORDER BY ts ASC, rowid ASC",
    )?;
    let mut rows = stmt.query(params![repo_hash, agent_id])?;

    let snapshot_id = new_snapshot_id(conn)?;
    let created_at = now_unix();

    // Stream rows straight into JSON so the cap is honored while rows are
    // consumed and the hot path does not allocate a second JSON value graph.
    let mut content_json = Vec::with_capacity(1024);
    content_json.push(b'[');
    let mut event_count = 0usize;
    let mut complete = true;
    loop {
        if Instant::now() >= deadline {
            complete = false;
            break;
        }

        let Some(row) = rows.next()? else {
            break;
        };

        let event_id: String = row.get(0)?;
        let tool_name: String = row.get(1)?;
        let content: String = row.get(2)?;
        append_snapshot_event_json(
            &mut content_json,
            event_count,
            &event_id,
            &tool_name,
            &content,
        )
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        event_count += 1;
    }
    content_json.push(b']');

    let content_json = String::from_utf8(content_json)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    conn.execute(
        "INSERT INTO sessions(agent_id, snapshot_id, repo_hash, created_at, status, content_json)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            agent_id,
            snapshot_id,
            repo_hash,
            created_at,
            if complete { "complete" } else { "partial" },
            content_json
        ],
    )?;

    Ok(SnapshotResult {
        snapshot_id,
        event_count,
        complete,
    })
}

fn append_snapshot_event_json(
    buffer: &mut Vec<u8>,
    index: usize,
    event_id: &str,
    tool_name: &str,
    content: &str,
) -> Result<(), serde_json::Error> {
    if index > 0 {
        buffer.push(b',');
    }
    buffer.extend_from_slice(br#"{"event_id":"#);
    serde_json::to_writer(&mut *buffer, event_id)?;
    buffer.extend_from_slice(br#","tool_name":"#);
    serde_json::to_writer(&mut *buffer, tool_name)?;
    buffer.extend_from_slice(br#","content":"#);
    serde_json::to_writer(&mut *buffer, content)?;
    buffer.push(b'}');
    Ok(())
}

/// Restore recent session events for `agent_id` matching `query`.
/// Returns top-k events ordered by relevance.
pub fn restore(
    conn: &Connection,
    repo_hash: &str,
    agent_id: &str,
    query: &str,
    limit: usize,
) -> SessionResult<Vec<EventHit>> {
    // Get all events for this agent, most recent first
    let mut stmt = conn.prepare(
        "SELECT session_id, event_id, ts, tool_name, content
         FROM session_events
         WHERE repo_hash = ?1 AND session_id = ?2
         ORDER BY ts DESC, rowid DESC
         LIMIT 500",
    )?;
    let events: Vec<EventHit> = stmt
        .query_map(params![repo_hash, agent_id], |r| {
            Ok(EventHit {
                session_id: r.get(0)?,
                event_id: r.get(1)?,
                ts: r.get(2)?,
                tool_name: r.get(3)?,
                content: r.get(4)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;

    if query.is_empty() {
        return Ok(events.into_iter().take(limit).collect());
    }

    // Score events by content relevance to query using a cheap exact-token fast path
    // before bounded fuzzy matching.
    let query_terms: Vec<&str> = query.split_whitespace().collect();
    let query_terms_lower: Vec<String> =
        query_terms.iter().map(|term| term.to_lowercase()).collect();
    let mut scored: Vec<(f64, EventHit)> = events
        .into_iter()
        .map(|ev| {
            let score = score_content(&ev.content, &query_terms_lower);
            (score, ev)
        })
        .filter(|(score, _)| *score > 0.0)
        .collect();

    scored.sort_by(|a, b| {
        b.0.partial_cmp(&a.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.1.ts.cmp(&a.1.ts))
            .then_with(|| a.1.event_id.cmp(&b.1.event_id))
    });
    scored.truncate(limit);

    Ok(scored.into_iter().map(|(_, ev)| ev).collect())
}

fn score_content(content: &str, query_terms_lower: &[String]) -> f64 {
    let content_lower = content.to_lowercase();
    let exact = query_terms_lower
        .iter()
        .filter(|term| content_lower.contains(term.as_str()))
        .count();
    if exact > 0 {
        return exact as f64;
    }

    let words: Vec<&str> = content_lower.split_whitespace().collect();
    let mut total = 0.0f64;
    for qt_lower in query_terms_lower {
        for word in &words {
            let dist = levenshtein_distance(qt_lower, word);
            let max_len = qt_lower.len().max(word.len()) as f64;
            if max_len > 0.0 {
                let sim = 1.0 - (dist as f64 / max_len);
                if sim > 0.6 {
                    total += sim;
                }
            }
        }
    }
    total
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

fn new_snapshot_id(conn: &Connection) -> SessionResult<String> {
    let id = conn.query_row("SELECT lower(hex(randomblob(16)))", [], |row| {
        row.get::<_, String>(0)
    })?;
    Ok(format!("snap_{id}"))
}

/// High-level engine combining Store + session operations.
pub struct SessionEngine {
    conn: Connection,
}

impl SessionEngine {
    pub fn open(path: &Path) -> StoreResult<Self> {
        let conn = open(path)?;
        Ok(Self { conn })
    }

    pub fn capture_event(
        &self,
        repo_hash: &str,
        agent_id: &str,
        event_id: &str,
        tool_name: &str,
        content: &str,
    ) -> SessionResult<()> {
        capture_event(
            &self.conn, repo_hash, agent_id, event_id, tool_name, content,
        )
    }

    pub fn snapshot(
        &self,
        repo_hash: &str,
        agent_id: &str,
        cap_ms: u64,
    ) -> SessionResult<SnapshotResult> {
        snapshot(&self.conn, repo_hash, agent_id, cap_ms)
    }

    pub fn restore(
        &self,
        repo_hash: &str,
        agent_id: &str,
        query: &str,
        limit: usize,
    ) -> SessionResult<Vec<EventHit>> {
        restore(&self.conn, repo_hash, agent_id, query, limit)
    }

    pub fn search_store(
        &self,
        query: &str,
        limit: usize,
        source_filter: Option<&str>,
    ) -> StoreResult<Vec<SearchHit>> {
        search(&self.conn, query, limit, source_filter)
    }
}
