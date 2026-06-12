//! napi-rs type definitions for the FFI surface.

use napi_derive::napi;

/// A single search result returned from `search()`.
#[napi(object)]
pub struct SearchHit {
    pub content: String,
    pub source: String,
    /// BM25 rank (lower = more relevant for FTS5).
    pub rank: f64,
}

/// A single session event returned from `restore()`.
#[napi(object)]
pub struct EventHit {
    pub session_id: String,
    pub event_id: String,
    pub ts: i64,
    pub tool_name: String,
    pub content: String,
}

/// Result of a `snapshot()` call.
#[napi(object)]
pub struct SnapshotResult {
    pub snapshot_id: String,
    pub event_count: u32,
    /// True if all events were snapshotted within the time cap.
    pub complete: bool,
}

/// Result of a `fetch_and_index()` call.
#[napi(object)]
pub struct FetchResult {
    pub url: String,
    pub chunk_count: u32,
    pub source_label: String,
}
