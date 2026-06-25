---
type: research
last_updated: "2026-06-21"
---

# Context-Management Feature Parity Matrix

**Date:** 2026-06-21
**Status:** All agent-kit claims fact-checked against repo source and
codex-verified (2026-06-21). Competitor figures are point-in-time snapshots —
see the data-freshness note at the end.

---

## 1. Competitor Snapshot

|                      | **context-mode**       | **headroom**                  | **RTK**            | **OpenCode DCP**        | **agent-kit**              |
| -------------------- | ---------------------- | ----------------------------- | ------------------ | ----------------------- | -------------------------- |
| **Repo**             | `mksglu/context-mode`  | `chopratejas/headroom`        | `rtk-ai/rtk`       | `opencode-ai/opencode`  | `webpresso/agent-kit`      |
| **Stars (snapshot)** | ~17.9k                 | ~42.6k                        | ~64.3k             | ~28k                    | N/A                        |
| **License**          | Elastic 2.0            | Apache 2.0                    | Apache 2.0         | Apache 2.0              | Elastic 2.0                |
| **Language**         | TypeScript (100%)      | Python 79% / Rust 16% / TS 2% | Rust (100%)        | Go (100%)               | TypeScript 95% / Rust 5%   |
| **Version**          | npm published          | v0.26.0 (156 releases)        | v0.42.4            | v0.x (built-in feature) | pre-1.0                    |
| **Scope**            | Context mgmt + sandbox | Context compression + proxy   | CLI output filters | Native session compact  | Session continuity + CI/QA |

---

## 2. Core Approach — How Each Solves Context Bloat

| Mechanism                     |                     context-mode                      |                           headroom                           |                     RTK                      |                     OpenCode DCP                     |                           agent-kit                            |
| ----------------------------- | :---------------------------------------------------: | :----------------------------------------------------------: | :------------------------------------------: | :--------------------------------------------------: | :------------------------------------------------------------: |
| **Sandbox execution**         |         ✅ 12 languages, isolated subprocess          |                              ❌                              |                      ❌                      |                          ❌                          |                   ✅ Rust sandbox, streaming                   |
| **Batch execution**           |       ✅ `ctx_batch_execute` (concurrency 1–8)        |                              ❌                              |                      ❌                      |                          ❌                          |              ✅ `wp_session_batch_execute` (1–8)               |
| **File sandbox**              | ✅ `ctx_execute_file` (FILE_CONTENT never in context) |                              ❌                              |                      ❌                      |                          ❌                          |                  ✅ `wp_session_execute_file`                  |
| **Content-type compression**  |                          ❌                           | ✅ 7 types (JSON, code AST, logs, diffs, HTML, text, search) |           ✅ 10 filter strategies            |                          ❌                          | ⚠️ 4 transforms (vitest JSON, oxlint, tsc, generic error-line) |
| **ML compression**            |                          ❌                           |           ✅ Kompress-v2 (149M params, LoRA, ONNX)           |                      ❌                      |                          ❌                          |                               ❌                               |
| **Output verbosity steering** |                          ❌                           |    ✅ 5 levels (L0–L4) + effort routing + thinking clamp     |                      ❌                      |                          ❌                          |                               ❌                               |
| **Command-level filtering**   |                          ❌                           |                              ❌                              | ✅ 100+ commands, per-command filter modules |                          ❌                          |                               ❌                               |
| **Proxy/sidecar mode**        |                          ❌                           |              ✅ OpenAI-compatible proxy, Docker              |         ✅ `rtk proxy` for tracking          |               ❌ (native, not a proxy)               |                               ❌                               |
| **Native session compact**    |                          ❌                           |                              ❌                              |                      ❌                      | ✅ auto-compact at 95% context limit, LLM summarizes |            ❌ (agent-kit restores, doesn't compact)            |

---

## 3. Search & Retrieval

| Capability                 |                      context-mode                      |        headroom         | RTK |               OpenCode DCP                |                                                                          agent-kit                                                                          |
| -------------------------- | :----------------------------------------------------: | :---------------------: | :-: | :---------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------: |
| **FTS5 search engine**     |      ✅ bun:sqlite / node:sqlite / better-sqlite3      |  ✅ SQLite (CCR cache)  | ❌  | ❌ (SQLite for sessions only, not search) |                                                                 ✅ SQLite via Rust napi-rs                                                                  |
| **Porter stemming**        |                           ✅                           |           ❌            | ❌  |                    ❌                     |                                                                             ✅                                                                              |
| **Trigram index**          |                           ✅                           |           ❌            | ❌  |                    ❌                     |                                                                             ✅                                                                              |
| **BM25 ranking**           |                           ✅                           | ✅ (CCR retrieval only) | ❌  |                    ❌                     |                                                                             ✅                                                                              |
| **Reciprocal Rank Fusion** |            ✅ (RRF merges porter + trigram)            |           ❌            | ❌  |                    ❌                     |                                                                  ❌ (sequential fallback)                                                                   |
| **Heading-weighted BM25**  |                 ✅ (titles 5× weight)                  |           ❌            | ❌  |                    ❌                     |                                                                             ❌                                                                              |
| **Levenshtein fallback**   |                           ❌                           |           ❌            | ❌  |                    ❌                     | ✅ third tier, capped 1000-row scan, min score 0.60 — **Rust native: direct similarity `1 − dist/max_len`; TS fallback: IDF-weighted `idfWeight/(1+dist)`** |
| **Cross-session search**   |           ✅ `ctx_search(sort: "timeline")`            |           ❌            | ❌  |                    ❌                     |                                                      ✅ `wp_session_search` (unified events + chunks)                                                       |
| **Web fetch → index**      |   ✅ `ctx_fetch_and_index` (cache TTL, concurrency)    |           ❌            | ❌  |                    ❌                     |                                                               ✅ `wp_session_fetch_and_index`                                                               |
| **Content indexing**       | ✅ `ctx_index` (chunk by headings, code blocks intact) |           ❌            | ❌  |                    ❌                     |                                                    ✅ `wp_session_index` (512-token chunks, tiktoken-rs)                                                    |
| **Retrieval latency**      |                       ~1ms FTS5                        |     ~1ms SQLite LRU     | N/A |                    N/A                    |                                                                  ~1ms FTS5 (sync hot path)                                                                  |

---

## 4. Session Continuity & Memory

| Capability                    |     context-mode      |                      headroom                      | RTK |       OpenCode DCP       |                 agent-kit                  |
| ----------------------------- | :-------------------: | :------------------------------------------------: | :-: | :----------------------: | :----------------------------------------: |
| **Session event capture**     |      ✅ 11 types      |                         ❌                         | ❌  |            ❌            |                ✅ 11 types                 |
| **Post-compaction restore**   |  ✅ search + inject   |                         ❌                         | ❌  | ✅ LLM summary injection | ✅ `wp_session_restore` bounded injection  |
| **Pre-compaction snapshot**   | ✅ SQLite snapshot DB |                         ❌                         | ❌  |            ❌            | ✅ time-capped + byte-capped JSON snapshot |
| **Cross-agent shared memory** |          ❌           |       ✅ SharedContext (Claude/Codex/Gemini)       | ❌  |            ❌            |                     ❌                     |
| **Session learning (TOIN)**   |          ❌           | ✅ learns compression patterns, per-user, per-tool | ❌  |            ❌            |                     ❌                     |
| **Failure mining**            |          ❌           |      ✅ `headroom learn` reads session JSONL       | ❌  |            ❌            |                     ❌                     |

---

## 5. Context Reduction — Benchmarked Results

| Metric                             |            context-mode             |                     headroom                     |                RTK                |      OpenCode DCP       |                                  agent-kit                                  |
| ---------------------------------- | :---------------------------------: | :----------------------------------------------: | :-------------------------------: | :---------------------: | :-------------------------------------------------------------------------: |
| **Claimed reduction**              |       96–98% (built-in tools)       |            47–94% (content-dependent)            |      60–90% (100+ commands)       | N/A (LLM summarization) |                   N/A — no public measured benchmarks yet                   |
| **Benchmarked scenarios**          |     21 (real MCP tool outputs)      |   4 workloads + 6 content-type microbenchmarks   | 10 filter strategies, per-command |           N/A           |                   Methodology exists; result cards empty                    |
| **Synthetic data?**                |  No — real Claude Code MCP outputs  |  No — real tool outputs + production telemetry   |   No — real CLI command outputs   |           N/A           |                                     N/A                                     |
| **Provider token cost measured**   |    ❌ (extrapolated from bytes)     |         ✅ 95% CI estimate + A/B holdout         |        ❌ (approx tokens)         |           ❌            | ⚠️ `approxTokensSaved = floor(gainBytes/4)`, explicitly labeled approximate |
| **Precision labeling**             |            Not declared             |               `estimated` with CI                |           Not declared            |      Not declared       |                 `exact_utf8_bytes_approx_tokens` — explicit                 |
| **Production evidence (snapshot)** |  287k npm users, enterprise logos   |  1.4B tokens saved, 50k sessions, 250 instances  |      No public number cited       | No public number cited  |                              Pre-release only                               |
| **Accuracy preserved**             |      N/A (sandbox, not lossy)       | ✅ 4 benchmarks (GSM8K, TruthfulQA, SQuAD, BFCL) |      ✅ exit codes preserved      |  N/A (LLM summarizes)   |                  N/A (transforms structural, not semantic)                  |
| **Reversible?**                    | ✅ (FTS5, full content retrievable) |   ✅ CCR (Compress-Cache-Retrieve, hash-keyed)   |       ❌ (lossy, no cache)        | ❌ (lossy, summarized)  |                    ✅ (elision → `wp_session_retrieve`)                     |

---

## 6. Performance & Latency

| Metric                            |       context-mode        |                headroom                 |                           RTK                           |     OpenCode DCP     |                    agent-kit                    |
| --------------------------------- | :-----------------------: | :-------------------------------------: | :-----------------------------------------------------: | :------------------: | :---------------------------------------------: |
| **Capture hot path**              |    <1ms (FTS5 search)     |           52ms (proxy median)           |                  5–15ms (per command)                   | N/A (LLM call cost)  | `capture_event` target <0.5ms; bench gate ≤2ms  |
| **Startup time**                  |     <100ms (Node/Bun)     |   <500ms (Python import + ONNX load)    |                5–10ms (cold Rust binary)                |  N/A (part of host)  |          <50ms (prebuilt .node addon)           |
| **Memory**                        | ~30–50 MB (Node/Bun heap) |    ~200–500 MB (Python + ONNX model)    |                         2–5 MB                          |         N/A          |        ~15–30 MB (Node + napi-rs addon)         |
| **Native engine**                 |      ❌ (pure TS/JS)      | ✅ Rust via maturin/PyO3 + ONNX Runtime |                   ✅ pure Rust binary                   |  ✅ pure Go binary   |     ✅ Rust via napi-rs, prebuilt binaries      |
| **Streaming execution**           |       ❌ (buffered)       |              ❌ (buffered)              |                      ❌ (buffered)                      |          ❌          |    ✅ 8KB chunks, 2048-byte flush, 1MiB cap     |
| **Thread-local connection cache** |            ❌             |                   ❌                    |                           ❌                            |          ❌          |     ✅ (zero re-open cost on repeat calls)      |
| **Release optimizations**         |  ❌ (TS, no compilation)  |            ❌ (Python wheel)            | ✅ (`lto = true`, `codegen-units = 1`, `opt-level = 3`) | ✅ Go release build  | ✅ `opt-level=3`, `lto=thin`, `codegen-units=1` |
| **Runtime requirements**          |    Node >=22.5 or Bun     |              Python 3.10+               |                  None (static binary)                   | None (static binary) |          Node (native addon optional)           |

> Regression thresholds enforced in CI (`docs/bench/session-memory-methodology.md`):
> `post_tool_capture_latency_ms` ≤750, `precompact_snapshot_latency_ms` ≤1000,
> `startup_resume_injection_latency_ms` ≤750, `search_quality_recall_at_5` ≥0.8.

---

## 7. Security & Safety

| Capability                 |                   context-mode                    |             headroom              |                     RTK                     |    OpenCode DCP     |                       agent-kit                       |
| -------------------------- | :-----------------------------------------------: | :-------------------------------: | :-----------------------------------------: | :-----------------: | :---------------------------------------------------: |
| **Secrets redaction**      |                ✅ MCP arg masking                 |                ❌                 |                     ❌                      |         ❌          |  ✅ `no-dev-vars` audit, secret-provider quarantine   |
| **IP guard for fetch**     | ✅ DNS-rebinding defense, IMDS block, strict mode |                ❌                 |                     ❌                      |         ❌          |      ✅ `ip-guard.ts`, RFC1918/loopback control       |
| **Credential passthrough** |       ✅ (env in sandbox, not conversation)       |                N/A                | ✅ (passthrough, no transformation of env)  |         N/A         |             ✅ `with-secrets` secret gate             |
| **Purge safety**           |             ✅ confirm:true required              |                ❌                 |                     ❌                      |         ❌          | ✅ confirm:true, scoped, global requires dual confirm |
| **Timeout protection**     |               ✅ MCP tool timeouts                |                ❌                 |                     ❌                      |         ❌          |        ✅ per-command, SIGKILL, exit code 124         |
| **Data locality**          |                   ✅ all local                    | ✅ all local (ML model local too) |                ✅ all local                 |    ✅ all local     |                     ✅ all local                      |
| **No LLM in pipeline**     |                        ✅                         |  ✅ (ML is local ONNX, not API)   |                     ✅                      | ❌ (LLM summarizes) |                          ✅                           |
| **Exit code preservation** |                  ✅ (subprocess)                  |         ✅ (passthrough)          | ✅ (explicitly preserves exit codes for CI) |         N/A         |                          ✅                           |

---

## 8. Tool & Command Surface

| Capability                      |      context-mode       |                            headroom                            |                                    RTK                                    |  OpenCode DCP   |                     agent-kit                      |
| ------------------------------- | :---------------------: | :------------------------------------------------------------: | :-----------------------------------------------------------------------: | :-------------: | :------------------------------------------------: |
| **MCP tools**                   | 11 (6 sandbox + 5 meta) |                 3 (compress, retrieve, stats)                  |                           0 (CLI proxy, no MCP)                           | 0 (native host) |   ~28 compiled + blueprint MCP tools (>30 total)   |
| **Per-command filter modules**  |           ❌            |                               ❌                               |                             ✅ 100+ commands                              |       ❌        |                         ❌                         |
| **Test runner filters**         |           ❌            |                               ❌                               | ✅ vitest, jest, playwright, pytest, go test, cargo test, rspec, minitest |       ❌        |          ⚠️ vitest (JSON) + oxlint + tsc           |
| **Git command filters**         |           ❌            |                               ❌                               |                 ✅ status, log, diff, branch, stash, show                 |       ❌        |                         ❌                         |
| **Package manager filters**     |           ❌            |                               ❌                               |                      ✅ npm, pnpm, yarn, pip, cargo                       |       ❌        |                         ❌                         |
| **Lint filter**                 |           ❌            |                               ❌                               |           ✅ ruff, eslint, oxlint, tsc, golangci-lint, prettier           |       ❌        |                  ⚠️ oxlint + tsc                   |
| **Code reading filters**        |           ❌            |                               ❌                               |               ✅ read (3 levels), smart (heuristic summary)               |       ❌        |                         ❌                         |
| **Log deduplication**           |           ❌            |              ✅ LogCompressor pattern clustering               |                            ✅ `rtk log` dedup                             |       ❌        |                         ❌                         |
| **HTML extraction**             |           ❌            |                   ✅ trafilatura (F1 0.919)                    |                                    ❌                                     |       ❌        |                         ❌                         |
| **JSON/structured compression** |           ❌            | ✅ SmartCrusher (Kneedle, SimHash dedup, anomaly preservation) |                 ✅ `rtk json` (structure without values)                  |       ❌        |                         ❌                         |
| **Blueprint/planning**          |           ❌            |                               ❌                               |                                    ❌                                     |       ❌        | ✅ lifecycle, dependency graph, evidence contracts |
| **Audit surface**               |           ❌            |                               ❌                               |                                    ❌                                     |       ❌        |        ✅ 30+ packaged audits (CLI surface)        |
| **CI integration**              |           ❌            |                               ❌                               |                                    ❌                                     |       ❌        |              ✅ `wp ci_act`, `wp_qa`               |
| **Release management**          |           ❌            |                               ❌                               |                                    ❌                                     |       ❌        |          ✅ Changeset, release readiness           |
| **Tech debt**                   |           ❌            |                               ❌                               |                                    ❌                                     |       ❌        |                 ✅ `wp tech-debt`                  |
| **Worktree management**         |           ❌            |                               ❌                               |                                    ❌                                     |       ❌        |                  ✅ `wp worktree`                  |

---

## 9. Unique Differentiators (per tool)

### context-mode — best at:

- **Think-in-Code paradigm** — prevents raw data from ever touching context.
- **Heading-weighted BM25 + RRF** — best search quality; RRF merges porter + trigram results.
- **Zero native deps** — auto-detects bun:sqlite, node:sqlite, or better-sqlite3.
- **Broadest platform support** (15 platforms, 13 with full hook enforcement).

### headroom — best at:

- **Only reversible compressor** — CCR (Compress-Cache-Retrieve), hash-keyed.
- **Content-type auto-detection** — ContentRouter picks the optimal compressor with no hints.
- **ML text compression** — Kompress-v2 (149M, Apache-2.0) with adjustable thresholds.
- **Output token reduction** — verbosity steering + effort routing, 95% CI measurement.
- **Framework integrations** — Anthropic, OpenAI, Vercel AI SDK, LiteLLM, LangChain, Agno, Strands.
- **Apache 2.0** — most permissive license.

### RTK — best at:

- **Per-command filter breadth** — 100+ commands with tailored filter logic.
- **10 filter strategies** — stats extraction, error-only, grouping, dedup, test-failure focus, code stripping (3 levels), tree, progress, JSON/text dual mode, structured state-machine parsing.
- **Minimal footprint** — single Rust binary, 5–10ms cold start, 2–5 MB RAM.
- **Exit code preservation** — designed for CI reliability.
- **Apache 2.0** — permissive license.

### OpenCode DCP — best at:

- **Zero configuration** — native host feature, no install.
- **LLM-summarized compaction** — may capture semantic meaning better than algorithmic approaches.
- **Not a standalone tool** — only relevant within OpenCode.

### agent-kit — best at:

- **Session continuity across compaction** — preserves and restores typed session events across compactions (verified: 11 event types, snapshot/restore).
- **Blueprint-aware context** — links context management to structured task planning with dependency graph and evidence contracts.
- **Full CI/QA pipeline** — tests, lint, typecheck, audits, e2e, mutations.
- **Rust native engine** — napi-rs, streaming execution (never full in memory), thread-local connection caches.
- **Deterministic byte accounting** — `exact_utf8_bytes_approx_tokens` precision labeling.
- **Per-worktree isolation** — parallel agent sessions without cross-contamination.
- **Three-tier search with Levenshtein fallback** — Rust native uses direct similarity, TS fallback uses IDF-weighted scoring (per-backend).

---

## 10. Agent-kit Gap Analysis & Prioritized Improvements

_(Platform scope is intentionally capped at 4 — Claude Code + Codex (Tier 1),
Cursor + OpenCode (Tier 2) per `catalog/agent/rules/supported-agent-clis.md`.
Breadth differences vs context-mode's 15 platforms are a design choice, not a
gap. Focus below is efficiency, quality, and feature depth.)_

> **DX read on this roadmap:** the single highest **adoption** lever here is
> **proxy/HTTP mode (#6)** — it is the only item that changes _who can adopt_
> agent-kit (zero-code, any OpenAI-compatible client, no MCP wiring), the wedge
> both headroom and RTK lead with. Engineering effort keeps it in Tier 2, but
> for zero-friction-at-T0 it is the top adoption lever. **Test-runner breadth
> (#10)** is an **accessibility gate**, not a minor add: today only vitest gets
> structural parsing, so Python/Rust/Go consumers (and Stryker/Playwright shops)
> get silent passthrough and no context savings.

### Tier 1 — Quick wins (each <200 LOC, <1 day)

| #   | Gap                              | Competitor with it                         | What to build                                                                                                              | Impact                                         |
| --- | -------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | **RRF search fusion**            | context-mode                               | Merge porter + trigram results via Reciprocal Rank Fusion instead of sequential fallback. ~50 LOC Rust + ~50 LOC TS.       | Search quality — fewer false negatives         |
| 2   | **Heading-weighted BM25**        | context-mode                               | 5× weight to heading terms in BM25 scoring. ~30 LOC Rust.                                                                  | Navigational search precision                  |
| 3   | **JSON array dedup transform**   | headroom SmartCrusher, RTK `rtk json`      | Detect JSON arrays, factor out constant fields, keep error items, report N→K. ~100 LOC TS.                                 | Biggest single source of MCP tool-output bloat |
| 4   | **Build-log pattern clustering** | headroom LogCompressor, RTK error grouping | Cluster repeated error lines by rule/pattern. Extend existing vitest/oxlint/tsc parsing. ~100 LOC TS.                      | Reduces test/lint output                       |
| 5   | **Publish hot-path benchmarks**  | N/A (agent-kit advantage)                  | Run existing criterion benchmarks (`native/session-memory-engine/.../benches/hot_path.rs`), publish result cards. ~1 hour. | Proves latency claims with data                |

### Tier 2 — Medium effort (200–500 LOC, 1–3 days)

| #   | Gap                                                                          | Competitor with it          | What to build                                                                                        | Impact                                                                |
| --- | ---------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 6   | **Proxy/HTTP mode** _(top adoption lever — zero-code wedge)_                 | headroom, RTK               | `wp proxy`: OpenAI-compatible HTTP proxy with session-memory middleware + auto-elision. ~500 LOC TS. | Zero-code integration for any OpenAI client — changes _who can adopt_ |
| 7   | **Verbosity steering**                                                       | headroom                    | Inject compactness instruction at tail of system prompt (cache-safe). ~200 LOC TS.                   | Reduces model output tokens                                           |
| 8   | **Auto re-expansion of elided content**                                      | headroom CCR ContextTracker | Track elided outputs across turns; proactively re-inject before the LLM asks. ~300 LOC TS.           | Makes elision invisible to the model                                  |
| 9   | **Code reading transform (3 levels)**                                        | RTK `rtk read`              | `none` / `minimal` (strip comments) / `aggressive` (strip bodies, keep signatures). ~200 LOC TS.     | Prevents flooding context with implementation detail                  |
| 10  | **Test-runner filter breadth** _(accessibility gate for polyglot consumers)_ | RTK (8 runners)             | Add jest, pytest, cargo-test structured failure parsers. ~100 LOC each.                              | Non-vitest repos currently get silent passthrough / no savings        |

### Tier 3 — Larger investments (500+ LOC, 1+ weeks)

| #   | Gap                                                           | Competitor with it      | What to build                                                                                                                                                              | Impact                                                    |
| --- | ------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 11  | **Content-type auto-detection**                               | headroom ContentRouter  | Classify tool output by structure, route to best transform. ~500 LOC TS.                                                                                                   | Removes need for the LLM to pick a transform              |
| 12  | **Session learning (TOIN-light)**                             | headroom TOIN           | Per-tool retrieval telemetry; auto-tune elision thresholds across sessions. ~400 LOC TS + DB.                                                                              | Self-improving context budget                             |
| 13  | **Framework SDK wrappers**                                    | headroom                | `withAgentKit(client)` for Anthropic/OpenAI/Vercel AI SDK. ~300 LOC each.                                                                                                  | Adoption beyond MCP                                       |
| 14  | **Cross-agent shared session store**                          | headroom SharedContext  | Shared FTS5 index across Claude/Codex/Cursor with read-locks + provenance. ~400 LOC Rust + DB.                                                                             | Multi-agent handoffs                                      |
| 15  | **Actionable failure output** _(new — DX: fight uncertainty)_ | (none — agent-kit lead) | Make compacted lint/test `failures[]` carry problem + cause + fix (+ doc link where available), so an agent consuming compacted output fixes the right thing. ~300 LOC TS. | Failure representation quality decides agent fix accuracy |

### Not worth pursuing

| Feature                             | Why                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| ML compression model                | Algorithmic-only by design; Kompress-v2 needs Python + ONNX + memory.           |
| Image compression                   | agent-kit is text/CLI/tooling infrastructure, not multimodal.                   |
| Per-command CLI wrapper (RTK-style) | agent-kit works at MCP-tool level, not shell level.                             |
| OpenCode native auto-compact        | OpenCode is a competitor host, not a tool to emulate.                           |
| More platforms (beyond 4)           | Intentional scope per `supported-agent-clis.md`; promotion is a gated decision. |

---

## 11. Efficiency/Productivity Improvement Summary

### Verified advantages (traceable to source)

- **Session continuity across compaction** — 11 typed event types, snapshot +
  `wp_session_restore` (no competitor preserves typed session events this way).
- **Blueprint + context integration** — context management linked to task
  planning with dependency graph and evidence contracts.
- **Deterministic precision labeling** — `exact_utf8_bytes_approx_tokens`; the
  only tool explicit about what is exact vs approximate.
- **Per-worktree isolation** — parallel sessions without cross-contamination.
- **Rust native engine** — napi-rs, streaming execution, thread-local caches
  (headroom and RTK also use Rust; binding/architecture differ).

### Projected wins (need published benchmarks before claiming superiority)

agent-kit has **no public measured context-reduction benchmarks yet** (§5), and
`<0.5ms` capture is a target, not the enforced gate (≤2ms). So the following are
**projected**, pending result cards — not current measured facts:

- **Search quality** — once RRF fusion (Tier 1 #1) and heading-weighted BM25
  (#2) land, agent-kit's three-tier search (RRF + heading weighting + Levenshtein
  fallback) is positioned to match or exceed context-mode. Unproven until benchmarked.
- **Structural compression** — JSON dedup (#3) + build-log clustering (#4) would
  approach headroom SmartCrusher / RTK structured filters. Unproven until benchmarked.
- **Latency** — publishing the existing criterion benchmarks (#5) is the
  prerequisite for any speed-superiority claim.

**Highest-ROI next steps:** RRF fusion (#1), JSON array dedup (#3), publish
benchmarks (#5) for credibility, then proxy mode (#6) as the adoption wedge.

---

> **Data-freshness note:** Competitor star counts, download numbers, and
> production-token figures are from a single research fetch on 2026-06-21 and are
> point-in-time snapshots. Architecture and algorithm claims are sourced from the
> competitors' READMEs and are comparatively stable. agent-kit rows are verified
> against this repository's source as of 2026-06-21.
