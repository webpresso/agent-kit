//! napi-rs FFI bindings for session-memory-core.
//!
//! Sync exports for the hot path (index, search, snapshot, restore, capture_event).
//! Async for fetch_and_index and execute_sandboxed only (network/subprocess I/O).
//!
//! ## Performance design
//!
//! Hot-path fns are sync — no tokio task spawn, no JS Promise overhead (~0.01ms FFI round-trip).
//!
//! Connection caches (`STORE_CACHE`, `SESSION_CACHE`) use `thread_local!` storage so
//! SQLite connections are never moved across threads (rusqlite `Connection: !Send`).
//! Node.js runs JS on a single thread, so one cached connection per db_path is sufficient
//! for the hot path.
//!
//! `capture_event` uses a ring-buffer that flushes at 50 events, making each call a
//! pure memory write (<0.01ms) rather than a synchronous SQLite INSERT.
//!
//! napi-rs handles Rust panic → Node.js Error natively (no manual catch_unwind needed).

#![deny(clippy::all)]

pub mod types;

use napi::Result as NapiResult;
use napi_derive::napi;
use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::path::Path;

use session_memory_core::{
    chunk::{chunk_html, chunk_text},
    execute::execute_and_index,
};

use crate::types::{EventHit, FetchResult, SearchHit, SnapshotResult};

// ---------------------------------------------------------------------------
// Thread-local connection caches
// ---------------------------------------------------------------------------

// One `Store` per db_path, per Node.js thread (there is only one).
thread_local! {
    static STORE_CACHE: RefCell<HashMap<String, session_memory_core::store::Store>> =
        RefCell::new(HashMap::new());
}

// One `SessionEngine` per db_path, per Node.js thread.
thread_local! {
    static SESSION_CACHE: RefCell<HashMap<String, session_memory_core::session::SessionEngine>> =
        RefCell::new(HashMap::new());
}

// (db_path, repo_hash, session_id, event_id, tool_name, content)
type PendingEvent = (String, String, String, String, String, String);

// Ring-buffer of pending `capture_event` writes, flushed every 50 entries.
thread_local! {
    static EVENT_BUFFER: RefCell<VecDeque<PendingEvent>> =
        const { RefCell::new(VecDeque::new()) };
}

/// Flush all buffered events to SQLite. Called automatically when the buffer reaches 50
/// entries, and explicitly via `flush_events`.
fn flush_buffered_events(buf: &mut VecDeque<PendingEvent>) -> NapiResult<()> {
    let mut pending = std::mem::take(buf);
    // Group events by db_path so we open each connection at most once per flush.
    while let Some((db_path, repo_hash, session_id, event_id, tool_name, content)) =
        pending.pop_front()
    {
        if let Err(error) = SESSION_CACHE.with(|cache| {
            let mut map = cache.borrow_mut();
            if !map.contains_key(&db_path) {
                let path = Path::new(&db_path);
                let engine = session_memory_core::session::SessionEngine::open(path)
                    .map_err(|e| napi::Error::from_reason(e.to_string()))?;
                map.insert(db_path.clone(), engine);
            }
            map.get(&db_path)
                .unwrap()
                .capture_event(&repo_hash, &session_id, &event_id, &tool_name, &content)
                .map_err(|e| napi::Error::from_reason(e.to_string()))
        }) {
            buf.push_back((db_path, repo_hash, session_id, event_id, tool_name, content));
            buf.append(&mut pending);
            return Err(error);
        }
    }
    Ok(())
}

fn flush_buffered_events_for_db(
    buf: &mut VecDeque<PendingEvent>,
    target_db_path: &str,
) -> NapiResult<u32> {
    let mut pending = std::mem::take(buf);
    let mut retained = VecDeque::new();
    let mut flushed = 0u32;

    while let Some((db_path, repo_hash, session_id, event_id, tool_name, content)) =
        pending.pop_front()
    {
        if db_path != target_db_path {
            retained.push_back((db_path, repo_hash, session_id, event_id, tool_name, content));
            continue;
        }
        flushed += 1;
        if let Err(error) = SESSION_CACHE.with(|cache| {
            let mut map = cache.borrow_mut();
            if !map.contains_key(target_db_path) {
                let path = Path::new(target_db_path);
                let engine = session_memory_core::session::SessionEngine::open(path)
                    .map_err(|e| napi::Error::from_reason(e.to_string()))?;
                map.insert(target_db_path.to_string(), engine);
            }
            map.get(target_db_path)
                .unwrap()
                .capture_event(&repo_hash, &session_id, &event_id, &tool_name, &content)
                .map_err(|e| napi::Error::from_reason(e.to_string()))
        }) {
            retained.push_back((db_path, repo_hash, session_id, event_id, tool_name, content));
            retained.append(&mut pending);
            *buf = retained;
            return Err(error);
        }
    }

    *buf = retained;
    Ok(flushed)
}

// ---------------------------------------------------------------------------
// Hot-path exports — sync, connection-cached
// ---------------------------------------------------------------------------

/// Index text content into the store at `db_path`.
///
/// `payload` should be UTF-8 text (plain or HTML). HTML is converted to Markdown first.
/// `source_label` identifies this document for scoped search and idempotent re-indexing.
/// `is_html` controls whether HTML→Markdown conversion is applied.
///
/// Uses the thread-local `Store` cache — no connection open overhead on repeat calls.
#[napi]
pub fn index(
    db_path: String,
    source_label: String,
    payload: String,
    is_html: Option<bool>,
) -> NapiResult<u32> {
    let chunks = if is_html.unwrap_or(false) {
        chunk_html(&payload, None)
    } else {
        chunk_text(&payload, None)
    };
    let chunk_count = chunks.len() as u32;

    STORE_CACHE.with(|cache| {
        let mut map = cache.borrow_mut();
        if !map.contains_key(&db_path) {
            let path = Path::new(&db_path);
            let s = session_memory_core::store::Store::open(path)
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            map.insert(db_path.clone(), s);
        }
        map.get_mut(&db_path)
            .unwrap()
            .index(&source_label, &chunks)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(chunk_count)
    })
}

/// Search the store at `db_path` for `query`.
///
/// Three-tier fallback: porter → trigram → Levenshtein.
/// `source_filter` scopes results to a single source label.
///
/// Uses the thread-local `Store` cache — no connection open overhead on repeat calls.
#[napi]
pub fn search(
    db_path: String,
    query: String,
    limit: u32,
    source_filter: Option<String>,
) -> NapiResult<Vec<SearchHit>> {
    STORE_CACHE.with(|cache| {
        let mut map = cache.borrow_mut();
        if !map.contains_key(&db_path) {
            let path = Path::new(&db_path);
            let s = session_memory_core::store::Store::open(path)
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            map.insert(db_path.clone(), s);
        }
        let hits = map
            .get(&db_path)
            .unwrap()
            .search(&query, limit as usize, source_filter.as_deref())
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        Ok(hits
            .into_iter()
            .map(|h| SearchHit {
                content: h.content,
                source: h.source,
                rank: h.rank,
                tier: h.tier,
            })
            .collect())
    })
}

/// Capture a session event to the store.
///
/// `session_id` (= `agent_id`) identifies the agent/repo session.
///
/// Hot path: writes to a thread-local ring buffer; flushes to SQLite every 50 events.
/// Per-call cost is a memory push (~0.01ms). Call `flush_events` before `snapshot` to
/// guarantee all events are persisted.
#[napi]
pub fn capture_event(
    db_path: String,
    repo_hash: String,
    session_id: String,
    event_id: String,
    tool_name: String,
    content: String,
) -> NapiResult<()> {
    EVENT_BUFFER.with(|buf| {
        let mut b = buf.borrow_mut();
        b.push_back((db_path, repo_hash, session_id, event_id, tool_name, content));
        if b.len() >= 50 {
            flush_buffered_events(&mut b)?;
        }
        Ok(())
    })
}

/// Flush all buffered `capture_event` writes to SQLite immediately.
///
/// Call this before `snapshot` to ensure all events are persisted. Otherwise
/// the buffer flushes lazily at 50-event intervals.
#[napi]
pub fn flush_events() -> NapiResult<u32> {
    EVENT_BUFFER.with(|buf| {
        let mut b = buf.borrow_mut();
        let count = b.len() as u32;
        flush_buffered_events(&mut b)?;
        Ok(count)
    })
}

#[napi]
pub fn flush_events_for_db(db_path: String) -> NapiResult<u32> {
    EVENT_BUFFER.with(|buf| flush_buffered_events_for_db(&mut buf.borrow_mut(), &db_path))
}

/// Create a session snapshot for `agent_id`, capped at `max_ms` milliseconds.
///
/// Implicitly flushes the event buffer before snapshotting to guarantee all
/// pending events are included. Returns partial gracefully if cap is exceeded.
#[napi]
pub fn snapshot(
    db_path: String,
    repo_hash: String,
    agent_id: String,
    max_ms: u32,
) -> NapiResult<SnapshotResult> {
    // Flush pending events so snapshot sees all of them.
    EVENT_BUFFER
        .with(|buf| flush_buffered_events_for_db(&mut buf.borrow_mut(), &db_path).map(|_| ()))?;

    SESSION_CACHE.with(|cache| {
        let mut map = cache.borrow_mut();
        if !map.contains_key(&db_path) {
            let path = Path::new(&db_path);
            let engine = session_memory_core::session::SessionEngine::open(path)
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            map.insert(db_path.clone(), engine);
        }
        let result = map
            .get(&db_path)
            .unwrap()
            .snapshot(&repo_hash, &agent_id, max_ms as u64)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        Ok(SnapshotResult {
            snapshot_id: result.snapshot_id,
            event_count: result.event_count as u32,
            complete: result.complete,
        })
    })
}

/// Restore recent session events for `agent_id`, ranked by relevance to `query`.
#[napi]
pub fn restore(
    db_path: String,
    repo_hash: String,
    agent_id: String,
    query: String,
    limit: u32,
) -> NapiResult<Vec<EventHit>> {
    // Flush so restore sees all pending events.
    EVENT_BUFFER
        .with(|buf| flush_buffered_events_for_db(&mut buf.borrow_mut(), &db_path).map(|_| ()))?;

    SESSION_CACHE.with(|cache| {
        let mut map = cache.borrow_mut();
        if !map.contains_key(&db_path) {
            let path = Path::new(&db_path);
            let engine = session_memory_core::session::SessionEngine::open(path)
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            map.insert(db_path.clone(), engine);
        }
        let events = map
            .get(&db_path)
            .unwrap()
            .restore(&repo_hash, &agent_id, &query, limit as usize)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        Ok(events
            .into_iter()
            .map(|e| EventHit {
                session_id: e.session_id,
                event_id: e.event_id,
                ts: e.ts,
                tool_name: e.tool_name,
                content: e.content,
            })
            .collect())
    })
}

// ---------------------------------------------------------------------------
// Async exports — network / subprocess I/O
// ---------------------------------------------------------------------------

/// Fetch a URL, convert to Markdown, chunk, and index into the store.
///
/// This is async (D8 carve-out: network I/O must not block the Node event loop).
/// Uses a fresh connection in the blocking task — cannot share the thread-local cache
/// across the tokio worker thread boundary.
#[napi]
pub async fn fetch_and_index(db_path: String, url: String) -> NapiResult<FetchResult> {
    let html = reqwest::get(&url)
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?
        .text()
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let source_label = url.clone();
    let chunks = chunk_html(&html, None);
    let chunk_count = chunks.len() as u32;

    let path_str = db_path.clone();
    let source_label_clone = source_label.clone();
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&path_str);
        let mut s = session_memory_core::store::Store::open(path).map_err(|e| e.to_string())?;
        s.index(&source_label_clone, &chunks)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| napi::Error::from_reason(e.to_string()))?
    .map_err(napi::Error::from_reason)?;

    Ok(FetchResult {
        url,
        chunk_count,
        source_label,
    })
}

/// Result returned by [`execute_sandboxed`].
#[napi(object)]
pub struct ExecuteResult {
    /// Shell exit code (−1 if killed without a code).
    pub exit_code: i32,
    /// Total bytes streamed from stdout + stderr.
    pub output_bytes: u32,
    /// Whether any content was indexed into FTS5.
    pub indexed: bool,
    /// First output text, truncated to 500 chars.
    pub summary: String,
}

/// Run a shell command and index output into the FTS5 store.
///
/// Streams stdout and stderr in chunks — no full-output memory spike.
/// Returns a compact summary; raw output never leaves this function.
///
/// `label` is the FTS5 source label used for scoped search. Pass the command
/// string when no explicit label is needed.
#[napi]
pub async fn execute_sandboxed(
    db_path: String,
    command: String,
    label: String,
    timeout_ms: u32,
    cwd: Option<String>,
) -> NapiResult<ExecuteResult> {
    let path = std::path::PathBuf::from(&db_path);
    let cwd_path = cwd.as_deref().map(std::path::PathBuf::from);
    let result = execute_and_index(
        &path,
        &command,
        &label,
        timeout_ms as u64,
        cwd_path.as_deref(),
    )
    .await
    .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(ExecuteResult {
        exit_code: result.exit_code,
        output_bytes: result.output_bytes as u32,
        indexed: result.indexed,
        summary: result.summary,
    })
}
