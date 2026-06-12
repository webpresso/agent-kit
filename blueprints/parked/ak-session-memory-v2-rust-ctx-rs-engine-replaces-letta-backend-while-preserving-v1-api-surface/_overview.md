---
type: blueprint
title: wp session memory v2 — Rust ctx-rs engine (replaces Letta, preserves v1 API)
status: parked
complexity: L
owner: agent-kit
created: '2026-05-13'
last_updated: '2026-06-11'
progress: 'Parked and superseded as canonical v2 planning on 2026-06-11: preserve the historical Letta-era findings, but the only surviving delivery lane is PR #95 (`feat/ak-session-memory-v2-rebased-onto-main`)'
depends_on:
  - ak-session-memory-via-letta-adapter-permissive-replacement-for-context-mode-session-resume-tool-output-indexing
parked_reason: |
  Depends on v1 (also parked). v1's backend choice is being re-decided
  after /plan-refine Phase 1 invalidated the original Letta motivation.
  Once v1 picks a new backend, v2 will be revised to match the new v1
  API surface (the "preserve API while swapping engine" thesis still
  holds; only the v1 API shape may change).
  Independent v2 findings from /plan-refine that survive a v1 re-decide:
   - rmcp current version is 1.6 (not 0.16), Apache-2.0 (not MIT)
   - rusqlite is 0.39+; FTS5 has no Cargo feature flag (built into bundled SQLite)
   - criterion at 0.8; does NOT natively gate CI on SLOs (need parse-and-gate script)
   - cargo-mutants config path is .cargo/mutants.toml (not .cargo-mutants.toml)
   - napi 3.8 / napi-derive 3.5 / @napi-rs/cli 3.6; MSRV 1.88
   - Windows is NOT flaky in 2026 — promote to first-class target
   - MemoryPilot is now source-available, NOT permissive — drop reference;
     use alphaonedev/ai-memory-mcp (MIT) as comparable instead
  PARKED pending v1 redirection. This blueprint is no longer the canonical
  delivery record for session-memory v2; PR #95's in-progress ctx-rs-only
  blueprint owns current branch truth.
tags:
  - session-memory
  - rust
  - ctx-rs
  - napi-rs
  - mcp
  - lane-2
  - performance
  - parked-pending-v1
---

# wp session memory v2 — Rust ctx-rs engine (replaces Letta, preserves v1 API)

> **Historical only:** this parked blueprint describes a now-obsolete standalone
> `ctx-rs` package + prebuilt publish path. The surviving delivery lane vendors
> ctx-rs source inside agent-kit and does not depend on a separate npm package
> or release workflow. Keep this file only as historical planning context.

## Product wedge anchor

- **Stage outcome:** Same as v1 stage outcome (Lane 2 permissive), **plus** webpresso owns the engine — no upstream coupling to Letta, no docker/postgres dependency for consumers, hot-path latency drops from ~50-100ms (HTTP) to <2ms (FFI). Roadmap cite: webpresso open-sourcing extraction roadmap, Wave 2+ (post-v1 ship).
- **Consuming surface:** Same MCP tool surface as v1 (`wp_session_capture`, `wp_session_snapshot`, `wp_session_restore`, `wp_session_search`), **same setup command** (`wp setup --with session-memory`). Historical note: this parked plan assumed a standalone `ctx-rs` package loaded via npm-published prebuilt binaries; the surviving lane vendors ctx-rs source inside agent-kit instead.
- **New user-visible capability:** After this lands, the same consumer using v1 today removes their Letta docker-compose dependency (one-line note from `wp setup`) and gets sub-millisecond session-capture latency. The interactive feel of "agent uses session memory" goes from "noticeable HTTP hop" to "invisible". `rtk gain`-style telemetry on session-capture overhead becomes observable.

## Problem Statement

v1 ships a working permissive session-memory layer, but the Letta+Postgres stack
has three rough edges that v1 cannot fix:

1. **Setup weight.** Consumers must have docker + ~500MB on disk + a running
   docker-compose service. ingest-lens devs work on laptops; this is a real
   ask.
2. **Hot path latency.** Every PostToolUse fires an HTTP round-trip to Letta
   (~50-100ms). Over a 300-tool-call session that's 15-30s of cumulative
   overhead. Users feel it.
3. **Upstream coupling.** Letta is excellent upstream software, but their
   API churn is theirs to schedule, not ours. webpresso's roadmap should not
   wait on Letta version bumps.

v2 keeps v1's API surface stable (no consumer code change) and rewrites the
engine in Rust:

- **Historical note:** this parked plan assumed a standalone `ctx-rs` repo/package plus npm-published prebuilt binaries. The surviving lane kept the Rust engine but moved the delivery contract in-repo via vendored source inside agent-kit.

The v2 cut is constrained: it MUST keep the `wp_session_*` MCP tool shapes
identical to v1 so consumers see no behavior change beyond "it got faster
and lost the docker dependency."

## Architecture Overview

```text
                    END-USER CLAUDE CODE
                            │
                            │ tool invocations
                            ▼
┌────────────────────────────────────────────────────────────┐
│ HOOK CHAIN (rtk → ak — unchanged from v1)                   │
│                                                              │
│  PreToolUse:    rtk-pretool-guard ──▶ ak-pretool-guard      │
│                                                              │
│  Tool fires                                                  │
│                                                              │
│  PostToolUse:   rtk-posttool ──▶ ak-post-tool               │
│                                       │                      │
│                                       ▼  napi-rs FFI (sync)  │
│                                  ctx-rs (Rust)               │
│                                  ├ index()                   │
│                                  ├ search()                  │
│                                  ├ snapshot()                │
│                                  ├ restore()                 │
│                                  └ SQLite + FTS5 (rusqlite)  │
│                                                              │
│  PreCompact:    ak-pre-compact (ctx-rs snapshot, capped)    │
│  SessionStart:  ak-sessionstart-routing                     │
│                  └─ on source="compact": ctx-rs restore     │
└────────────────────────────────────────────────────────────┘

LANE MODEL (same as v1, faster + lighter):
  1  agent-kit + ctx-rs (FFI)   wp_session_*    MIT (both)
  2  current default context lane  context-mode/ctx_*  Elastic-2.0 external
  3  rtk (upstream)             bash filter     MIT
  4  gstack (upstream)          /skill          MIT

CRATE STRUCTURE (webpresso/ctx-rs/):
  ctx-rs/
  ├── crates/
  │   ├── ctx-rs-core/        Pure Rust engine (rusqlite + tantivy + chunking)
  │   │   └── src/
  │   │       ├── store.rs    SQLite + FTS5 schema, BM25 + porter + trigram
  │   │       ├── session.rs  Snapshot, restore, event capture
  │   │       ├── search.rs   3-tier fallback (porter → trigram → Levenshtein)
  │   │       └── chunk.rs    Markdown-aware chunking (text-splitter + tiktoken-rs)
  │   └── ctx-rs-napi/        napi-rs bindings — exposes core to Node
  │       └── src/lib.rs      #[napi] wrappers, sync calls, prebuilt CI
  └── npm/
      └── (obsolete) standalone npm wrapper package — superseded by vendored delivery

DATA FLOW (same as v1 from consumer's POV):
  tool result JSON  ──▶  ak-post-tool.ts  ──▶  ctx-rs.index(payload)  [<1ms FFI]
  on PreCompact:       ak-pre-compact.ts  ──▶  ctx-rs.snapshot(cap=5s)
  on SessionStart:     ak-sessionstart.ts ──▶  ctx-rs.restore(query)
                                                  ──▶ inject <session_knowledge>
```

## Key Decisions

(All carried over from the eng-review locks unless noted as a v2-specific
refinement.)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Engine language | Rust | Eng-review D1 + library survey: ~10K LOC total with mature crates |
| Crate home | New repo `webpresso/ctx-rs/` | Eng-review D3'. Mirrors framework/runtime extraction pattern |
| Scope | Core only — FTS5 + session + compression. NO polyglot executor in v2 | Eng-review D2. ctx_execute / ctx_batch_execute deferred to v3 if demand |
| FTS engine | rusqlite (SQLite + FTS5) | Library survey: simpler than tantivy for our scale; same data model as MemoryPilot's adopt-don't-build pattern |
| Embedded search ranking | BM25 (FTS5 default) + porter stemming + trigram + Levenshtein fallback | Three-tier fallback per context-mode's original design; behavior parity goal |
| Node integration | napi-rs sync FFI (historical plan assumed prebuilt package) | Eng-review D4 + D8. Surviving lane vendors the source instead. |
| MCP tool surface | `wp_session_capture` / `wp_session_snapshot` / `wp_session_restore` / `wp_session_search` — IDENTICAL to v1 shapes | Migration must be invisible to consumers |
| TS shim thickness | Thin (eng-review D9): TS reads stdin, calls ctx-rs.index, writes stdout. ~20 LOC per hook | All logic in Rust |
| Hot path SLO | p99 < 2ms, p50 < 0.5ms (eng-review D12) | Benchmark suite gates CI |
| Migration from v1 | Background data port: v2 ships a `ctx-rs migrate-from-letta` subcommand that reads Letta's archival memory + reinserts into ctx-rs SQLite | One-time cost; consumer runs it once during `wp setup` upgrade |
| napi-rs platform fallback | Historical package-era fallback note only | Superseded by vendored delivery |
| PreCompact timeout cap | 5s (same as v1) with partial snapshot on timeout (eng-review D14) | Carried over; cheaper to enforce in Rust |
| Mutation score parity | Behavior parity only (TP3 reframed): cargo-mutants ≥ 70% AND fixture-replay tests against v1 Letta outputs | Cross-language mutation subtraction is incoherent (outside voice TP3) |
| Distribution | Historical standalone crate/package concept only | Superseded by vendored ctx-rs source inside agent-kit |
| Letta deprecation | v2 ships, then v2.1 removes Letta adapter code from agent-kit (one minor release later) | Soft transition; consumers can downgrade if needed |

## Quick Reference (Execution Waves)

| Wave              | Tasks                       | Dependencies | Parallelizable |
| ----------------- | --------------------------- | ------------ | -------------- |
| **Wave 1**        | 1.1, 1.2, 1.3               | None         | 3 agents       |
| **Wave 2**        | 2.1, 2.2                    | Wave 1       | 2 agents       |
| **Wave 3**        | 3.1, 3.2                    | Wave 2       | 2 agents       |
| **Wave 4**        | 4.1, 4.2, 4.3               | Wave 3       | 3 agents       |
| **Wave 5**        | 5.1, 5.2                    | Wave 4       | 2 agents       |
| **Critical path** | 1.1 → 2.1 → 3.1 → 4.1 → 5.1 | --           | 5 waves        |

### Phase 1: ctx-rs core crate scaffold + storage [Complexity: M]

#### [backend] Task 1.1: Scaffold webpresso/ctx-rs/ workspace + ctx-rs-core crate

**Status:** todo

**Depends:** None

Create the new repo `webpresso/ctx-rs/` (not a directory in agent-kit; a sibling). Initialize Cargo workspace with two crates: `ctx-rs-core` (pure Rust) and `ctx-rs-napi` (FFI bindings). Set up `clippy`, `rustfmt`, `cargo deny` for license + duplicate dep enforcement.

The core crate uses these dependencies (all Apache-2 / MIT, all permissive — verified in `docs/research/permissive-rust-libraries.md`):

- `rusqlite` 0.32+ with `bundled-sqlcipher` feature off, `fts5` feature on
- `rmcp` 0.16+ (Anthropic official MCP SDK) — used only for the optional MCP-peer mode in v3, NOT v2
- `text-splitter` 0.29+ with `tiktoken-rs` feature for chunking
- `tantivy` is NOT in v2 — rusqlite's FTS5 covers our scale (deferred to v3 if profiles show need)

**Files:**

- Create: `webpresso/ctx-rs/Cargo.toml` (workspace manifest)
- Create: `webpresso/ctx-rs/crates/ctx-rs-core/Cargo.toml`
- Create: `webpresso/ctx-rs/crates/ctx-rs-core/src/lib.rs` (empty entry)
- Create: `webpresso/ctx-rs/deny.toml` (cargo-deny config: forbid GPL/AGPL/BUSL/SSPL/ELv2)
- Create: `webpresso/ctx-rs/rust-toolchain.toml` (pin stable)
- Create: `webpresso/ctx-rs/.github/workflows/check.yml` (clippy + fmt + test + deny)

**Acceptance:**

- [ ] `cargo check` passes from clean clone
- [ ] `cargo deny check` passes; license allowlist enforced
- [ ] CI workflow green on linux + macos
- [ ] README states "Apache-2 / MIT dual license" up front

#### [backend] Task 1.2: SQLite + FTS5 store with three-tier search

**Status:** todo

**Depends:** Task 1.1

Implement `ctx-rs-core/src/store.rs`. Schema:

- `sources(id, label, indexed_at, chunk_count)`
- `chunks` FTS5 virtual table with porter unicode61 tokenizer
- `chunks_trigram` FTS5 virtual table with trigram tokenizer
- `vocabulary(term, idf_score)` for Levenshtein fallback

Implement search with three-tier fallback (port directly from context-mode's `searchWithFallback` — credit upstream in source comments):

1. BM25 query against `chunks` (porter) — if results, return
2. Trigram substring match against `chunks_trigram` — if results, return
3. IDF-weighted Levenshtein against `vocabulary` — return suggestions

Source scoping: if `source` provided, search scoped to that source_id first; fall back to global if empty.

Performance: `PRAGMA mmap_size = 268435456` (256MB), `OPTIMIZE` every 50 inserts.

**Files:**

- Create: `webpresso/ctx-rs/crates/ctx-rs-core/src/store.rs`
- Create: `webpresso/ctx-rs/crates/ctx-rs-core/src/store_tests.rs` (integration tests)
- Create: `webpresso/ctx-rs/crates/ctx-rs-core/tests/fixtures/` (corpus + expected results from v1 Letta runs, for behavior parity)

**Steps (TDD):**

1. Write failing test: insert 100 docs, search "foo" → expected top-5 matches
2. Run `cargo test -p ctx-rs-core store_tests` — verify FAIL
3. Implement schema + BM25 query
4. Add trigram fallback test
5. Add Levenshtein fallback test
6. Add source-scoping test (scope + fallback to global)
7. Property test: idempotent re-index doesn't double-add
8. Bench: 1000-doc corpus, search p99 < 5ms

**Acceptance:**

- [ ] All 7 test cases pass
- [ ] Property tests pass (10K cases)
- [ ] Benchmark hits target
- [ ] Behavior parity fixtures match within ranking tolerance

#### [backend] Task 1.3: Session snapshot + restore primitives

**Status:** todo

**Depends:** Task 1.1

Implement `ctx-rs-core/src/session.rs`. Schema:

- `sessions(agent_id, snapshot_id, created_at, status, content_json)`
- `session_events(session_id, event_id, ts, tool_name, content)` for the rolling event log

Methods:

- `capture_event(agent_id, event)` — append to event log; ~0.5ms
- `snapshot(agent_id, max_duration_ms)` — consolidate events into a snapshot row; partial on timeout (D14)
- `restore(agent_id, query)` — search recent events matching query, return top-k

The "memory hierarchy" semantics from Letta are NOT replicated in v2. Instead, v2 uses a flat event log + on-demand search. Map from Letta semantics:

- Letta `archival_memory_insert` → ctx-rs `capture_event`
- Letta `recall_memory_query` → ctx-rs `restore` with FTS5 query

**Files:**

- Create: `webpresso/ctx-rs/crates/ctx-rs-core/src/session.rs`
- Create: `webpresso/ctx-rs/crates/ctx-rs-core/tests/session_test.rs`

**Steps (TDD):**

1. Write tests for: capture, snapshot, restore round-trip
2. Test snapshot timeout produces partial result, not panic
3. Test concurrent capture from multiple threads doesn't corrupt
4. Implement

**Acceptance:**

- [ ] All tests pass
- [ ] Snapshot timeout returns partial gracefully
- [ ] Concurrent capture tested with loom or similar

### Phase 2: napi-rs FFI bindings [Complexity: M]

#### [backend] Task 2.1: ctx-rs-napi crate with sync FFI surface

**Status:** todo

**Depends:** Task 1.2, 1.3

Implement the napi-rs binding crate. Exposes four functions (sync for hot path per eng-review D8):

```rust
#[napi]
pub fn index(db_path: String, payload: String) -> Result<()> { ... }

#[napi]
pub fn search(db_path: String, query: String, limit: u32) -> Result<Vec<SearchHit>> { ... }

#[napi]
pub fn snapshot(db_path: String, agent_id: String, max_ms: u32) -> Result<SnapshotResult> { ... }

#[napi]
pub fn restore(db_path: String, agent_id: String, query: String) -> Result<Vec<EventHit>> { ... }
```

Plus one async function for fetch+index (D8 carve-out):

```rust
#[napi]
pub async fn fetch_and_index(db_path: String, url: String) -> Result<FetchResult> { ... }
```

Each function maps Rust errors to typed Node errors (no panics across FFI boundary).

**Files:**

- Create: `webpresso/ctx-rs/crates/ctx-rs-napi/Cargo.toml`
- Create: `webpresso/ctx-rs/crates/ctx-rs-napi/src/lib.rs`
- Create: `webpresso/ctx-rs/crates/ctx-rs-napi/src/types.rs` (SearchHit, SnapshotResult, etc.)
- Create: `webpresso/ctx-rs/crates/ctx-rs-napi/build.rs` (napi-rs build config)

**Acceptance:**

- [ ] `cargo build -p ctx-rs-napi --release` produces a .node file
- [ ] Manual smoke from Node: import, call each function, results round-trip
- [ ] Rust panics caught and converted to Node errors (no segfault path)

#### [infra] Task 2.2: Historical standalone prebuild/publish pipeline (obsolete)

**Status:** todo

**Depends:** Task 2.1

GitHub Actions workflow that builds the .node binary for all supported triples:

- linux-x64-gnu, linux-arm64-gnu
- darwin-x64, darwin-arm64
- (windows-x64-msvc — best-effort, gracefully-disable if it fails)

Historical only: this parked plan described a standalone publish path with per-platform npm packages. That path has been removed from the surviving delivery lane.

**Files:**

- Create: `webpresso/ctx-rs/.github/workflows/release.yml`
- Create: `webpresso/ctx-rs/npm/package.json` (wrapper)
- Create: `webpresso/ctx-rs/npm/index.js` (host-triple detection)

**Acceptance:**

- [ ] Release workflow green on tag push
- [ ] (obsolete) standalone package install proof
- [ ] Missing-triple path returns a clear error message (not a stack trace)

### Phase 3: Backend swap in agent-kit [Complexity: M]

#### [backend] Task 3.1: Replace ak-post-tool's Letta call with ctx-rs FFI

**Status:** todo

**Depends:** Task 2.2

Swap the Letta HTTP client used in v1's `ak-post-tool` for ctx-rs. Historical note: this parked plan assumed a standalone package; the surviving lane vendors ctx-rs source instead.

Behind a feature flag `WP_SESSION_BACKEND=ctx-rs|letta` so consumers can roll back if v2 has issues. Default to `ctx-rs` once v2 ships; document the flag in the migration guide.

**Files:**

- Modify: `src/hooks/post-tool/session-capture.ts` (from v1)
- Modify: `package.json` — (obsolete in this parked plan; surviving lane does not add an external ctx-rs dependency)
- Modify: `src/session-memory/backend.ts` (new abstraction layer for backend selection)

**Acceptance:**

- [ ] Backend selector respects WP_SESSION_BACKEND env var
- [ ] ctx-rs path passes the same hot-path tests as v1's Letta path
- [ ] Hot path p99 < 2ms measured (eng-review D12 enforced)

#### [backend] Task 3.2: Swap ak-pre-compact + ak-sessionstart-routing

**Status:** todo

**Depends:** Task 2.2

Same backend swap pattern for the snapshot + restore hooks. Behind the same env flag.

**Files:**

- Modify: `src/hooks/pre-compact/index.ts` (from v1)
- Modify: `src/hooks/sessionstart-routing/index.ts` — compact-source branch

**Acceptance:**

- [ ] Snapshot + restore work end-to-end via ctx-rs
- [ ] 5s cap enforced (parity with v1)
- [ ] Smoke: full compaction → restore cycle in scratch repo

### Phase 4: Migration tooling + parity gates [Complexity: M]

#### [infra] Task 4.1: `wp session migrate-from-letta` subcommand

**Status:** todo

**Depends:** Task 3.1

A one-shot migration command that reads a consumer's existing Letta archival_memory + replays into ctx-rs SQLite. Idempotent (re-run = no-op if target DB already migrated). Includes a `--dry-run` flag that reports counts without writing.

Triggered automatically by `wp setup --with session-memory` when ctx-rs is the new backend AND Letta data exists.

**Files:**

- Create: `src/cli/commands/session/migrate-from-letta.ts`
- Create: `src/cli/commands/session/migrate-from-letta.test.ts`

**Acceptance:**

- [ ] Migration is idempotent
- [ ] Dry-run flag works
- [ ] Tested against a v1-populated Letta instance

#### [qa] Task 4.2: Behavior parity test suite (v1 Letta vs v2 ctx-rs)

**Status:** todo

**Depends:** Task 3.1

Replay 50+ fixture sessions through both backends and assert search results match within ranking tolerance (top-3 results identical; top-10 results overlap ≥ 80%).

This is the load-bearing test for the "migration is invisible" claim.

**Files:**

- Create: `tests/session-memory-parity/fixtures/` (50+ recorded sessions)
- Create: `tests/session-memory-parity/parity.test.ts`

**Acceptance:**

- [ ] All 50 fixtures pass parity threshold
- [ ] Test runs in CI on every PR touching session-memory
- [ ] Parity tolerance documented in test file

#### [infra] Task 4.3: cargo-mutants in CI + 70% threshold

**Status:** todo

**Depends:** Task 1.3

Per outside-voice TP3 reframing: ctx-rs mutation score is measured independently (not subtracted from v1 Stryker baseline). Threshold: ≥ 70% on `store.rs` + `session.rs` + `search.rs` modules.

**Files:**

- Modify: `webpresso/ctx-rs/.github/workflows/check.yml`
- Create: `webpresso/ctx-rs/.cargo-mutants.toml` (config: examine paths, skip generated)

**Acceptance:**

- [ ] cargo-mutants runs in CI on every PR
- [ ] Threshold enforced as CI gate
- [ ] Pass on initial implementation

### Phase 5: Letta deprecation + docs [Complexity: M]

#### [backend] Task 5.1: Remove Letta adapter from agent-kit (after v2 soak period)

**Status:** todo

**Depends:** Task 4.2

Two-step:

1. v2.0 ships — both backends present, ctx-rs default, Letta available via env flag
2. v2.1 ships (one minor release later) — Letta adapter code + dependency removed

**Files:**

- Modify: `package.json` — drop letta client dep (in 2.1)
- Delete: `src/session-memory/letta-client*` (in 2.1)
- Modify: `src/session-memory/backend.ts` — remove letta branch (in 2.1)

**Acceptance:**

- [ ] v2.0 ships with both backends + env flag
- [ ] v2.1 ships with Letta code removed (separate PR)
- [ ] CHANGELOG documents the soak period and rollback path during v2.0

#### [docs] Task 5.2: Update README + session-memory guide for v2

**Status:** todo

**Depends:** Task 5.1

Update README's "Session memory" section: drop docker prerequisite, drop postgres,
new install footprint (historical standalone prebuilt concept). Update `docs/guides/session-memory.md`:

- Why we ship Rust (single binary, sub-ms latency, no docker)
- How to opt back into Letta if needed (env flag)
- Platform fallback (`WP_DISABLE_CTX=1` for unsupported platforms — per D13)

**Files:**

- Modify: `README.md`
- Modify: `docs/guides/session-memory.md`
- Modify: `catalog/agent/rules/gstack-routing.md` (update lane-1 description)

**Acceptance:**

- [ ] README accurate
- [ ] Guide explains both backends + when to use which
- [ ] Routing rule reflects new ownership

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety (TS) | `wp_typecheck` | Zero errors |
| Type safety (Rust) | `cargo check --all-targets` | Zero errors |
| Lint (Rust) | `cargo clippy -- -D warnings` | Zero warnings |
| Lint (TS) | `wp_lint --file <touched>` | Zero violations |
| License audit | `cargo deny check` | Zero forbidden licenses |
| Unit tests (Rust) | `cargo test --workspace` | All pass |
| Unit tests (TS) | `wp_test --file <touched>` | All pass |
| Mutation score | `cargo mutants --in-place` | ≥ 70% on core modules |
| Behavior parity | parity.test.ts | ≥ 80% top-10 overlap vs v1 |
| Hot path perf | bench in ctx-rs-core/benches/ | p99 < 2ms, p50 < 0.5ms |
| Cross-platform build | historical standalone release workflow | Superseded by vendored delivery |
| install smoke | (obsolete standalone package proof) | Superseded by vendored delivery |
| End-to-end | scratch Claude Code session + simulated compaction | Restore correctness preserved across backends |
| Full QA | `wp_qa` | All pass |
| Lifecycle audit | `wp_audit blueprint-lifecycle` | Blueprint passes |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | `ak-session-memory-via-letta-adapter-permissive-replacement-for-context-mode-session-resume-tool-output-indexing` (v1) | v1 ships the API surface + setup orchestration; v2 swaps the engine |
| Downstream | (potential v3: polyglot executor / ctx_execute / ctx_batch_execute) | Deferred to demand signal |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| standalone package missing for user's platform | historical package failure mode | Superseded by vendored delivery; kept only as documentary context | 2.2 + D13 |
| Rust panic across FFI boundary | Node process crashes | All napi functions wrap in `std::panic::catch_unwind`; panics become typed Node errors | 2.1 |
| ctx-rs version mismatch with agent-kit expectations | API drift breaks integration | Strict semver + ABI-version constant in ctx-rs-napi checked at module init | 2.1 |
| SQLite file corruption (laptop crash mid-write) | Session data lost | WAL mode enabled; recovery is SQLite's own; documented | 1.2 |
| User has v1 (Letta) and runs v2 install | Two stores conflict | Migration step runs first; Letta backend stays available via flag for soak period | 4.1 + 5.1 |
| Concurrent capture from 2 Claude Code sessions on same repo | SQLite write lock contention | WAL + BUSY_TIMEOUT; benchmark concurrent path | 1.3 |
| FTS5 unavailable in user's SQLite | Rare on modern macos; possible on stripped distros | rusqlite's `bundled` feature ships FTS5; CI tests verify | 1.1 |
| Behavior parity test flaky | False CI failures | Use deterministic fixtures, no time-based assertions | 4.2 |
| napi-rs version bump breaks FFI | Hot path regression | Pin napi-rs in Cargo.lock; quarterly bump cadence | 2.1 |

## Non-goals

- Polyglot executor (`ctx_execute`, `ctx_execute_file`, `ctx_batch_execute`) — deferred to v3 if there's demand. Research found these have real value (intent-based output filtering, one-call multi-query) but v2's scope is the engine swap, not new capabilities.
- 15-platform adapter coverage from context-mode — Claude Code + Gemini CLI stdio MCP only.
- ctx_insight analytics dashboard — out of scope; `rtk gain`-style telemetry adequate.
- Cloud sync / multi-machine session sharing — local only.
- Replicating Letta's memory-hierarchy concept (context/archival/recall) literally — v2 uses flat event log with on-demand FTS5 search instead; mapping is documented in 1.3.
- Stryker-style mutation score comparison vs v1 (outside-voice TP3 incoherence) — v2 measures its own cargo-mutants score independently.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| napi-rs prebuild matrix is more work than budgeted (outside voice flagged: 1-2 weeks first-time) | v2 timeline slips | Start CI work in Wave 2 in parallel with engine work; reference @napi-rs/cli setup examples from node-rs org |
| napi-rs version drift breaks FFI ABI | Hot path regression | Pin napi-rs version; quarterly upgrade with full test pass |
| Behavior parity is harder than expected (Letta uses semantic search, ctx-rs uses FTS5) | Migration not invisible | Parity test threshold is "top-10 overlap ≥ 80%", not "identical". Documented in 4.2 |
| Consumer's existing Letta data lost during migration | Trust hit | Migration is idempotent + dry-run flag + Letta data preserved (not deleted) during v2.0 soak |
| Rust toolchain becomes prereq for contributors | Community contribution friction | Surviving lane accepts this because ctx-rs is vendored source, not a published package |
| Outside voice was right about effort (8-12 weeks vs 4-6) | v2 ships later than planned | Library survey reduced unknowns; spike B will confirm; if estimate proves wrong, drop Phase 5 cleanup to a follow-up |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Engine language | Rust | edition 2024 | Eng-review D1; library survey de-risked the build |
| SQLite + FTS5 | rusqlite | 0.32+ | Library survey winner; FTS5 built-in; sync API matches hot path |
| Text chunking | text-splitter + tiktoken-rs | 0.29+ / 0.9+ | Semantic chunking, token-aware sizing |
| Node FFI | napi-rs | 3.8+ | Sync API support remains relevant; prebuilt-package framing is historical |
| MCP SDK (future v3) | rmcp | 0.16+ | Official Anthropic SDK; not used in v2 but reserved for v3 |
| HTTP client (fetch_and_index) | reqwest + http-cache-reqwest | 0.13+ | Permissive, pluggable cache backends |
| HTML→Markdown | htmd | 0.5.4 | Apache-2, Turndown-compatible, 16ms/1.4MB |
| License enforcement | cargo-deny | latest | Enforces forbidden-license allowlist (no GPL/AGPL/BUSL/SSPL/ELv2) |
| Mutation testing | cargo-mutants | latest | Rust-native; threshold 70%; replaces incoherent cross-language Stryker comparison |
| Bench | criterion | 0.5+ | Standard Rust bench; gates hot-path SLO in CI |
| Workspace structure | Cargo workspace with 2 crates | — | Mirrors framework/runtime extraction pattern |
| Prebuild publish | (obsolete) | — | Removed from the surviving delivery lane |
