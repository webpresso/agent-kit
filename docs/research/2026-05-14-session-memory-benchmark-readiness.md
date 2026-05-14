---
type: research
title: "Session Memory Benchmark Readiness — Three Variants (context-mode / v1-TS / v2-Rust)"
subject: "Benchmark readiness for main/context-mode, v1/TS-FTS5, v2/Rust-ctx-rs sequential run"
date: 2026-05-14
last_updated: 2026-05-14
confidence: high
verdict: trial
---

# Session Memory Benchmark Readiness

> All three backends are operational. The harness measures the right Tier-1
> metrics (raw-op latency + correctness spot-check), but has four known gaps that
> must be documented as caveats before interpreting results.

## TL;DR

- **v1** (better-sqlite3 + FTS5): 78/78 tests pass, all ops wired, ready.
- **v2** (ctx-rs Rust napi): 56/56 tests pass, binary verified (`index, search,
  captureEvent, flushEvents, snapshot, restore, fetchAndIndex, executeSandboxed`),
  ready.
- **context-mode** (better-sqlite3 + FTS5 via ContentStore): harness models
  single-source BM25 only; real context-mode has THREE merged sources (ContentStore
  + SessionDB + auto-memory). The harness is NOT a fair comparison of search quality.
- **SQLite 3.53.0** is in use — safe (regression affects 3.51.0–3.51.2 only).
- **Token savings are NOT measured** by harness.js — Tier-1 numbers are raw-op
  latency only. State this clearly when sharing results.

## What This Is

Pre-run readiness check for a sequential SQLite/napi benchmark comparing three
session-memory backends: main (context-mode plugin), v1 (in-process TS FTS5),
v2 (Rust ctx-rs via napi-rs). The harness at `/tmp/session-memory-benchmark/harness.js`
uses 1,000 samples with 200 warmup iterations across five operations: index, search,
captureEvent, snapshot, restore.

## State of the Art (2026)

- **napi-rs** is the production standard for Rust → Node.js bindings (Turbopack,
  Rspack, Biome all use it). Primary caveat: each N-API boundary crossing has
  overhead; it dominates for sub-0.1 ms operations. [napi-rs](https://napi.rs/)
- **SQLite FTS5** with porter + trigram tokenizers is production-proven. Key
  pitfall: OPTIMIZE rewrites the entire index — avoid calling it too frequently.
  [SQLite FTS5 docs](https://www.sqlite.org/fts5.html)
- **Agent memory measurement**: in 2026, the standard is `usage.prompt_tokens`
  from the API, comparing with vs without the memory system in context.
  [Mem0 Token Playbook](https://mem0.ai/blog/the-2026-token-optimization-playbook-cut-ai-agent-memory-costs-3%E2%80%934x)
- **FTS5 regression**: SQLite 3.51.0–3.51.2 had an 8.4x prepared-statement
  slowdown. better-sqlite3@12.9.0 ships SQLite **3.53.0** — not affected.

## Positive Signals

### Backend Readiness

- All three variants have passing test suites (v1: 78/78, v2: 56/56, context-mode:
  production-deployed).
- ctx-rs binary loads and exports all required symbols (`index`, `search`,
  `captureEvent`, `flushEvents`, `snapshot`, `restore`).
- Harness correctly models v2's Rust napi path via direct `.node` binary load,
  bypassing package resolution — representative of real call overhead.
- Warmup of 200 iterations amortizes JIT and SQLite page-cache warm-up before
  sampling begins. This is correct methodology.

### Harness Design

- WAL mode + mmap_size=256 MB applied to all three SQLite backends — fair.
- Sequential (not parallel) execution — no cross-variant cache contamination.
- 1K pre-indexed corpus before search benchmark — realistic search density.
- Memory RSS delta tracked per variant — catches napi heap overhead.
- Correctness spot-check via KNOWN_QUERIES (10 queries, expected source in top-5).

### napi-rs Maturity

- napi-rs v2 is production-grade and used by major tools in 2026. For operations
  that take > 0.5 ms (search, snapshot), the boundary overhead is negligible
  relative to computation. captureEvent (sub-0.1 ms) is where overhead matters most.

## Negative Signals / Gaps

### Gap 1: Context-mode is modelled unfairly (HIGH)

The harness models context-mode as a single FTS5 table with the context-mode
schema. The real context-mode `ctx_search` merges THREE sources:
1. **ContentStore** (FTS5 BM25, porter + trigram — matches harness)
2. **SessionDB** (`searchEvents` — searches past session events by keyword)
3. **auto-memory** (platform-native memory, e.g., Claude's memory)

In `sort="relevance"` mode (default), only ContentStore is used — the harness
is fair for that path. In `sort="timeline"` mode, context-mode pulls from all
three — our harness does NOT model this and would undercount context-mode's
recall capability in timeline queries.

**Mitigation:** Add footnote to results: "context-mode search results reflect
ContentStore BM25 only (`sort='relevance'`). Timeline mode includes SessionDB
and auto-memory and is not benchmarked here."

### Gap 2: Token savings not measured (HIGH)

The harness measures raw-op latency (µs/ms) but NOT the primary KPI: tokens
saved per session by having memory available vs not. WOZCODE's "50% cost
reduction" claim is about token savings, not SQLite write speed.

**Missing metrics:**
- Avg tokens in context WITH memory system vs baseline
- Recall@1/5 for known queries (does the right document surface?)
- End-to-end PostToolUse hook wall-clock (the user-visible overhead)

**Mitigation:** Run Tier-1 now; document as "raw throughput only." Tier-2 (IR
quality) in `ir-quality.js` should be built before drawing product conclusions.

### Gap 3: OPTIMIZE frequency may skew v1/context-mode (MEDIUM)

v1 and context-mode call `INSERT INTO chunks(chunks) VALUES('optimize')` every
50 inserts. With 1,200 total inserts (200 warmup + 1,000), that's 24 OPTIMIZE
calls per run. Each OPTIMIZE rewrites the entire FTS5 index.

For a 1K-doc corpus, this is fast. At 100K docs in production, OPTIMIZE would
take seconds. The benchmark does not test the scale where OPTIMIZE penalty
materializes. This is acceptable for Tier-1 but must be noted.

### Gap 4: napi-rs N-API boundary cost may dominate captureEvent (MEDIUM)

For captureEvent (expected < 0.1 ms in v1/context-mode), the napi-rs boundary
crossing (~0.01–0.05 ms per call) could inflate v2's number relative to the
pure Rust work done. This is NOT a bug — it's real overhead. But it means
captureEvent numbers are the most favorable point for v1 and the least
favorable for v2 in this benchmark.

## Community Sentiment

The 2026 consensus on SQLite + FTS5 for local agent memory is broadly positive:
> "The context window behaves like RAM, not storage. Build a persistent
> memory layer and manage context the way an OS manages RAM." — [Mem0, 2026](https://mem0.ai/blog/context-window-is-ram-not-storage-why-most-agent-failures-happen-how-to-fix-them-in-2026)

The napi-rs community notes:
> "Minimize N-API calls as much as possible — the overhead offsets the native
> savings for sub-millisecond operations." — [LogRocket, 2026](https://blog.logrocket.com/improving-node-js-performing-rust/)

On benchmark methodology:
> "Vendors can't agree on which LLM judge prompt to use, so published numbers
> from different papers aren't comparable. One vendor's 84% was corrected to
> 58% when methodology was standardized." — [Context compression research, 2026](https://medium.com/the-ai-forum/automatic-context-compression-in-llm-agents-why-agents-need-to-forget-and-how-to-help-them-do-it-43bff14c341d)

## Project Alignment

### Vision Fit
This benchmark directly serves the benchmark plan (`virtual-rolling-eclipse.md`)
goal: produce defensible numbers on whether v1/v2 session-memory is worth shipping
over keeping context-mode. The Tier-1 harness is the first required data point.

### Tech Stack Fit
- Node 25.9.0 + SQLite 3.53.0 — confirmed stable, no known regressions.
- better-sqlite3@12.9.0 — current release, not affected by 3.51 regression.
- ctx-rs napi binary verified (`ctx_rs_napi.darwin-arm64.node`, 10.4 MB, darwin/arm64).

### Trade-offs for Current Stage
The harness is ready to run as-is for Tier-1. The four gaps are known and
documentable — they don't block running, they block over-interpreting results.

## Recommendation

**Run the benchmark now with this preamble in results:**

```
Scope: Tier-1 raw-op latency only. N=1000, warmup=200, corpus=1000 docs.
Does NOT measure: token savings, search recall quality, end-to-end hook latency,
context-mode timeline mode (multi-source). SQLite 3.53.0, Node 25.9.0, darwin/arm64.
```

**Three things to add to harness output before sharing externally:**

1. A "search correctness" table: for each KNOWN_QUERY, report whether expected
   source appears in top-5 (recall@1 proxy). The harness has KNOWN_QUERIES defined
   but only logs pass/fail count — print per-query results.
2. Explicit note that context-mode search modelled is `sort='relevance'` only.
3. ctx-rs version line: log the `.node` binary SHA256 to pin reproducibility.

**Confidence:** high — all three backends are operational, the methodology is
sound for Tier-1, and gaps are documented.

## Sources

1. [SQLite FTS5 Extension](https://www.sqlite.org/fts5.html) — official docs, high credibility, neutral
2. [FTS5 regression 3.51.0](https://sqlite.org/forum/info/f3b326d7b1584fde20c42a8f94bbe138e5aa6a0206a5f6cc868b6d9cc8a2f77d) — SQLite forum, high credibility, neutral (regression confirmed)
3. [napi-rs official](https://napi.rs/) — official docs, high credibility, positive
4. [napi-rs N-API overhead](https://blog.logrocket.com/improving-node-js-performing-rust/) — engineering blog, medium-high, neutral/cautionary
5. [Rust vs Node.js 2026](https://www.mgsoftware.nl/en/vergelijking/rust-vs-nodejs) — comparison blog, medium, neutral
6. [Mem0 Token Optimization 2026](https://mem0.ai/blog/the-2026-token-optimization-playbook-cut-ai-agent-memory-costs-3%E2%80%934x) — vendor blog (bias: pro-Mem0), medium-low, positive toward memory systems
7. [State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026) — vendor blog, medium-low, positive
8. [Active Context Compression arxiv](https://arxiv.org/pdf/2601.07190) — academic, high credibility, neutral
9. [Context compression methodology critique](https://medium.com/the-ai-forum/automatic-context-compression-in-llm-agents-why-agents-need-to-forget-and-how-to-help-them-do-it-43bff14c341d) — Medium engineering blog, medium, cautionary
10. [SQLite FTS5 trigram performance](https://andrewmara.com/blog/faster-sqlite-like-queries-using-fts5-trigram-indexes) — engineering blog, medium-high, positive
