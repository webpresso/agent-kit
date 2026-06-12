---
title: Session memory guide
type: guide
last_updated: 2026-05-27
---

# Session memory

Session memory gives webpresso agents a local recall layer backed by the built-in native session-memory engine shipped inside `@webpresso/agent-kit`. It stays local: no daemon, no cloud calls, and no telemetry.

The current distribution contract is **source-in-tarball + local native build on first use**. The package ships the Rust workspace under `native/session-memory-engine/**`, and the first native load builds the addon locally via `cargo`. That means the host environment needs a working Rust toolchain and a writable cache directory.

## Data location

The default data root is `~/.webpresso/sessions/`. Repositories do not own this directory, and the files should never be committed.

Set `WEBPRESSO_SESSION_MEMORY=0` to disable capture for a process. Delete the sessions directory to reset local history.

## Event flow

1. A hook or command captures a tool event with `{ repoHash, toolName, content }`.
2. `repoHash` comes from `WP_REPO_HASH`, then `CLAUDE_REPO_HASH`, and otherwise falls back to the first 16 hex characters of the SHA-256 hash of `git rev-parse --show-toplevel`, which scopes memory to the current repository.
3. Events are buffered by the native engine and flushed on explicit durability boundaries such as `wp_session_capture`, snapshot, or restore. Capture can be disabled with `WEBPRESSO_SESSION_MEMORY=0`.
4. Snapshot points consolidate events into `sessions` rows. If a cap is reached, the snapshot is marked `partial` instead of blocking the agent.
5. Restore queries scan the recent session-event window for the active session and return ranked snippets for the active repo.

## Fetch and index flow

`fetch-index` uses native `fetch()` with an `AbortSignal`, normalizes URLs, caches responses for 24 hours in-process, converts HTML to text/Markdown-like chunks once at the JS boundary, formats JSON, and indexes chunks into the same native-backed FTS search store.

## Schema

### Native store tables

- `chunks` — FTS5 porter index over chunk content and source
- `chunks_trigram` — FTS5 trigram index for partial-token fallback
- `sources` — indexed source labels with timestamps and chunk counts
- `vocabulary` — native IDF metadata

### Session tables

- `session_events(session_id, event_id, repo_hash, ts, tool_name, content)`
- `sessions(agent_id, snapshot_id, repo_hash, created_at, status, content_json)`

## Search fallback

The store uses a three-tier fallback adapted from context-mode's `searchWithFallback` design: porter FTS first, trigram FTS second, and an IDF-weighted Levenshtein pass last. The algorithm now lives in the absorbed native session-memory engine inside agent-kit; the algorithm credit is preserved in source comments and native code.

`wp_session_restore` currently returns ranked recent session events from the native restore path, which is a bounded event-scan optimized for session recall rather than the chunk-store FTS search path used by `wp_session_search`.
