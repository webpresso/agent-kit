//! napi-rs FFI bindings for session-memory-core.
//!
//! Sync exports for the hot path (index, search, snapshot, restore, capture_event).
//! Async for fetch_and_index and execute_sandboxed only (network/subprocess I/O).
//!
//! ## Performance design
//!
//! Hot-path fns are sync — no tokio task spawn and no JS Promise scheduling overhead on the
//! synchronous storage/search boundary.
//!
//! Connection caches (`STORE_CACHE`, `SESSION_CACHE`) use `thread_local!` storage so
//! SQLite connections are never moved across threads (rusqlite `Connection: !Send`).
//! Node.js runs JS on a single thread, so one cached connection per db_path is sufficient
//! for the hot path.
//!
//! `capture_event` writes through to SQLite synchronously so public boundaries never
//! lose buffered session events.
//!
//! napi-rs handles Rust panic → Node.js Error natively (no manual catch_unwind needed).

#![deny(clippy::all)]

pub mod types;

use napi::Result as NapiResult;
use napi_derive::napi;
use std::cell::RefCell;
use std::collections::HashMap;
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
/// `session_id` (= `agent_id`) identifies the agent/repo session. Writes are durable
/// at the public boundary; there is no lossy in-memory event buffer.
#[napi]
pub fn capture_event(
    db_path: String,
    repo_hash: String,
    session_id: String,
    event_id: String,
    tool_name: String,
    content: String,
) -> NapiResult<()> {
    SESSION_CACHE.with(|cache| {
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
    })
}

/// Compatibility no-op: capture_event is durable at the public boundary.
#[napi]
pub fn flush_events() -> NapiResult<u32> {
    Ok(0)
}

/// Compatibility no-op: capture_event is durable at the public boundary.
#[napi]
pub fn flush_events_for_db(_db_path: String) -> NapiResult<u32> {
    Ok(0)
}

/// Create a session snapshot for `agent_id`, capped at `max_ms` milliseconds.
///
/// Capture writes are already durable, so snapshot reads directly from SQLite.
/// Returns partial gracefully if cap is exceeded.
#[napi]
pub fn snapshot(
    db_path: String,
    repo_hash: String,
    agent_id: String,
    max_ms: u32,
) -> NapiResult<SnapshotResult> {
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
    pub output_bytes: i64,
    /// Whether any content was indexed into FTS5.
    pub indexed: bool,
    /// TypeScript-compatible bounded summary.
    pub summary: String,
    /// Whether streamed output exceeded the indexed byte cap.
    pub truncated: bool,
    /// Bytes captured into SQLite/FTS for search.
    pub captured_bytes: i64,
    /// Max bytes allowed to be captured into SQLite/FTS.
    pub max_capture_bytes: i64,
    /// Whether the process timed out.
    pub timed_out: bool,
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
        output_bytes: result.output_bytes.min(9_007_199_254_740_991) as i64,
        indexed: result.indexed,
        summary: result.summary,
        truncated: result.truncated,
        captured_bytes: result.captured_bytes as i64,
        max_capture_bytes: result.max_capture_bytes as i64,
        timed_out: result.timed_out,
    })
}
