---
title: Session memory guide
type: guide
last_updated: 2026-05-27
---

# Session memory

Session memory gives webpresso agents a local recall layer backed by SQLite and FTS5. Version 1 is intentionally in-process: it has no daemon, no cloud calls, and no telemetry.

## Data location

The default data root is `~/.webpresso/sessions/`. Repositories do not own this directory, and the files should never be committed.

Set `WEBPRESSO_SESSION_MEMORY=0` to disable capture for a process. Delete the sessions directory to reset local history.

## Event flow

1. A hook or command captures a tool event with `{ repoHash, toolName, content }`.
2. `repoHash` is the first 16 hex characters of the SHA-256 hash of `git rev-parse --show-toplevel`, which scopes memory to the current repository.
3. Events are appended to `session_events` with WAL enabled so multiple local handles can write safely.
4. Snapshot points consolidate events into `sessions` rows. If a cap is reached, the snapshot is marked `partial` instead of blocking the agent.
5. Restore queries search recent event content with FTS5 and return top-ranked snippets for the active repo.

## Fetch and index flow

`fetch-index` uses native `fetch()` with an `AbortSignal`, normalizes URLs, caches responses for 24 hours in-process, converts HTML to text/Markdown-like chunks, formats JSON, and indexes chunks into the same FTS search store.

## Schema

### `session_memory_chunks`

- `id` — deterministic chunk id
- `source` — URL, file, or logical source
- `text` — indexed body text
- `metadata_json` — structured metadata such as URL and chunk index
- `created_at` — ISO timestamp

FTS tables:

- `session_memory_chunks_fts` — porter tokenizer for normal keyword search
- `session_memory_chunks_tri` — trigram tokenizer for partial-token fallback

### `session_events`

- `session_id`
- `event_id`
- `repo_hash`
- `ts`
- `tool_name`
- `content`

### `sessions`

- `agent_id`
- `snapshot_id`
- `repo_hash`
- `created_at`
- `status` (`complete` or `partial`)
- `content_json`

## Search fallback

The store uses a three-tier fallback: porter FTS first, trigram FTS second, and an IDF-weighted Levenshtein pass last. The implementation is TypeScript and local to agent-kit.
