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
    session_id: &str,
    event_id: &str,
    tool_name: &str,
    content: &str,
) -> SessionResult<()> {
    let ts = now_unix();
    conn.execute(
        "INSERT INTO session_events(session_id, event_id, ts, tool_name, content)
         VALUES(?1, ?2, ?3, ?4, ?5)",
        params![session_id, event_id, ts, tool_name, content],
    )?;
    Ok(())
}

/// Consolidate pending events for `agent_id` into a snapshot row.
///
/// `cap_ms`: maximum milliseconds allowed; if exceeded, returns partial gracefully.
pub fn snapshot(conn: &Connection, agent_id: &str, cap_ms: u64) -> SessionResult<SnapshotResult> {
    let deadline = Instant::now() + Duration::from_millis(cap_ms);

    // Gather all unsnapshotted events for this agent
    let mut stmt = conn.prepare(
        "SELECT event_id, tool_name, content FROM session_events
         WHERE session_id = ?1
         ORDER BY ts ASC",
    )?;
    let events: Vec<(String, String, String)> = stmt
        .query_map(params![agent_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<SqlResult<Vec<_>>>()?;

    let total = events.len();
    let snapshot_id = new_uuid();
    let created_at = now_unix();

    // Build content_json from events (partial if deadline exceeded)
    let mut collected = Vec::new();
    let mut complete = true;
    for (i, (event_id, tool_name, content)) in events.into_iter().enumerate() {
        if Instant::now() > deadline {
            // Deadline exceeded — return partial
            complete = false;
            let _ = i; // suppress warning
            break;
        }
        collected.push(serde_json_simple(&event_id, &tool_name, &content));
    }

    let content_json = format!("[{}]", collected.join(","));
    conn.execute(
        "INSERT INTO sessions(agent_id, snapshot_id, created_at, status, content_json)
         VALUES(?1, ?2, ?3, ?4, ?5)",
        params![
            agent_id,
            snapshot_id,
            created_at,
            if complete { "complete" } else { "partial" },
            content_json
        ],
    )?;

    Ok(SnapshotResult {
        snapshot_id,
        event_count: total.min(collected.len() + if complete { 0 } else { 1 }),
        complete,
    })
}

/// Restore recent session events for `agent_id` matching `query`.
/// Returns top-k events ordered by relevance.
pub fn restore(
    conn: &Connection,
    agent_id: &str,
    query: &str,
    limit: usize,
) -> SessionResult<Vec<EventHit>> {
    // Get all events for this agent, most recent first
    let mut stmt = conn.prepare(
        "SELECT session_id, event_id, ts, tool_name, content
         FROM session_events
         WHERE session_id = ?1
         ORDER BY ts DESC
         LIMIT 500",
    )?;
    let events: Vec<EventHit> = stmt
        .query_map(params![agent_id], |r| {
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

    // Score events by content relevance to query using Levenshtein
    let query_terms: Vec<&str> = query.split_whitespace().collect();
    let mut scored: Vec<(f64, EventHit)> = events
        .into_iter()
        .map(|ev| {
            let score = score_content(&ev.content, &query_terms);
            (score, ev)
        })
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);

    Ok(scored.into_iter().map(|(_, ev)| ev).collect())
}

fn score_content(content: &str, query_terms: &[&str]) -> f64 {
    let words: Vec<&str> = content.split_whitespace().collect();
    let mut total = 0.0f64;
    for qt in query_terms {
        let qt_lower = qt.to_lowercase();
        for word in &words {
            let word_lower = word.to_lowercase();
            if word_lower.contains(qt_lower.as_str()) {
                total += 1.0;
                continue;
            }
            let dist = levenshtein_distance(&qt_lower, &word_lower);
            let max_len = qt.len().max(word.len()) as f64;
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

fn new_uuid() -> String {
    // Minimal UUID v4 without a dep: use timestamp + random bytes
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    // Mix with thread id
    let tid = std::thread::current().id();
    format!("{ts:x}-{tid:?}")
        .replace("ThreadId(", "")
        .replace(")", "")
}

fn serde_json_simple(event_id: &str, tool_name: &str, content: &str) -> String {
    let content_escaped = content.replace('\\', "\\\\").replace('"', "\\\"");
    format!(
        r#"{{"event_id":"{event_id}","tool_name":"{tool_name}","content":"{content_escaped}"}}"#
    )
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
        agent_id: &str,
        event_id: &str,
        tool_name: &str,
        content: &str,
    ) -> SessionResult<()> {
        capture_event(&self.conn, agent_id, event_id, tool_name, content)
    }

    pub fn snapshot(&self, agent_id: &str, cap_ms: u64) -> SessionResult<SnapshotResult> {
        snapshot(&self.conn, agent_id, cap_ms)
    }

    pub fn restore(
        &self,
        agent_id: &str,
        query: &str,
        limit: usize,
    ) -> SessionResult<Vec<EventHit>> {
        restore(&self.conn, agent_id, query, limit)
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
