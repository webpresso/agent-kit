---
type: blueprint
title: wp session memory v1 — in-process SQLite + FTS5 (TS engine)
owner: agent-kit
status: completed
complexity: M
created: '2026-05-13'
last_updated: '2026-06-11'
progress: '100% (24/24 tasks done — 17 Phase 1-5 + 7 Phase 6 PR review hardening)'
depends_on: []
tags:
  - session-memory
  - sqlite
  - fts5
  - better-sqlite3
  - hooks
  - mcp
  - lane-2
  - permissive-license
  - in-process
---

# wp session memory v1 — in-process SQLite + FTS5 (TS engine)

## Product wedge anchor

- **Stage outcome:** webpresso open-sourcing — Lane 2 of the four-lane routing model becomes permissively-licensed and **dependency-free at the consumer layer**. No external memory service to install, no docker, no embedding provider, no API key. Cited model: `catalog/agent/rules/gstack-routing.md` (and `context-mode-routing.md`, the lane-2 canonical rule per refinement F8/F14).
- **Consuming surface:** New `wp setup` step (no extra flag needed; ships by default since cost is zero) + new MCP tools `ak_session_capture`, `ak_session_snapshot`, `ak_session_restore`, `ak_session_search` exposed via agent-kit's existing MCP server (auto-discovered from `src/mcp/tools/`).
- **New user-visible capability:** After this lands, `pnpm add -D @webpresso/agent-kit` is the entire install. After a Claude Code compaction, the agent uses `ak_session_search` to recall what it was working on. Sub-millisecond hot path. Same on-disk SQLite schema as v2 (Rust engine swap is invisible).

## Problem Statement

The previous v1 blueprint (parked) chose Letta for memory-hierarchy semantics
that turned out to be internal to Letta's agent loop and not externally callable
(see parked blueprint's `parked_reason`). Refinement Phase 1 surfaced this
before any code was written.

The recompare opened space for a fourth option that hadn't been seriously
considered: **build the engine in-process**. With `better-sqlite3` (already
viable as an agent-kit dep), FTS5 + porter + trigram tokenizers ship in the
bundled SQLite amalgamation. The engine is ~400-600 LOC of glue.

This option dominates the alternatives on every dimension that matters:

- **Zero install footprint** beyond `pnpm add` (no docker, no Python, no Postgres)
- **Zero credential boundary** at T0 (no API keys, no embedding provider)
- **Sub-millisecond hot path** (in-process, no IPC, no HTTP)
- **Same on-disk schema as v2 ctx-rs** — engine swap is invisible to consumers
- **MIT-licensed, owned by us** — no upstream coupling risk

The trade is honest: we maintain ~500 LOC of TS engine code. That's worth it
because the equivalent external-backend integration is bigger AND adds an
external dependency.

## Architecture Overview

```text
                 END-USER CLAUDE CODE
                         │
                         │ tool invocations
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ HOOK CHAIN (rtk first, wp second — eng-review D5 unchanged) │
│                                                              │
│  PreToolUse:    rtk-pretool-guard ──▶ ak-pretool-guard      │
│                                                              │
│  Tool fires                                                  │
│                                                              │
│  PostToolUse:   rtk-posttool ──▶ ak-post-tool/index.ts      │
│                                       │                      │
│                                       ▼ (in-process import)  │
│                                   session-memory engine (TS) │
│                                   ├ better-sqlite3 + FTS5    │
│                                   ├ porter + trigram + Lev   │
│                                   └ ~/.webpresso/sessions/   │
│                                       <repo-hash>.db         │
│                                                              │
│  PreCompact:    ak-pre-compact (snapshot, capped at 5s)     │
│  SessionStart:  ak-sessionstart on source=compact (restore) │
└─────────────────────────────────────────────────────────────┘

LANE MODEL (final, all permissive, all in-process):
  1  agent-kit + TS session engine   ak_session_*   MIT
  2  — DROPPED —                     —              (context-mode out)
  3  rtk (upstream)                  bash filter    MIT
  4  gstack (upstream)               /skill         MIT

ON-DISK SCHEMA (forward-compatible with v2 Rust engine):
  sources(id INTEGER PK, label TEXT, indexed_at INTEGER, chunk_count INTEGER)
  chunks (FTS5 virtual table, tokenize='porter unicode61')
  chunks_trigram (FTS5 virtual table, tokenize='trigram')
  vocabulary(term TEXT, idf_score REAL)  -- for Levenshtein fallback
  sessions(agent_id, snapshot_id, created_at, status, content_json)
  session_events(session_id, event_id, ts, tool_name, content)
  PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA mmap_size=268435456;

DATA FLOW (event capture path):
  tool result JSON  ──▶ ak-post-tool/index.ts ──▶ session-memory.captureEvent({
                                                    repoHash, ts, tool, content
                                                  })
                        ↳ (sync better-sqlite3 INSERT, <0.5ms)
  on PreCompact:
                        ak-pre-compact/index.ts ──▶ session-memory.snapshot({
                                                      repoHash, capMs: 5000
                                                    })
  on SessionStart (source=compact):
                        ak-sessionstart/index.ts ──▶ session-memory.restore({
                                                       repoHash, query: lastPrompt
                                                     })
                                                  ──▶ inject <session_knowledge>
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Engine location | In-process (TS module imported by hooks + MCP tools) | Sub-ms hot path; zero IPC/HTTP cost; matches v2 Rust engine via napi-rs FFI |
| SQLite library | `better-sqlite3` ^11 | Mature, sync API matches hot path; bundled SQLite ships FTS5 (refinement F1/F3 v2 verified) |
| FTS5 setup | `tokenize='porter unicode61'` and `tokenize='trigram'` virtual tables | Built-in tokenizers, no rusqlite-style custom-tokenizer limitation (refinement F2 v2) |
| Three-tier search | porter → trigram → IDF-weighted Levenshtein | Same fallback chain as context-mode and v2 ctx-rs (intentional behavior parity) |
| MCP tool naming | `ak_session_*` MCP names; tool files named `session-*.ts` (no `ak-` prefix in filenames) | Refinement F5 v1: agent-kit convention is no `ak-` prefix in tool filenames; the prefix is added by routing |
| MCP server registration | None — MCP server auto-discovers from `src/mcp/tools/*.ts` | Refinement F13 v1: `.mcp.json` does not exist in agent-kit; auto-discovery is the pattern |
| Hook integration | New `src/hooks/post-tool/index.ts` dispatcher (currently only `lint-after-edit.ts` exists) | Refinement F2 v1: dispatcher hub is a prerequisite, not assumption |
| Pre-compact hook | New `src/hooks/pre-compact/index.ts` + new entry in package.json `bin` + new `PreCompact` block in `.claude/settings.json` template | Refinement F3 v1 + F9/F10 v1: PreCompact is not currently registered |
| Session-start hook | Extend existing `src/hooks/sessionstart/index.ts` (NOT `sessionstart-routing/`) with a compact-source branch | Refinement F4 v1: actual directory name is `sessionstart`, not `sessionstart-routing` |
| Setup integration | Extend existing `src/cli/commands/init/` (new `init/scaffolders/scaffold-session-memory.ts`) | Refinement F1 v1: agent-kit uses `init/`, not `setup/` |
| DB location | `~/.webpresso/sessions/<repo-hash>.db` (one DB per project) | Same convention as `~/.webpresso/cache/agent-kit/hooks/` (existing path); per-repo isolation |
| Migration from context-mode | Hard remove from `.claude-plugin/plugin.json` MCP entries (NOT `.mcp.json` — refinement F13 v1) with backup | D7 from eng-review carries; correct file per F13 |
| Hook order | rtk → ak (rtk first) | Eng-review D5 unchanged |
| Failure mode | If SQLite locked or DB corrupt: hooks log + return success (non-blocking) | Eng-review D13 spirit — never block tool calls |
| PreCompact timeout | 5s cap; partial snapshot allowed | Eng-review D14 carries |
| Lane-2 routing rule update | Update `catalog/agent/rules/context-mode-routing.md` (NOT `gstack-routing.md`) — context-mode entry deprecated, ak_session_* takes its place | Refinement F8/F14 v1: lane-2 is owned by `context-mode-routing.md` |
| Schema design | Forward-compatible with v2 ctx-rs (Rust) | Migration v1→v2 is "swap engine binary, keep .db file" — invisible to consumers |

## Quick Reference (Execution Waves)

| Wave              | Tasks                | Dependencies | Parallelizable | Effort (T-shirt) |
| ----------------- | -------------------- | ------------ | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2, 1.3, 1.4   | None         | 4 agents       | XS-S             |
| **Wave 1**        | 2.1, 2.2, 2.3        | Wave 0       | 3 agents       | S-M              |
| **Wave 2**        | 3.1, 3.2, 3.3, 3.4   | Wave 1       | 4 agents       | S                |
| **Wave 3**        | 4.1, 4.2             | Wave 2       | 2 agents       | S-M              |
| **Critical path** | 1.1 → 2.1 → 3.1 → 4.1 | --          | 4 waves        | M                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual |
| ------ | ---------------------------------- | -------------------- | ------ |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 4      |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 13/4 = 3.25 |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | ~12/13 = 0.92 |
| CP     | same-file overlaps per wave        | 0                    | 0      |

All metrics meet target. Plan is `/pll`-ready.

### Phase 1: Engine module (in-process) [Complexity: M]

#### [backend] Task 1.1: SQLite store with three-tier search

**Status:** done

**Depends:** None

Create `src/session-memory/store.ts` implementing the FTS5 store. Schema as documented in Architecture Overview. Three-tier search fallback (porter → trigram → IDF-weighted Levenshtein) ported from context-mode's `searchWithFallback` (credit upstream in source comments — different language, same algorithm).

Performance pragmas applied at open: `journal_mode=WAL`, `synchronous=NORMAL`, `mmap_size=268435456` (256MB), `OPTIMIZE` invoked every 50 inserts.

**Files:**

- Create: `src/session-memory/store.ts`
- Create: `src/session-memory/store.test.ts`
- Create: `src/session-memory/types.ts`
- Modify: `package.json` — add `better-sqlite3` to dependencies (verify if already present via grep)

**Steps (TDD):**

1. Write failing tests: insert 100 chunks, search "foo" → expected top-5; trigram fallback when porter empty; Levenshtein when trigram empty; source-scoping with global fallback; idempotent re-index doesn't double-add
2. Run `ak_test --file src/session-memory/store.test.ts` — verify FAIL
3. Implement schema + BM25 query + fallback ladder
4. Run `ak_test --file src/session-memory/store.test.ts` — verify PASS
5. Bench in-test: 1000-doc corpus, search p99 < 5ms (informational; this is not the hot path)
6. Run `ak_lint --file src/session-memory/store.ts src/session-memory/store.test.ts src/session-memory/types.ts` and `ak_typecheck --file src/session-memory/store.ts src/session-memory/store.test.ts src/session-memory/types.ts`

**Acceptance:**

- [x] All 5 test cases pass
- [x] `ak_lint` clean
- [x] `ak_typecheck` clean
- [x] No `any` types
- [x] better-sqlite3 dep added to package.json (or confirmed present)

#### [backend] Task 1.2: Session capture + snapshot + restore primitives

**Status:** done

**Depends:** None

Create `src/session-memory/session.ts` with the session-event log. Schema:
- `sessions(agent_id, snapshot_id, created_at, status, content_json)`
- `session_events(session_id, event_id, ts, tool_name, content)`

Methods:
- `captureEvent({ repoHash, event })` — append to log; <0.5ms target
- `snapshot({ repoHash, capMs })` — consolidate events into snapshot row; partial on timeout (eng-review D14)
- `restore({ repoHash, query })` — search recent events matching query, return top-k

`repoHash` is computed as the first 16 chars of SHA-256 of `git rev-parse --show-toplevel` output. Stable across sessions, unique per repo.

**Files:**

- Create: `src/session-memory/session.ts`
- Create: `src/session-memory/session.test.ts`
- Create: `src/session-memory/repo-hash.ts` (small util)
- Create: `src/session-memory/repo-hash.test.ts`

**Steps (TDD):**

1. Write tests: capture/snapshot/restore round-trip; snapshot timeout returns partial; concurrent capture from multiple processes doesn't corrupt (use better-sqlite3's WAL mode)
2. Run `ak_test --file src/session-memory/session.test.ts src/session-memory/repo-hash.test.ts` — verify FAIL
3. Implement
4. Run tests — verify PASS
5. `ak_lint` + `ak_typecheck` on all touched files

**Acceptance:**

- [x] All tests pass including concurrent-capture
- [x] `ak_lint` + `ak_typecheck` clean
- [x] Snapshot timeout produces partial gracefully
- [x] repoHash is deterministic and short

#### [backend] Task 1.3: HTTP fetch + index (for ak_fetch_index parity)

**Status:** done

**Depends:** None

Create `src/session-memory/fetch-index.ts` — fetch URL, detect content type, convert HTML→Markdown if needed, chunk, index into store.

For HTML→Markdown: use `node-html-markdown` or similar minimal dep for v1. v2 will move to `htmd` (Apache-2 Rust crate) for parity with context-mode behavior.

24h TTL cache in-process (Map keyed by URL → { ts, body }).

**Files:**

- Create: `src/session-memory/fetch-index.ts`
- Create: `src/session-memory/fetch-index.test.ts`

**Steps (TDD):**

1. Test: fetch HTML → markdown chunks → indexed
2. Test: fetch JSON → structured chunks → indexed
3. Test: 24h cache hit skips network
4. Test: timeout enforced via AbortSignal
5. Implement using native `fetch()` (Node 24+, refinement F7 v1 — undici not needed)

**Acceptance:**

- [x] All test cases pass
- [x] Uses native fetch, no undici dep added
- [x] Cache key is normalized URL

#### [docs] Task 1.4: README + session-memory guide

**Status:** done

**Depends:** None

Add "Session memory" section to README explaining: what it does, automatic enablement (no flag needed since zero cost), where data lives (`~/.webpresso/sessions/`), how to disable, privacy guarantee (zero cloud calls, no telemetry).

Create `docs/guides/session-memory.md` with the mental model: how event capture works, when snapshots fire, how restore is triggered, and the schema (so v2's invisibility claim is verifiable).

**Files:**

- Modify: `README.md`
- Create: `docs/guides/session-memory.md`

**Acceptance:**

- [x] README has "Session memory" section
- [x] Guide explains the schema + event flow
- [x] `ak_audit kind=docs-frontmatter` passes

### Phase 2: Hook wiring [Complexity: S-M]

#### [backend] Task 2.1: Create `src/hooks/post-tool/index.ts` dispatcher + wire session-capture

**Status:** done

**Depends:** Task 1.2

Currently `src/hooks/post-tool/` has only `lint-after-edit.ts` and the package.json `bin` field for `ak-post-tool` points directly to it (refinement F2/F9 v1). Create an `index.ts` dispatcher that:

1. Reads tool-result JSON from stdin
2. Calls `lint-after-edit` (preserving existing behavior)
3. Calls `session-capture` (new)
4. Writes JSON to stdout

Update `package.json` `bin` field: `"ak-post-tool": "./src/hooks/post-tool/index.ts"`.

**Files:**

- Create: `src/hooks/post-tool/index.ts` (dispatcher)
- Create: `src/hooks/post-tool/index.test.ts`
- Create: `src/hooks/post-tool/session-capture.ts` (the new module)
- Create: `src/hooks/post-tool/session-capture.test.ts`
- Modify: `package.json` (bin field)

**Steps (TDD):**

1. Test: dispatcher invokes both lint-after-edit and session-capture
2. Test: session-capture failure does NOT block lint-after-edit
3. Test: hot path budget — capture latency p99 < 100ms (informational; v2 raises bar)
4. Implement
5. Verify package.json bin entry resolves correctly

**Acceptance:**

- [x] Dispatcher tested with both modules
- [x] Failure isolation verified (one module breaks ≠ others fail)
- [x] package.json bin updated and verified
- [x] `ak_lint` + `ak_typecheck` clean

#### [backend] Task 2.2: Create `src/hooks/pre-compact/index.ts` + register PreCompact

**Status:** done

**Depends:** Task 1.2

PreCompact is not currently a hook in agent-kit (refinement F3 v1). Create the hook bin from scratch and register it in three places: package.json bin, `.claude/settings.json` template (in init scaffolder), and the hook entry itself.

The hook reads stdin, calls `session-memory.snapshot({ repoHash, capMs: 5000 })`, writes a one-line acknowledgement to stdout (or empty JSON `{}`).

**Files:**

- Create: `src/hooks/pre-compact/index.ts`
- Create: `src/hooks/pre-compact/index.test.ts`
- Modify: `package.json` (add bin entry: `"ak-pre-compact": "./src/hooks/pre-compact/index.ts"`)
- Modify: `src/cli/commands/init/scaffolders/scaffold-claude-settings.ts` (or wherever the .claude/settings.json template lives) — add PreCompact block

**Steps (TDD):**

1. Test: PreCompact with healthy DB → returns snapshot id, exits 0
2. Test: PreCompact with stalled DB → 5s cap fires, partial snapshot recorded, exits 0 (non-blocking)
3. Test: bin path resolves
4. Implement
5. Smoke: simulate compaction in scratch repo

**Acceptance:**

- [x] Tests pass including timeout
- [x] PreCompact registered in `.claude/settings.json` template
- [x] Bin entry verified

#### [backend] Task 2.3: Extend `src/hooks/sessionstart/index.ts` with compact-source restore

**Status:** done

**Depends:** Task 1.2

The current `src/hooks/sessionstart/index.ts` (refinement F4 v1: not `sessionstart-routing/`) already has conditional branches (env-driven routing). Add a new branch: when `source=compact` in the input JSON, call `session-memory.restore({ repoHash, query: lastUserPrompt })` and emit a `<session_knowledge>` directive into stdout.

**Files:**

- Modify: `src/hooks/sessionstart/index.ts`
- Modify: `src/hooks/sessionstart/index.test.ts`

**Steps (TDD):**

1. Test: source=compact + non-empty restore → `<session_knowledge>` block in stdout
2. Test: source=compact + empty restore → no block emitted
3. Test: source=startup → restore NOT called
4. Implement
5. End-to-end smoke: simulate compaction, verify agent gets restored context

**Acceptance:**

- [x] All branches tested
- [x] `<session_knowledge>` block format documented in code comment
- [x] `ak_lint` + `ak_typecheck` clean

### Phase 3: MCP tools [Complexity: S]

#### [backend] Task 3.1: ak_session_search MCP tool

**Status:** done

**Depends:** Task 1.1, 1.2

Add `src/mcp/tools/session-search.ts` (refinement F5 v1: filename without `ak-` prefix). Auto-discovered by `src/mcp/server.ts`'s discover mechanism (refinement F13 v1: no manual registration needed). Mirrors the pattern of existing `src/mcp/tools/lint.ts`.

Input schema: `{ query: string, limit?: number, source?: string }`. Output: array of hits with `{ title, snippet, ts, source }`.

**Files:**

- Create: `src/mcp/tools/session-search.ts`
- Create: `src/mcp/tools/session-search.test.ts`

**Acceptance:**

- [x] Auto-discovered by MCP server (no manual register edit)
- [x] Returns structured results, not raw store payloads
- [x] `ak_lint` + `ak_typecheck` clean

#### [backend] Task 3.2: ak_session_snapshot MCP tool (manual snapshot)

**Status:** done

**Depends:** Task 1.2

Manual snapshot tool for agents to call before branch switches or risky operations. Input: `{}` (uses current repoHash). Output: `{ snapshotId, eventsIncluded }`.

**Files:**

- Create: `src/mcp/tools/session-snapshot.ts`
- Create: `src/mcp/tools/session-snapshot.test.ts`

**Acceptance:**

- [x] Tool returns snapshot id usable by ak_session_restore
- [x] `ak_lint` + `ak_typecheck` clean

#### [backend] Task 3.3: ak_session_restore MCP tool

**Status:** done

**Depends:** Task 1.2

Manual restore tool. Input: `{ snapshotId?, query? }`. Either restore from a specific snapshot id OR restore by semantic-ish query (FTS5 keyword match).

**Files:**

- Create: `src/mcp/tools/session-restore.ts`
- Create: `src/mcp/tools/session-restore.test.ts`

**Acceptance:**

- [x] Both restore modes tested
- [x] `ak_lint` + `ak_typecheck` clean

#### [backend] Task 3.4: ak_session_capture MCP tool (manual event capture)

**Status:** done

**Depends:** Task 1.2

Lets agents record their own decisions/notes outside tool-call events. Input: `{ content: string, tags?: string[] }`.

**Files:**

- Create: `src/mcp/tools/session-capture.ts`
- Create: `src/mcp/tools/session-capture.test.ts`

**Acceptance:**

- [x] Manual events visible via ak_session_search
- [x] `ak_lint` + `ak_typecheck` clean

### Phase 4: Setup orchestration + migration [Complexity: M]

#### [infra] Task 4.1: scaffold-session-memory.ts (init step) + migration

**Status:** done

**Depends:** Task 2.1, 2.2, 2.3, 3.1

Add `src/cli/commands/init/scaffolders/scaffold-session-memory.ts` — runs as part of `wp setup` (refinement F1 v1: integrates into existing `init/scaffolders/` pattern, NOT a new `setup/` directory).

Responsibilities:
1. Ensure `~/.webpresso/sessions/` directory exists
2. Detect context-mode entries in `.claude-plugin/plugin.json` (refinement F13 v1: not `.mcp.json` which doesn't exist) and remove them with timestamped backup
3. Idempotent re-run: detecting existing setup is no-op
4. Failure modes: backup-write failure → abort migration with clear error

**Files:**

- Create: `src/cli/commands/init/scaffolders/scaffold-session-memory.ts`
- Create: `src/cli/commands/init/scaffolders/scaffold-session-memory.test.ts`
- Modify: `src/cli/commands/init/index.ts` — wire the new scaffolder into the orchestrator

**Steps (TDD):**

1. Test: clean install (no context-mode) — no-op
2. Test: standard install — context-mode removed from plugin.json, backup written
3. Test: idempotent re-run
4. Test: malformed plugin.json — preserved, warning logged
5. Test: backup file format `<filename>.pre-session-memory-backup.<timestamp>.json`
6. Implement

**Acceptance:**

- [x] All 5 test cases pass
- [x] Migration documented in README
- [x] Backup restore command documented

#### [qa] Task 4.2: gstack-routing + context-mode-routing rule updates

**Status:** done

**Depends:** Task 4.1

Per refinement F8/F14 v1: lane-2 ownership lives in `catalog/agent/rules/context-mode-routing.md`, not `gstack-routing.md`. Update the canonical lane-2 rule to:

1. Mark context-mode as deprecated
2. State that `ak_session_*` is the new lane-2 surface
3. Link to the v1 blueprint as the implementation record

Also update `catalog/agent/rules/gstack-routing.md`'s 4-lane table to reflect the new lane-1+lane-2 unification under agent-kit.

**Files:**

- Modify: `catalog/agent/rules/context-mode-routing.md`
- Modify: `catalog/agent/rules/gstack-routing.md`

**Acceptance:**

- [x] Both rules updated and cross-link
- [x] `ak_audit kind=docs-frontmatter` passes
- [x] Old context-mode references replaced with ak_session_* recommendations

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `ak_typecheck --package agent-kit` | Zero errors |
| Lint | `ak_lint --file <touched>` | Zero violations |
| Unit tests | `ak_test --file <touched>` | All pass |
| Full QA | `ak_qa` | All pass |
| Hot path perf | bench in session-capture.test.ts | p99 < 100ms (informational; v2 raises bar) |
| Smoke test | `wp setup` in scratch repo + simulated compaction | Restore returns relevant content |
| Migration | `wp setup` with context-mode in `.claude-plugin/plugin.json` | Removed, backup written |
| Audit | `ak_audit kind=blueprint-lifecycle` | Blueprint passes |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | None      |              |
| Downstream | `ak-session-memory-v2-rust-ctx-rs-engine-swap-via-napi-rs-same-schema` (v2) | v2 swaps engine to Rust; SAME on-disk schema; migration is invisible |
| Supersedes | `ak-session-memory-via-letta-adapter-...` (parked) | Parked v1 chose Letta; this v1 chose in-process TS engine after refinement |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| better-sqlite3 native binding not available for user's platform | Hook crash → tool calls fail | Catch import error in session-memory entry; ak_session_* tools return `unavailable`; agent-kit continues to work | All Phase 1 |
| SQLite WAL file locked by concurrent process | Capture write fails | better-sqlite3 retries with BUSY_TIMEOUT; on persistent failure, log + return success (non-blocking) | 1.2, 2.1 |
| `~/.webpresso/sessions/` directory not writable | Setup fails opaquely | Detect at setup time, print clear error + opt-out flag | 4.1 |
| Repo hash collision (extremely unlikely with 16-char prefix) | Two repos share session DB | 16 hex chars = 64 bits; collision probability negligible. Documented limitation | 1.2 |
| `.claude-plugin/plugin.json` malformed during migration | Setup destroys config | Migration reads + validates first; on parse error, preserve unchanged + log warning | 4.1 |
| PreCompact stalls > 5s | Silent loss of session continuity | 5s cap + partial snapshot + observable log line (D14) | 2.2 |
| User has context-mode for non-agent-kit reasons | Hard migration removes their config | Backup file always written; restore command documented; user can opt out via `--keep-context-mode` flag | 4.1 |
| FTS5 absent in user's SQLite (rare on modern systems) | Engine fails to initialize | better-sqlite3 ships its own SQLite with FTS5 (refinement F1 v2); CI tests verify | 1.1 |

## Non-goals

- Polyglot executor (`ctx_execute` / `ctx_execute_file` / `ctx_batch_execute`) — research showed real value but out of v1 scope. Considered for v3 if demand surfaces.
- Vector / semantic search — FTS5 keyword + porter + trigram + Levenshtein covers tool-call indexing well. Vector search is a different problem (user-preference memory like mem0); not what we need.
- 13 of context-mode's 15 platform adapters — Claude Code + Gemini CLI (stdio MCP) only.
- Cloud / multi-tenant session sync — strictly local SQLite per project.
- LLM-driven fact extraction (mem0's killer feature) — wrong tool for tool-call indexing.
- ctx_insight analytics dashboard — `rtk gain`-style telemetry adequate.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| better-sqlite3 doesn't ship a prebuilt binary for an ingest-lens dev's exotic platform | `pnpm add` fails, agent-kit becomes unusable | Catch import failure at session-memory entry; ak_session_* tools degrade to `unavailable`; document supported platforms (linux/darwin/windows × x64/arm64) |
| Schema drift between v1 (TS) and v2 (Rust) breaks the "engine swap" promise | v2 migration becomes a re-ingest | Schema is documented in this blueprint as the contract; v2 task includes byte-identity test against v1 SQL |
| Hot path latency creeps over budget as event log grows | Interactive feel degrades | OPTIMIZE every 50 inserts; bench guard in CI; v2 brings hard SLO via Rust |
| WAL checkpoint stalls under heavy concurrent capture | DB grows unboundedly | better-sqlite3 default checkpoint cadence + manual WAL_CHECKPOINT in periodic task |
| Pretool guard hooks block agents from using ak_session_* MCP tools | Agents can't capture state | Verify ak_session_* MCP names are in any pretool allowlist or routing block |
| Schema becomes load-bearing for v2 — locking us in | v2 design constrained by v1 mistakes | Schema reviewed in v2 blueprint planning; if breaking change needed, document migration in v2 |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Engine runtime | TypeScript (in-process) | matches agent-kit's Node ≥24 | Sub-ms hot path; zero IPC cost; matches v2 engine via napi-rs FFI later |
| SQLite | better-sqlite3 | ^11 | Mature sync API; bundled SQLite ships FTS5 (refinement F1/F3 v2 verified) |
| FTS tokenizers | porter unicode61 + trigram (built-in to FTS5) | n/a | Refinement F2 v2: only built-ins are accessible without raw FFI; built-ins cover our needs |
| HTML→Markdown | node-html-markdown or similar | latest stable | v1 keeps it minimal; v2 moves to htmd Apache-2 Rust crate for parity |
| HTTP client | native Node fetch (Node 24+) | n/a | Refinement F7 v1: undici not needed |
| MCP SDK | `@modelcontextprotocol/sdk` (existing pinned version in agent-kit) | as pinned | Already in use |
| Hash for repo id | `node:crypto` SHA-256, first 16 chars hex | n/a | No external dep; deterministic |
| Test runner | vitest | as pinned in agent-kit | Refinement F11 v1: existing convention |
| Lifecycle audit | `ak_audit kind=blueprint-lifecycle` | existing | Standard repo gate |

## Refinement summary

| Metric | Value |
| ------ | ----- |
| Findings total | 28 (across v1 + v2 fact-check) |
| Critical | 6 |
| High | 9 |
| Medium | 11 |
| Low | 2 |
| Architecture-invalidating | 1 (Letta hierarchy is internal-only — triggered re-decide) |
| Re-decided backend | mcp-memory-service candidate also dropped in favor of in-process TS engine |
| Cross-plans updated | 1 (parked v1 + v2 reference this as supersession) |
| Edge cases documented | 8 |
| Risks documented | 6 |
| **Parallelization score** | A (RW0=4, CPR=3.40, CP=0) |
| **Critical path** | 5 waves |
| **Total tasks** | 17 (13 original + 4 Phase 5 output sandboxing) |
| **Blueprint compliant** | 17/17 |

---

### Phase 5: Output Sandboxing (context-mode replacement parity) [Complexity: S-M]

#### Task 5.1: `ak_session_execute` — single-command output sandboxing

**Status:** done

**Depends:** Task 4.2

**Files:**
- `src/mcp/tools/session-execute.ts`
- `src/mcp/tools/session-execute.test.ts`

**Purpose:** Replaces `ctx_execute` — runs a shell command via `execa` async streaming, indexes output >2KB into FTS5 as chunks arrive (no full-buffer memory spike), returns compact summary. Never throws.

**Acceptance:**
- [x] small output returned directly (< 2KB threshold)
- [x] large output indexed with label as FTS5 source prefix; summary returned
- [x] `query` param triggers FTS5 search over indexed content
- [x] error returns structured envelope `{ error, exitCode: -1 }`
- [x] streaming: chunks indexed as they arrive via `for await` — no memory spike

#### Task 5.2: `ak_session_batch_execute` — parallel batch with search

**Status:** done

**Depends:** Task 5.1

**Files:**
- `src/mcp/tools/session-batch-execute.ts`
- `src/mcp/tools/session-batch-execute.test.ts`

**Purpose:** Replaces `ctx_batch_execute` — runs N commands via `p-queue` concurrency control, indexes all large outputs, searches across all results in one round trip.

**Acceptance:**
- [x] concurrency respects max 8 (via `p-queue` 8.x)
- [x] per-task 60s timeout via p-queue `throwOnTimeout: false`
- [x] all outputs ≥2KB indexed with label as FTS5 source prefix
- [x] `queries` param returns cross-command hits ranked by BM25

#### Task 5.3: Expanded PostToolUse capture coverage

**Status:** done

**Depends:** Task 2.1 (post-tool dispatcher)

**Files:**
- `.claude-plugin/plugin.json`
- `src/hooks/post-tool/session-capture.ts`

**Purpose:** Extends automatic capture from `Bash|Edit|Write|MultiEdit` to also cover `Read|Grep|WebFetch|mcp__*`, broadening the session memory event log.

**Acceptance:**
- [x] Read tool events captured with file path as label
- [x] Grep tool events captured with pattern + match count summary
- [x] WebFetch tool events captured with URL + truncated body (first 500 chars)
- [x] `mcp__*` tool events captured with tool name + structured output summary

#### Task 5.4: Routing guidance — nudge Claude toward `ak_session_execute`

**Status:** done

**Depends:** Task 4.2, Task 5.1

**Files:**
- `src/hooks/shared/routing-block.ts`
- `catalog/agent/rules/context-mode-routing.md`

**Purpose:** SessionStart routing block tells Claude to route large-output commands through `ak_session_execute` instead of raw Bash. Updates canonical lane-2 routing rule to reference `ak_session_execute` as replacement for `ctx_execute`.

**Acceptance:**
- [x] `AK_ROUTING_BLOCK` includes `ak_session_execute` decision row for large-output Bash commands
- [x] `catalog/agent/rules/context-mode-routing.md` updated to reference `ak_session_execute`

---

### Phase 6: PR Review Hardening [Complexity: XS]

> Applies to the `feat/ak-session-memory-v1-rebased-onto-main` branch.
> Source: pr-review-toolkit silent-failure-hunter (11 findings: 6 HIGH + 5 MEDIUM).
> All Phase 1-5 code is complete; Phase 6 adds quality hardening before merge.

#### Task 6.1: Extract `ISessionStore` interface; remove `BunSqliteStore as any`

**Status:** done

**File:** `src/session-memory/store.ts`

Add `export type ISessionStore` extracted from `SessionStore`'s public surface.
Change `getStore()` return type from `BunSqliteStore as any` to `ISessionStore`.
Replace cast with `as unknown as ISessionStore` + comment explaining structural compatibility.

**Acceptance:**
- [x] `ISessionStore` exported from `store.ts`
- [x] `registry` typed `Map<string, ISessionStore>`
- [x] `getStore()` returns `ISessionStore`
- [x] No `as any` at call site

#### Task 6.2: Replace bare `catch {}` in `searchPorter()` and `searchTrigram()`

**Status:** done

**File:** `src/session-memory/store.ts`

Replace bare `catch {}` with `catch (err: unknown)` + `process.stderr.write` so DB errors
are observable by operators without breaking the "never throw from search" invariant.

**Acceptance:**
- [x] Both methods use `catch (err: unknown)`
- [x] Both write to stderr with safe `err instanceof Error ? err.message : String(err)` narrowing

#### Task 6.3: Replace bare `catch {}` in `updateVocabulary()`

**Status:** done

**File:** `src/session-memory/store.ts`

Same `process.stderr.write` pattern as Task 6.2.

**Acceptance:**
- [x] `updateVocabulary` catch is `catch (err: unknown)` with stderr write

#### Task 6.4: Add `error?: string` discriminator to `SnapshotResult`

**Status:** done

**File:** `src/session-memory/types.ts`

Add optional `readonly error?: string` field so callers can distinguish timeout
from write error from clean success.

**Acceptance:**
- [x] `SnapshotResult.error?` added
- [x] `session.ts` snapshot catch returns `{ ..., error: msg }`

#### Task 6.5: Safe error narrowing in `session.ts` and `pre-compact/index.ts`

**Status:** done

**Files:** `src/session-memory/session.ts`, `src/hooks/pre-compact/index.ts`

Replace all `(err as Error).message` with safe narrowing `err instanceof Error ? err.message : String(err)`.
Change all `catch (err)` to `catch (err: unknown)`.

**Acceptance:**
- [x] All 4 catch sites use `catch (err: unknown)` + safe narrowing

#### Task 6.6: p-queue timeout label + stderr log in `session-batch-execute.ts`

**Status:** done

**File:** `src/mcp/tools/session-batch-execute.ts`

When a task times out (`r == null` from `throwOnTimeout: false`), return summary
`'[timeout after 60s]'` and emit a `process.stderr.write` line so operators can
distinguish timed-out tasks from real command failures.

**Acceptance:**
- [x] Timeout path returns `'[timeout after 60s]'` (not `'timed out'`)
- [x] `process.stderr.write` line emitted on timeout
- [x] Explicit type annotation on `.then()` callback to fix TS7006

#### Task 6.7: Comment cleanup

**Status:** done

**Files:** `src/hooks/sessionstart/index.ts` (broken docstring), multiple (what-not-why comments)

Fix broken sentence in `buildOutput` docstring. Remove what-not-why comments that
restate the assignment below them.

**Acceptance:**
- [x] No broken docstrings in touched files
- [x] No comments that just restate what the next line does
