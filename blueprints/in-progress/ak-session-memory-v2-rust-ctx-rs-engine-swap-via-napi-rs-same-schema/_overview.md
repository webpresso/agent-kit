---
type: blueprint
title: wp session memory v2 — Rust ctx-rs engine swap (same schema)
status: in-progress
complexity: L
owner: agent-kit
created: '2026-05-13'
last_updated: '2026-06-11'
progress: 'Still in progress: PR #95 is the only delivery lane, fallback removal + CI/doc cleanup are underway, and the delivery contract is being moved in-repo via vendored ctx-rs source + host-local native build'
depends_on:
  - ak-session-memory-v1-in-process-sqlite-fts5-via-better-sqlite3
tags:
  - session-memory
  - rust
  - ctx-rs
  - napi-rs
  - sqlite
  - fts5
  - mcp
  - lane-2
  - performance
---

# wp session memory v2 — Rust ctx-rs engine swap (same schema)

> **Reality check (2026-06-11):** this blueprint stays `in-progress`. The branch
> is now ctx-rs-only, legacy fallback knobs are being removed, and merge remains
> delivered through vendored ctx-rs source inside agent-kit plus host-local
> native build on first use. Do not mark this lane complete while that delivery contract,
> the remaining CI failures, or the docs truth gap are still open.

## Product wedge anchor

- **Stage outcome:** Same Lane 2 stage outcome as v1, **plus** webpresso owns a Rust engine — sub-millisecond hot path with hard SLO, repo-owned native build, no schema change. Roadmap cite: webpresso open-sourcing extraction roadmap, post-v1 perf wave.
- **Consuming surface:** Same `ak_session_*` MCP tool surface as v1 (`ak_session_capture`, `ak_session_snapshot`, `ak_session_restore`, `ak_session_search`). Same `wp setup`. Same on-disk SQLite file at `~/.webpresso/sessions/<repo-hash>.db`. Behind the scenes: `better-sqlite3` is replaced by vendored `ctx-rs` source that agent-kit builds for the current host on first use. Migration is invisible — same schema, same SQLite file format.
- **New user-visible capability:** After this lands, the same consumer using v1 today gets a `pnpm update @webpresso/agent-kit` that drops in the Rust engine. Hot path drops from sub-100ms to sub-2ms p99. `rtk gain`-style telemetry on session-capture overhead becomes negligible. No data migration.

## Problem Statement

v1 ships a working in-process TS session-memory engine (~400-600 LOC). For most
agent-kit consumers, that's enough — sub-100ms hot path is invisible at the
density of ~300 tool calls per session.

But three pressures motivate a Rust rewrite:

1. **Hot path tightening.** As event log grows past ~50K rows, the TS engine
   (better-sqlite3 + JS heap pressure) starts showing in p99. A Rust engine
   keeps p99 sub-2ms regardless of size.
2. **Single binary distribution.** Today: `pnpm add @webpresso/agent-kit` pulls
   better-sqlite3's native binary. v2 instead vendors the Rust engine source
   and builds the host-native binding on first use inside agent-kit.
3. **Engine ownership flexibility.** A Rust engine in our hands lets us add
   features (richer chunking, cargo-mutants-tested edge cases, custom
   tokenizers via FFI) that the better-sqlite3 SQL surface limits.

The v2 cut is constrained by design: it MUST keep v1's `ak_session_*` MCP tool
shapes identical AND read v1's existing `<repo-hash>.db` files unchanged. The
schema is the contract.

## Architecture Overview

```text
                     END-USER CLAUDE CODE
                             │
                             │ tool invocations
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ HOOK CHAIN (rtk → ak — UNCHANGED from v1)                    │
│                                                               │
│  PreToolUse:    rtk-pretool-guard ──▶ ak-pretool-guard       │
│                                                               │
│  Tool fires                                                   │
│                                                               │
│  PostToolUse:   rtk-posttool ──▶ ak-post-tool/index.ts       │
│                                       │                       │
│                                       ▼  napi-rs FFI (sync)   │
│                               vendored ctx-rs (Rust)          │
│                                  ├ index() -> Result          │
│                                  ├ search() -> Vec<Hit>       │
│                                  ├ snapshot() -> SnapshotId   │
│                                  ├ restore() -> Vec<Event>    │
│                                  └ rusqlite + FTS5 (same      │
│                                    schema as v1!)             │
│                                  └ ~/.webpresso/sessions/     │
│                                       <repo-hash>.db          │
│                                                               │
│  PreCompact:    ak-pre-compact (ctx-rs snapshot, capped)     │
│  SessionStart:  ak-sessionstart on source=compact (restore)  │
└─────────────────────────────────────────────────────────────┘

LANE MODEL (same as v1, faster):
  1  agent-kit + ctx-rs (FFI)   ak_session_*    MIT
  2  — DROPPED —                —               (context-mode out)
  3  rtk (upstream)             bash filter     MIT
  4  gstack (upstream)          /skill          MIT

CRATE STRUCTURE (webpresso/ctx-rs/ — new repo):
  ctx-rs/
  ├── crates/
  │   ├── ctx-rs-core/        Pure Rust engine
  │   │   └── src/
  │   │       ├── store.rs    SQLite + FTS5 schema (matches v1!), BM25
  │   │       ├── session.rs  Snapshot, restore, event capture
  │   │       ├── search.rs   3-tier fallback (porter → trigram → Levenshtein)
  │   │       └── chunk.rs    text-splitter + tiktoken-rs chunking
  │   └── ctx-rs-napi/        napi-rs FFI bindings (Apache-2 wrapper, exposes core)
  │       └── src/lib.rs      #[napi] sync exports for hot path
  └── npm/
      └── agent-kit vendor/ctx-rs/  vendored Rust workspace compiled on first use
                              agent-kit builds the matching host binding on first use

DATA FLOW (binary-compatible with v1 — same .db file):
  v1 (TS):  ak-post-tool ──▶ better-sqlite3 ──▶ <repo-hash>.db
  v2 (Rust): ak-post-tool ──▶ ctx-rs.index() ──▶ same <repo-hash>.db
                              (rusqlite reads/writes same FTS5 tables)

  Migration: zero. ctx-rs reads existing v1 database file as-is.
```

## Key Decisions

(Carried from eng-review locks unless noted as v2-specific. Refinement-applied
fixes are tagged with `Fx` references to the corresponding finding.)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Engine language | Rust | Eng-review D1; library survey de-risked the build |
| Crate home | New repo `webpresso/ctx-rs/` (own git repo, sibling to webpresso/agent-kit) | Eng-review D3'. Mirrors framework/runtime extraction pattern |
| Scope | Core only — store + session + search. NO polyglot executor, NO insight dashboard | Eng-review D2. ctx_execute / ctx_batch_execute deferred to v3 if demand |
| FTS engine | rusqlite **0.39+** (refinement F1 v2: was claimed 0.32+, current is 0.39); FTS5 is built into bundled SQLite (no Cargo `fts5` feature flag exists per F1 v2) | rusqlite 0.39 ships SQLite 3.51.3 with FTS5 enabled |
| Tokenizers | Built-in `porter unicode61` + `trigram` (refinement F2 v2: rusqlite has no custom-tokenizer API; built-ins cover us) | Same set as v1 TS engine; behavior parity built in |
| Node integration | napi 3.8 + napi-derive 3.5 + @napi-rs/cli 3.6 (refinement F12 v2 — exact version-string corrections); MSRV 1.88 | Rust 1.88+ required (most-restrictive in stack) |
| MCP SDK (future, NOT in v2 scope) | rmcp **1.6+** (refinement F4 v2: was claimed 0.16, actual is 1.6); license is **Apache-2.0** (was claimed MIT) | Reserved for v3 if we move ctx-rs to be a peer MCP server. v2 stays FFI |
| MCP tool surface | `ak_session_capture` / `ak_session_snapshot` / `ak_session_restore` / `ak_session_search` — IDENTICAL to v1 | Migration must be invisible to consumers |
| TS shim thickness | Thin (eng-review D9): TS reads stdin, calls ctx-rs FFI, writes stdout | All logic in Rust |
| Hot path SLO | p99 < 2ms, p50 < 0.5ms (eng-review D12) | Benchmark suite in CI |
| Migration from v1 | Zero migration step — ctx-rs reads existing v1 SQLite file at the same path | Schema is the contract |
| Vendored host build coverage | No fallback engine; vendored ctx-rs must build on supported hosts. Linux x64+arm64, macOS x64+arm64, and Windows x64+arm64 remain the intended host set. | Linux x64+arm64, macOS x64+arm64, Windows x64+arm64 |
| Bench / SLO gating | criterion **0.8** (refinement F9 v2: was claimed 0.5+, current is 0.8) + custom JSON-parsing gate script that parses `target/criterion/**/estimates.json` (refinement F9 v2: criterion does NOT natively gate CI on SLOs, returns exit 0 even on regression) | Explicit threshold-checker is required |
| Mutation testing | cargo-mutants 27.0+ with config at `.cargo/mutants.toml` (refinement F8 v2: was claimed `.cargo-mutants.toml`); 70% threshold via custom parse-and-gate script (refinement F8 v2: no built-in threshold flag) | Reframed parity per outside-voice TP3; no incoherent cross-language Stryker subtraction |
| License enforcement | cargo-deny 0.19.4+ with allowlist (refinement F7 v2 verified) | Implicit-deny model: anything not in allowlist is denied. Covers GPL/AGPL/BUSL/SSPL/ELv2 by omission |
| Reference for FTS5 + MCP patterns | `alphaonedev/ai-memory-mcp` (MIT) — NOT MemoryPilot (refinement F14 v2: MemoryPilot is now source-available, not permissive) | Read for inspiration only; not a fork target |
| Fall-back transport (v3) | rmcp 1.6+ stdio MCP server — only if FFI ever proves wrong | Explicit alternative path documented |

## Quick Reference (Execution Waves)

| Wave              | Tasks                            | Dependencies | Parallelizable | Effort (T-shirt) |
| ----------------- | -------------------------------- | ------------ | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2, 1.3, 1.4, 1.5          | None         | 5 agents       | XS-S             |
| **Wave 1**        | 2.1, 2.2                         | Wave 0       | 2 agents       | M                |
| **Wave 2**        | 3.1, 3.2                         | Wave 1       | 2 agents       | S-M              |
| **Wave 3**        | 4.1, 4.2                         | Wave 2       | 2 agents       | M                |
| **Wave 4**        | 5.1, 5.2                         | Wave 3       | 2 agents       | S                |
| **Critical path** | 1.1 → 2.1 → 3.1 → 4.1 → 5.1      | --           | 5 waves        | L                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual |
| ------ | ---------------------------------- | -------------------- | ------ |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 5      |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 13/5 = 2.6 |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | ~13/13 = 1.0 |
| CP     | same-file overlaps per wave        | 0                    | 0      |

All metrics meet target after restructure (Wave 0 expanded from 3 to 5 by moving cargo-deny and bench scaffolding into independent first-wave tasks). Plan is `/pll`-ready.

### Phase 1: ctx-rs core crate scaffold + storage [Complexity: M]

#### [infra] Task 1.1: Scaffold webpresso/ctx-rs/ workspace + cargo-deny

**Status:** done

**Depends:** None

Create the new repo `webpresso/ctx-rs/` (sibling to agent-kit). Initialize Cargo workspace with two crates: `ctx-rs-core` (pure Rust) and `ctx-rs-napi` (FFI bindings). Add cargo-deny config with explicit license allowlist (refinement F7 v2: implicit-deny model).

**Files:**

- Create: `webpresso/ctx-rs/Cargo.toml` (workspace manifest)
- Create: `webpresso/ctx-rs/crates/ctx-rs-core/Cargo.toml`
- Create: `webpresso/ctx-rs/crates/ctx-rs-core/src/lib.rs`
- Create: `webpresso/ctx-rs/deny.toml` (license allowlist: Apache-2.0, MIT, ISC, BSD-3-Clause, Apache-2.0 WITH LLVM-exception, Unicode-3.0, Zlib)
- Create: `webpresso/ctx-rs/rust-toolchain.toml` (pin stable 1.88+ — MSRV stack-wide per F12 v2)
- Create: `webpresso/ctx-rs/.github/workflows/check.yml` (clippy + fmt + cargo-deny + test)

**Acceptance:**

- [x] `cargo check` passes from clean clone
- [x] `cargo deny check` passes; license allowlist enforced (implicit-deny)
- [x] CI workflow green on linux + macos + windows
- [x] README states "Apache-2 / MIT dual license" up front
- [x] rust-toolchain.toml pins to ≥1.88

#### [backend] Task 1.2: SQLite store with v1-compatible schema + three-tier search

**Status:** done

**Depends:** None

Implement `ctx-rs-core/src/store.rs`. Schema **MUST be byte-identical to v1's TS engine schema** (the migration-zero contract). Three-tier search fallback (porter → trigram → IDF-weighted Levenshtein) per context-mode's algorithm.

`Cargo.toml` deps for this crate:
- `rusqlite = { version = "0.39", features = ["bundled"] }` (refinement F1 v2: NO `fts5` feature flag exists; FTS5 is in bundled SQLite)
- `serde = "1"`, `serde_json = "1"` for event payload (de)serialization

Performance: `PRAGMA mmap_size = 268435456`, `OPTIMIZE` every 50 inserts.

**Files:**

- Create: `webpresso/ctx-rs/crates/ctx-rs-core/src/store.rs`
- Create: `webpresso/ctx-rs/crates/ctx-rs-core/tests/store_test.rs`
- Create: `webpresso/ctx-rs/crates/ctx-rs-core/tests/fixtures/v1-corpus.sql` (SQL dump from a v1 instance, used to verify v2 reads it identically)

**Acceptance:**

- [x] All FTS5 tests pass: porter + trigram + Levenshtein fallback chain
- [x] **Byte-identity test:** open a v1-generated `.db` file, run identical search queries → identical top-10 result IDs
- [x] Property tests pass (10K cases): idempotent re-index, concurrent reads
- [x] Benchmark: 1000-doc corpus, search p99 < 5ms

#### [backend] Task 1.3: Session snapshot + restore primitives

**Status:** done

**Depends:** None

Implement `ctx-rs-core/src/session.rs` matching v1's session schema exactly. Methods: `capture_event`, `snapshot`, `restore`. Snapshot timeout returns partial gracefully (eng-review D14).

**Files:**

- Create: `webpresso/ctx-rs/crates/ctx-rs-core/src/session.rs`
- Create: `webpresso/ctx-rs/crates/ctx-rs-core/tests/session_test.rs`

**Acceptance:**

- [x] Capture/snapshot/restore round-trip tested
- [x] Timeout returns partial, not panic
- [x] Concurrent capture from multiple threads doesn't corrupt (loom test)

#### [infra] Task 1.4: Bench harness scaffold (criterion + custom gate script)

**Status:** done

**Depends:** None

Set up criterion 0.8 benches AND the custom JSON-parsing gate script (refinement F9 v2: criterion exits 0 even on regression — explicit threshold check required).

Files:
- `crates/ctx-rs-core/benches/hot_path.rs` — bench `index`, `search`, `snapshot`, `restore`
- `scripts/check-bench-thresholds.sh` — parses `target/criterion/**/estimates.json`, fails CI if p99 > 2ms or p50 > 0.5ms
- `.github/workflows/bench.yml` — runs criterion + gate script on every PR

Add `criterion = { version = "0.8", features = ["html_reports"] }` (refinement F9 v2 version) to dev-dependencies.

**Files:**

- Create: `webpresso/ctx-rs/crates/ctx-rs-core/benches/hot_path.rs`
- Create: `webpresso/ctx-rs/scripts/check-bench-thresholds.sh`
- Create: `webpresso/ctx-rs/.github/workflows/bench.yml`

**Acceptance:**

- [x] Bench runs locally
- [x] Threshold script correctly fails on synthetic regression
- [x] CI workflow green on baseline run

#### [infra] Task 1.5: cargo-mutants config + parse-and-gate script

**Status:** done

**Depends:** None

Set up cargo-mutants v27 with config at `.cargo/mutants.toml` (refinement F8 v2: NOT `.cargo-mutants.toml` as I earlier wrote). Add a parse-and-gate script that runs `cargo mutants --json`, parses the output, and fails CI if mutation score < 70% on `store.rs` + `session.rs` + `search.rs`.

**Files:**

- Create: `webpresso/ctx-rs/.cargo/mutants.toml` (correct path per F8 v2)
- Create: `webpresso/ctx-rs/scripts/check-mutation-score.sh`
- Create: `webpresso/ctx-rs/.github/workflows/mutation.yml`

**Acceptance:**

- [x] cargo-mutants runs locally
- [x] Threshold script enforces 70% on listed modules
- [x] CI workflow added

### Phase 2: napi-rs FFI bindings [Complexity: M]

#### [backend] Task 2.1: ctx-rs-napi crate with sync FFI surface

**Status:** done

**Depends:** Task 1.2, 1.3

Implement the napi-rs binding crate. Sync exports for hot path (eng-review D8). Pin: `napi = "3.8"`, `napi-derive = "3.5"` (refinement F12 v2).

Functions exposed:
- `index(db_path, payload) -> Result<()>`
- `search(db_path, query, limit) -> Result<Vec<SearchHit>>`
- `snapshot(db_path, agent_id, max_ms) -> Result<SnapshotResult>`
- `restore(db_path, agent_id, query) -> Result<Vec<EventHit>>`
- `async fetch_and_index(db_path, url) -> Result<FetchResult>` (only async — D8 carve-out)

napi-rs handles panic→error mapping natively (refinement F15 v2: no manual `catch_unwind` needed).

**Files:**

- Create: `webpresso/ctx-rs/crates/ctx-rs-napi/Cargo.toml`
- Create: `webpresso/ctx-rs/crates/ctx-rs-napi/src/lib.rs`
- Create: `webpresso/ctx-rs/crates/ctx-rs-napi/src/types.rs`
- Create: `webpresso/ctx-rs/crates/ctx-rs-napi/build.rs`

**Acceptance:**

- [x] `cargo build -p ctx-rs-napi --release` produces .node file
- [x] Manual smoke from Node: import + call each function, results round-trip
- [x] Rust panics mapped to Node errors automatically (no segfault path)

#### [infra] Task 2.2: Vendored host-build contract (Windows remains first-class)

**Status:** blocked

**Depends:** Task 2.1

The old standalone release workflow has been removed. The shipping contract is
vendored ctx-rs source inside agent-kit, not a separately published package.

Intended host targets:
- linux-x64-gnu, linux-arm64-gnu
- darwin-x64, darwin-arm64
- **windows-x64-msvc, windows-arm64-msvc (FIRST CLASS, no graceful disable)**
- Optional bonus: linux-x64-musl, linux-arm64-musl (for Alpine/Lambda; cargo-zigbuild)

Vendored Rust workspace compiled locally for the current host.

**Files:**

- Create: `vendor/ctx-rs/**` (vendored Rust workspace)
- Modify: `src/session-memory/ctx-rs-runtime.ts` (host-target resolution + first-use build)
- Modify: `.github/workflows/session-perf.yml` (vendored runtime verification)

**Acceptance:**

- [ ] vendored ctx-rs source builds and loads on supported host platforms without external npm packages
- [ ] Unsupported targets fail loudly with a clear error message

### Phase 3: Backend swap in agent-kit [Complexity: M]

#### [backend] Task 3.1: Swap `src/session-memory/store.ts` to call ctx-rs FFI

**Status:** blocked

**Depends:** Task 2.2

Replace the better-sqlite3 calls in v1's `src/session-memory/store.ts` with vendored ctx-rs FFI calls. This lane is now ctx-rs-only: remove the rollback env flag and make missing runtime errors loud instead of silently falling back.

**Files:**

- Modify: `src/session-memory/store.ts` (from v1)
- Modify: `package.json` — declare the real supported ctx-rs delivery surface once it exists
- Modify: `src/session-memory/backend.ts` (new abstraction layer)

**Acceptance:**

- [ ] No `AK_SESSION_ENGINE` or `AK_DISABLE_CTX` fallback remains
- [ ] ctx-rs path passes the remaining session-memory owner tests on this branch
- [ ] Hot path gate is still enforced by the promised perf threshold

#### [backend] Task 3.2: Swap session.ts and fetch-index.ts to ctx-rs FFI

**Status:** blocked

**Depends:** Task 2.2

Same backend swap pattern for session-event capture and fetch+index, with the same no-fallback rule.

**Files:**

- Modify: `src/session-memory/session.ts` (from v1)
- Modify: `src/session-memory/fetch-index.ts` (from v1)

**Acceptance:**

- [ ] Snapshot + restore work end-to-end via ctx-rs
- [ ] 5s cap enforced (parity with v1)
- [ ] Smoke: full compaction → restore cycle in scratch repo

### Phase 4: Parity gates + read-existing-v1-DB [Complexity: M]

#### [qa] Task 4.1: Read-v1-DB parity test suite

**Status:** done

**Depends:** Task 3.1

Take 50+ fixture sessions captured by v1's TS engine, point ctx-rs at the same `.db` files, run identical queries → assert identical top-10 result IDs and identical session_events ordering.

This is the load-bearing test for the "migration is invisible" claim.

**Files:**

- Create: `tests/v2-reads-v1-db/fixtures/` (50+ recorded session DBs)
- Create: `tests/v2-reads-v1-db/parity.test.ts`

**Acceptance:**

- [x] All 50 fixtures pass identity threshold (top-10 IDs match exactly)
- [x] Test runs in CI on every PR touching ctx-rs or session-memory
- [x] Documented as the v1→v2 invisibility contract

#### [qa] Task 4.2: Bench gate enforcement in agent-kit CI

**Status:** done

**Depends:** Task 3.1

The bench gate from Task 1.4 lives in ctx-rs CI. Add a thin verification in agent-kit CI: run a representative session-capture workload, assert hot-path p99 < 2ms via the same threshold script.

**Files:**

- Create: `.github/workflows/session-perf.yml` (in agent-kit repo)
- Create: `tests/perf/session-capture.bench.ts`

**Acceptance:**

- [x] Bench fixture covers index/search/snapshot/restore
- [x] CI fails on p99 > 2ms
- [x] Threshold tunable via env var for development

### Phase 5: TS engine deprecation + docs [Complexity: S]

#### [backend] Task 5.1: Remove TS engine from agent-kit (after v2 soak period)

**Status:** in-progress

**Depends:** Task 4.1

This lane no longer dual-ships. Remove the TS fallback now; do not plan a soak period that reintroduces legacy runtime behavior.

**Files:**

- Modify: `src/session-memory/backend.ts` — remove the ts branch
- Modify: `src/session-memory/store.ts` / `session.ts` / `fetch-index.ts` — fail loudly when ctx-rs is unavailable
- Update docs and tests to remove legacy rollback guidance

**Acceptance:**

- [ ] No TS fallback runtime remains on the delivery branch
- [ ] Docs and CHANGELOG no longer describe a rollback env flag
- [ ] Delivery remains blocked until the vendored ctx-rs build/load contract is fully verified

#### [docs] Task 5.2: Update README + session-memory guide for v2

**Status:** todo

**Depends:** Task 5.1

Update the session-memory guide to describe the engine-swap mechanism, the v1→v2 zero-migration claim, and the bench SLO. Keep the user-facing `ak_session_*` API description identical (because it IS identical).

**Files:**

- Modify: `README.md`
- Modify: `docs/guides/session-memory.md`
- Modify: `catalog/agent/rules/context-mode-routing.md` (note: lane-2 implementation is now Rust)

**Acceptance:**

- [ ] README accurate
- [ ] Guide explains engine swap + zero-migration claim
- [ ] Routing rule reflects new implementation

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety (TS) | `ak_typecheck --package agent-kit` | Zero errors |
| Type safety (Rust) | `cargo check --all-targets` | Zero errors |
| Lint (Rust) | `cargo clippy -- -D warnings` | Zero warnings |
| Lint (TS) | `ak_lint --file <touched>` | Zero violations |
| License audit | `cargo deny check` | Zero forbidden licenses (implicit-deny) |
| Unit tests (Rust) | `cargo test --workspace` | All pass |
| Unit tests (TS) | `ak_test --file <touched>` | All pass |
| Mutation score | `cargo mutants --json` + scripts/check-mutation-score.sh | ≥ 70% on core modules |
| Read-v1-DB parity | tests/v2-reads-v1-db/parity.test.ts | 50/50 fixtures pass identity test |
| Hot path SLO | `cargo bench` + scripts/check-bench-thresholds.sh | p99 < 2ms, p50 < 0.5ms |
| Cross-platform build | vendored runtime smoke + session-perf lane | Green on supported host targets exercised by agent-kit |
| vendored runtime smoke | first-use load on a clean machine | builds the host binding and loads it without external npm packages |
| End-to-end | scratch Claude Code session + simulated compaction | Restore correctness preserved across backends |
| Full QA | `ak_qa` | All pass |
| Lifecycle audit | `ak_audit kind=blueprint-lifecycle` | Blueprint passes |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | `ak-session-memory-v1-in-process-sqlite-fts5-via-better-sqlite3` (v1) | v1 ships TS engine + schema; v2 replaces engine, reads same schema |
| Downstream | (potential v3: polyglot executor / ctx_execute / ctx_batch_execute) | Deferred to demand signal |
| Supersedes | `ak-session-memory-v2-rust-ctx-rs-engine-replaces-letta-backend...` (parked) | Parked v2 was structured around replacing Letta; this v2 replaces TS engine. Same destination, different starting point |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Vendored ctx-rs build fails on user's platform | first-use runtime load breaks loudly | Treat as a blocked delivery error; do not route back to a TS engine. README and the session-memory guide must call this out explicitly. | 2.2 |
| Rust panic across FFI boundary | Node process crashes | napi-rs handles panic→Node-error natively (F15 v2) | 2.1 |
| Schema drift between v1 TS and v2 Rust | v1 → v2 migration breaks | Read-v1-DB parity test suite (Task 4.1) is the contract | 4.1 |
| ctx-rs version mismatch with agent-kit expectations | API drift breaks integration | Strict semver + ABI-version constant in ctx-rs-napi checked at module init | 2.1 |
| SQLite file lock contention with v1 still running | Two engines fight | Document: cannot run v1 and v2 simultaneously on same .db file (env flag selects one) | 3.1 |
| Concurrent capture from 2 Claude Code sessions on same repo | SQLite write contention | WAL + BUSY_TIMEOUT; same as v1 | 3.1 |
| FTS5 schema migration needed in v2 | Breaks zero-migration claim | If unavoidable: ship a one-shot `wp session migrate-v1-to-v2` subcommand and document. v2 starts with no schema changes; this is the escape hatch | 4.1, 5.1 |
| Bench flake under varied CI runners | False CI failures | Use deterministic fixtures, no time-based assertions; gate on percentage above baseline (3-run median) | 1.4, 4.2 |
| napi-rs ABI breakage on Node version bump | Hot path regression | Pin napi-rs in Cargo.lock; quarterly bump cadence with full test pass | 2.1 |

## Non-goals

- Polyglot executor (`ctx_execute`, `ctx_execute_file`, `ctx_batch_execute`) — deferred to v3.
- 15-platform adapter coverage from context-mode — Claude Code + Gemini CLI stdio MCP only.
- ctx_insight analytics dashboard — out of scope; `rtk gain`-style telemetry adequate.
- Cloud sync / multi-machine session sharing — local only.
- Custom FTS5 tokenizers via raw FFI (refinement F2 v2: would require libsqlite3-sys raw FFI; built-ins cover us).
- Stryker-cross-language mutation comparison (outside-voice TP3) — v2 measures its own cargo-mutants score independently.
- Mid-migration schema changes — v2's contract is "read v1 .db files unchanged."

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Outside voice was right about napi-rs CI being 1-2 weeks (refinement F12 v2 says scaffolder is fast — verify in spike B) | v2 timeline slips | Library survey + F12 v2 verification reduced unknowns; spike B confirms; if estimate wrong, drop Phase 5 cleanup to follow-up |
| napi-rs version drift breaks FFI ABI | Hot path regression | Pin napi 3.8, napi-derive 3.5, @napi-rs/cli 3.6; quarterly upgrade with full test pass |
| Schema-as-contract becomes a constraint when v2 wants to add capabilities | v2 development hampered | If a non-additive change is unavoidable, ship `wp session migrate-v1-to-v2`; document migration as a one-time rather than continuous concern |
| MSRV 1.88 (refinement F12 v2) excludes some contributors | Community contribution friction | Document MSRV; pre-commit hook checks toolchain |
| Read-v1-DB parity test is harder than expected (FTS5 BM25 ordering across SQLite versions) | "Invisible migration" claim weakens | Parity threshold is "top-10 IDs match", not "byte-identical results"; document tolerance |
| cargo-mutants runs slow in CI (Rust mutation testing is expensive) | PR feedback loop slows | Run mutation only on PR labels or main-branch nightly; not blocking on every PR |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Engine language | Rust | edition 2024 (MSRV 1.88 per F12 v2) | Eng-review D1 |
| SQLite + FTS5 | rusqlite | **0.39+** (refinement F1 v2) | Ships SQLite 3.51.3 with FTS5 enabled; sync API; bundled feature pulls amalgamation |
| Tokenizers | porter unicode61 + trigram (built-in to FTS5) | n/a | Refinement F2 v2: only built-ins are accessible without raw FFI |
| Text chunking | text-splitter + tiktoken-rs | **0.30+ / 0.11** (refinement F5/F6 v2) | Token-aware chunking |
| Node FFI | napi + napi-derive + @napi-rs/cli | **3.8 / 3.5 / 3.6** (refinement F12 v2 exact versions) | Sync FFI for hot path; CI scaffolder mature |
| Bench | criterion | **0.8** (refinement F9 v2) | + custom JSON-parsing gate script (criterion does NOT natively gate on SLOs per F9 v2) |
| Mutation testing | cargo-mutants | **27.0+**; config at `.cargo/mutants.toml` (refinement F8 v2) | + custom parse-and-gate script (no built-in threshold flag per F8 v2) |
| License enforcement | cargo-deny | **0.19.4+** (refinement F7 v2) | Implicit-deny model: anything not in allowlist denied; covers GPL/AGPL/BUSL/SSPL/ELv2 |
| MCP SDK (v3 reserved) | rmcp | **1.6+, Apache-2.0** (refinement F4 v2: was misstated as 0.16+, MIT) | Reserved for v3 if FFI ever proves wrong |
| HTTP client (fetch_and_index) | reqwest + http-cache-reqwest | 0.13+ | Permissive, pluggable cache backends |
| HTML→Markdown | htmd | 0.5.4 (refinement F10 v2 verified) | Apache-2, Turndown-compatible |
| Workspace structure | Cargo workspace with 2 crates | edition 2024 (Rust 1.85+) | Mirrors framework/runtime extraction pattern; MSRV 1.88 from napi |
| Reference for FTS5 + MCP patterns | `alphaonedev/ai-memory-mcp` (MIT) | n/a | Refinement F14 v2: NOT MemoryPilot (now source-available). Read-only inspiration |
| Distribution | vendored ctx-rs Rust source inside agent-kit | n/a | repo-owned host-local build on first use; no standalone package lane |

## Refinement summary

| Metric | Value |
| ------ | ----- |
| Rust-stack findings applied | 15 |
| Critical applied | 1 (rmcp version + license) |
| High applied | 5 (rusqlite version + no-fts5-feature, criterion gating, napi versions) |
| Medium applied | 6 |
| Low applied | 3 |
| Reference replaced | MemoryPilot → ai-memory-mcp (F14 v2) |
| Windows promoted | best-effort → first-class (F13 v2) |
| Bench gate | criterion does not gate natively → custom script (F9 v2) |
| Mutation gate | path corrected `.cargo/mutants.toml` + custom script (F8 v2) |
| MSRV | 1.88 stack-wide (F12 v2) |
| **Parallelization score** | A (RW0=5, CPR=3.4, CP=0) |
| **Critical path** | 5 waves |
| **Total tasks** | 17 (13 original + 4 Phase 6 output sandboxing) |
| **Blueprint compliant** | 17/17 |

---

### Phase 6: Output Sandboxing (context-mode replacement parity) [Complexity: S-M]

#### Task 6.1: `ak_session_execute` — single-command output sandboxing (ctx-rs backed)

**Status:** done

**Depends:** Wave 4

**Files:**
- `src/mcp/tools/session-execute.ts`
- `src/mcp/tools/session-execute.test.ts`
- `crates/ctx-rs-core/src/execute.rs` (Rust)
- `crates/ctx-rs-napi/src/lib.rs` (napi binding)

**Purpose:** Replaces `ctx_execute` — thin TS shim calls `ctxRs.executeSandboxed(dbPath, command, label)`. All execution + streaming + FTS5 indexing happens in Rust via tokio async (stdout/stderr drained concurrently via `tokio::spawn` + `tokio::join!`). Returns compact summary.

**Acceptance:**
- [x] small output returned directly (< 2KB)
- [x] large output indexed via ctx-rs Rust FTS5 (`execute_and_index` in `ctx-rs-core`)
- [x] query triggers FTS5 search over indexed content
- [x] error returns structured envelope
- [x] missing ctx-rs runtime returns a structured error envelope with no fallback engine
- [x] 5 Rust integration tests pass (small/large/nonzero-exit/summary-truncation/searchable)

#### Task 6.2: `ak_session_batch_execute` — parallel batch with search (ctx-rs backed)

**Status:** done

**Depends:** Task 6.1

**Files:**
- `src/mcp/tools/session-batch-execute.ts`
- `src/mcp/tools/session-batch-execute.test.ts`

**Purpose:** Calls `executeSandboxed` per command via `p-queue` (JS-side concurrency control over napi async calls). All indexing in Rust. Cross-command FTS5 search after batch completes.

**Acceptance:**
- [x] concurrency respects max 8 via p-queue
- [x] all outputs indexed via ctx-rs Rust FFI
- [x] `queries` returns cross-command hits
- [x] graceful disable falls through

#### Task 6.3: Expanded PostToolUse capture coverage

**Status:** done

**Depends:** Wave 4

**Files:**
- `.claude-plugin/plugin.json`
- `src/hooks/post-tool/session-capture.ts`

**Purpose:** Extends capture from `Bash|Edit|Write|MultiEdit` to `Read|Grep|WebFetch|mcp__*`; capture uses ctx-rs `captureEvent` sync FFI with graceful TS fallback.

**Acceptance:**
- [x] Read/Grep/WebFetch/mcp__ events captured
- [x] capture routes through ctx-rs `captureEvent` sync FFI
- [x] graceful disable uses TS engine fallback

#### Task 6.4: Routing guidance — nudge Claude toward `ak_session_execute`

**Status:** done

**Depends:** Wave 4

**Files:**
- `src/hooks/shared/routing-block.ts`
- `catalog/agent/rules/context-mode-routing.md`

**Purpose:** SessionStart routing block tells Claude to route large-output commands through `ak_session_execute`. Updates lane-2 routing rule.

**Acceptance:**
- [x] `AK_ROUTING_BLOCK` includes `ak_session_execute` decision row
- [x] `context-mode-routing.md` updated to reference `ak_session_execute`
