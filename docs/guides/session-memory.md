---
title: Session memory guide
type: guide
last_updated: 2026-06-11
---

# Session memory

Session memory is now a **single-path ctx-rs lane**. This branch does not
support `AK_SESSION_ENGINE`, `AK_DISABLE_CTX`, or any TS runtime fallback.
Agent-kit ships vendored `ctx-rs` source and builds the native binding for the
current host on first use. If that build/load step fails, session-memory calls
fail loudly rather than degrading.

## Delivery status

The merge gate for this branch is a real delivery surface for ctx-rs that is
owned by this repo. The shipping contract is: vendored Rust source under
`vendor/ctx-rs/`, host-local native build on first use, and no hidden sibling
checkout or external npm prerequisite for consumers.

## Data location

Session-memory data lives under `~/.webpresso/sessions/<repo-hash>.db`.
Repositories do not own this directory, and the files should never be
committed.

`repoHash` is the first 16 hex characters of the SHA-256 hash of
`git rev-parse --show-toplevel`, which scopes memory to the current repo.

## Event flow

1. Hooks or explicit MCP tools call the ctx-rs-backed session primitives.
2. Events are appended to `session_events` for the active repo hash.
3. Pre-compact snapshots consolidate recent events into `sessions` rows.
4. Restore queries combine ctx-rs event restoration with indexed search hits
   from the same repo-local SQLite file.

## MCP surfaces on this branch

- `ak_session_capture`
- `ak_session_snapshot`
- `ak_session_restore`
- `ak_session_search`
- `ak_session_execute`
- `ak_session_batch_execute`

The text body for execute/batch-execute is summary-first; the structured
payload lives in `structuredContent`.

## Failure contract

- Missing ctx-rs runtime is a **loud failure**.
- No compatibility env var can switch back to a TS engine.
- The feature must not silently fall back to a local legacy backend.
