---
type: guide
slug: session-memory
title: Session Memory (ak_session_*)
status: active
scope: repo
applies_to: [agents, consumers]
created: '2026-05-13'
last_reviewed: '2026-05-13'
last_updated: '2026-05-13'
paths:
  - 'src/session-memory/**'
  - 'src/hooks/post-tool/**'
  - 'src/hooks/pre-compact/**'
  - 'src/mcp/tools/session-*.ts'
---

# Session Memory — `ak_session_*`

Agent-kit's in-process session memory engine. Captures tool events, snapshots
context before compaction, and restores it automatically after. MIT-licensed,
zero external dependencies beyond `better-sqlite3`.

## Architecture

```
PostToolUse  →  ak-post-tool/index.ts  →  session-memory engine
                                           (better-sqlite3 + FTS5)
PreCompact   →  ak-pre-compact/index.ts →  snapshot() [5s cap]
SessionStart →  ak-sessionstart/index.ts → restore() → <session_knowledge>
```

**DB location**: `~/.webpresso/sessions/<repo-hash>.db` (one per project)

**Three-tier search**: porter FTS5 BM25 → trigram FTS5 → IDF-weighted Levenshtein

## MCP Tools

| Tool | Description |
| ---- | ----------- |
| `ak_session_search` | Search session memory for relevant prior context |
| `ak_session_snapshot` | Manually checkpoint before risky operations |
| `ak_session_restore` | Restore context by query, returns `<session_knowledge>` block |
| `ak_session_capture` | Manually record a decision or finding into memory |

## Usage examples

```
# Search for related prior work
ak_session_search query="session memory store SQLite"

# Snapshot before a branch switch
ak_session_snapshot

# Restore context after compaction
ak_session_restore query="what was I working on"

# Record an important decision
ak_session_capture content="Decided to use porter FTS5 for lane-2 memory" toolName="decision"
```

## Setup

Run `ak setup` — the scaffolder:
1. Creates `~/.webpresso/sessions/` directory
2. Migrates context-mode MCP entries from `.claude-plugin/plugin.json` to ak_session_*
3. Wires `ak-pre-compact` and updated `ak-post-tool` hooks

Migration is idempotent. Re-running `ak setup` is safe.

## Migration from context-mode

When `ak setup` detects context-mode entries in `.claude-plugin/plugin.json`, it:
1. Creates a timestamped backup: `plugin.pre-session-memory-backup.<ts>.json`
2. Removes the context-mode MCP server entries
3. Ensures `ak_session_*` tools are available via the agent-kit MCP server

To restore context-mode: copy the backup file back to `plugin.json`.

## Schema

Forward-compatible with v2 (Rust) engine. Migration v1→v2 = swap engine binary, keep `.db` file.

```sql
CREATE VIRTUAL TABLE chunks USING fts5(content, source, tokenize='porter unicode61');
CREATE VIRTUAL TABLE chunks_trigram USING fts5(content, source, tokenize='trigram');
CREATE TABLE sources(id INTEGER PRIMARY KEY, label TEXT, indexed_at INTEGER, chunk_count INTEGER);
CREATE TABLE vocabulary(term TEXT PRIMARY KEY, idf_score REAL);
CREATE TABLE sessions(agent_id TEXT, snapshot_id TEXT, created_at INTEGER, status TEXT, content_json TEXT);
CREATE TABLE session_events(session_id TEXT, event_id TEXT, ts INTEGER, tool_name TEXT, content TEXT);
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA mmap_size=268435456;
```

## Non-goals

- Vector / semantic search (out of v1 scope)
- Cloud / multi-tenant sync (strictly local SQLite)
- LLM-driven fact extraction (wrong tool for tool-call indexing)
- 13 of context-mode's 15 platform adapters (Claude Code + stdio MCP only)

## Search fallback

The store uses a three-tier fallback: porter FTS first, trigram FTS second, and an IDF-weighted Levenshtein pass last. The implementation is TypeScript and local to agent-kit.
