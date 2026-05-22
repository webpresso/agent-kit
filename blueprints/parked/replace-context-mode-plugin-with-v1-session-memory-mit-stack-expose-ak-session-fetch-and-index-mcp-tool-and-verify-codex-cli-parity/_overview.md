---
type: blueprint
status: parked
complexity: L
created: '2026-05-14'
last_updated: '2026-05-15'
progress: '0% (parked — refined to current repo layout on 2026-05-15; awaits BP A + WAL BP + benchmark harness)'
depends_on:
  - make-context-mode-an-opt-in-dependency-in-agent-kit-so-consumers-can-ship-without-the-elv2-plugin-loaded-by-default
  - harden-session-store-multi-window-wal-safety-with-deterministic-concurrency-tests-across-all-session-tools
  - token-savings-benchmark-harness-ak-bench-session-memory
tags: [ai-memory, mit, ssrf, codex, parked]
---

# Replace context-mode with a persistent MIT ai-memory tool stack

> **STATUS: PARKED.** BP A now removes default ELv2 exposure. This BP is
> the longer-horizon product work: build the first persistent MIT
> ai-memory-backed session tool family, including a fetch/index path.

**Goal:** Ship a fully MIT agent-memory/tooling path that replaces the
most important context-mode capabilities without bundling ELv2. Current
repo reality: there is **no** `src/session-memory/*` engine and no
shipped `wp_session_*` MCP tool family. What does exist is:
- `src/ai-memory/*` — in-memory checkpoint/fact/retrieval primitives
- `src/blueprint/db/*` — the current shared SQLite boundary
- `src/mcp/*` — MCP discovery/registration infrastructure

This BP therefore owns creating the **first persistent ai-memory-backed
session tool family**, not just wrapping an already-existing fetch
engine.

## Provenance

This blueprint was eng-reviewed and Codex-reviewed on 2026-05-14, then
refined again on 2026-05-15 after discovering the original
`session-memory` file map no longer matched the repo. The split remains
correct:
- BP A handles urgent ELv2 optionality
- WAL BP validates the shared SQLite foundation
- this BP creates the persistent MIT replacement product

## Product wedge anchor

- **Stage outcome:** after BP A ships, consumers can avoid ELv2 by
  default. This BP restores the missing product capability by shipping a
  persistent MIT session tool family built on `ai-memory`.
- **Consuming surface:** new `wp_session_*` MCP tools, discovered via the
  existing MCP auto-discovery layer and consumable from Claude Code,
  Codex, and OpenCode through the agent-kit MCP server.
- **New user-visible capability:** consumers get persistent search,
  execution context, and fetch/index memory flows without depending on
  context-mode.

## Architecture Overview

```text
CURRENT:
  ai-memory primitives
    ├── checkpoint saver abstraction
    ├── fact extractor / consolidator
    └── hierarchical retriever

  shared SQLite boundary
    └── src/blueprint/db/*

TARGET AFTER THIS BP:
  persistent ai-memory store
    ├── SQLite-backed checkpoint/fact persistence
    ├── MIT fetch/index ingest pipeline
    └── wp_session_* MCP tools
         ├── wp_session_search
         ├── wp_session_execute
         ├── wp_session_batch_execute
         └── wp_session_fetch_and_index
```

## Key Decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D1 | Build on `src/ai-memory/*`, not the non-existent `src/session-memory/*` tree | Fact-checked against current repo |
| D2 | Reuse the validated shared SQLite boundary from WAL BP rather than inventing a second DB layer | Reduces persistence drift |
| D3 | `wp_session_fetch_and_index` is the new fetch/index surface, but it is part of a **tool family**, not a standalone one-off | Current repo has no shipped `wp_session_*` tools |
| D4 | SSRF protection must use a third-party MIT/Apache dependency | Do not own bespoke SSRF logic |
| D5 | Cache identity is composite (`url + normalized options + parser version`) | Prevent stale artifact reuse |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents |
| **Wave 1** | 1.3, 1.4 | 1.1 | 2 agents |
| **Wave 2** | 1.5 | 1.2, 1.3, 1.4 | 1 agent |
| **Wave 3** | 1.6, 1.7 | 1.5 | 2 agents |
| **Critical path** | 1.1 → 1.3 → 1.5 → 1.7 | — | 4 waves |

### Parallel Metrics Snapshot

| Metric | Target | Actual |
| --- | --- | --- |
| RW0 | ≥ planned agents / 2 | 2 |
| CPR | ≥ 2.5 | 1.75 |
| DD | ≤ 2.0 | 1.14 |
| CP | 0 | 0 |

Refinement delta: this remains a large product BP with one unavoidable
fan-in at the “first usable tool family” checkpoint; keep the split by
subsystem, not by tiny file edits.

### Phase 1: persistent ai-memory foundation + MCP tool family [Complexity: L]

#### [backend] Task 1.1: Add SQLite-backed ai-memory persistence primitives

**Status:** todo

**Depends:** None

Create the first persistent implementation layer for the current
`ai-memory` abstractions:
- checkpoint persistence
- fact persistence
- retrieval-facing store access

This work should reuse the shared SQLite boundary validated by the WAL
BP rather than inventing a separate persistence mechanism.

**Files:**

- Create: `src/ai-memory/store/sqlite-checkpoints.ts`
- Create: `src/ai-memory/store/sqlite-facts.ts`
- Create: `src/ai-memory/store/sqlite-store.test.ts`
- Modify: `src/ai-memory/index.ts`

**Steps (TDD):**

1. Write failing tests for checkpoint save/load/list and fact
   insert/update/query behavior.
2. Implement SQLite-backed persistence on top of the shared DB layer.
3. Re-run tests to green.

**Acceptance:**

- [ ] ai-memory abstractions have a real persistent implementation
- [ ] checkpoint and fact persistence are both test-covered
- [ ] no second ad hoc DB boundary is introduced

#### [backend] Task 1.2: Add a persistent retrieval integration test

**Status:** todo

**Depends:** None

Prove the new SQLite-backed store works end to end with the existing
hierarchical retriever.

**Files:**

- Create: `src/ai-memory/persistent-retrieval.integration.test.ts`

**Acceptance:**

- [ ] persisted checkpoints + facts are retrievable through the real
      retriever path
- [ ] retrieval behavior is deterministic

#### [backend] Task 1.3: Build the MIT fetch/index ingest pipeline

**Status:** todo

**Depends:** Task 1.1

Implement the actual fetch/index engine that does not currently exist:
- HTTP/HTTPS-only input
- SSRF protection via third-party MIT/Apache dependency
- 5 MB decompressed-body cap
- redirect validation
- extracted/chunked content persisted into the SQLite-backed ai-memory
  store

**Files:**

- Create: `src/ai-memory/ingest/fetch-and-index.ts`
- Create: `src/ai-memory/ingest/fetch-and-index.test.ts`
- Modify: `package.json`

**Acceptance:**

- [ ] engine exists and is fully test-covered
- [ ] SSRF + size-cap + protocol gates are enforced
- [ ] persisted output is consumable by later `wp_session_*` tools

#### [backend] Task 1.4: Add composite cache identity for fetched sources

**Status:** todo

**Depends:** Task 1.1

Add source/cache persistence keyed by:
- URL
- normalized options
- parser version

**Files:**

- Create or modify: persistence/schema files introduced in Task 1.1
- Create or modify: ingest tests from Task 1.3

**Acceptance:**

- [ ] same URL + different options are not treated as the same cached artifact
- [ ] cache hit behavior is deterministic and test-covered

#### [mcp] Task 1.5: Add the first `wp_session_*` MCP tool family

**Status:** todo

**Depends:** Task 1.2, Task 1.3, Task 1.4

Introduce the new MCP tool family, discovered through the existing
auto-discovery layer:
- `wp_session_search`
- `wp_session_execute`
- `wp_session_batch_execute`
- `wp_session_fetch_and_index`

If search/execute/batch are still too large to ship together after the
foundation lands, split them into a follow-up only **after** a first
usable family shape exists in this blueprint.

**Files:**

- Create: `src/mcp/tools/session-search.ts`
- Create: `src/mcp/tools/session-execute.ts`
- Create: `src/mcp/tools/session-batch-execute.ts`
- Create: `src/mcp/tools/session-fetch-and-index.ts`
- Create matching `*.test.ts` files
- Modify: MCP discovery tests as needed

**Acceptance:**

- [ ] all four tools are discoverable through MCP auto-discovery
- [ ] tool handlers exercise the new persistent ai-memory layer
- [ ] input/output schemas are explicit and tested

#### [qa] Task 1.6: Discovery + host/runtime confidence for the new tool family

**Status:** todo

**Depends:** Task 1.5

Extend the current host-confidence lane so the new `wp_session_*` tools
are present and executable across provider surfaces.

**Files:**

- Modify: MCP discovery tests
- Modify: host/runtime confidence tests in the current hook/setup lanes

**Acceptance:**

- [ ] every expected `wp_session_*` tool is auto-discovered
- [ ] provider/runtime confidence tests fail if the tool family regresses

#### [infra] Task 1.7: Benchmark + parity gate

**Status:** todo

**Depends:** Task 1.5

Use the existing benchmark harness blueprint to compare:
- new MIT path before/after internal changes
- new MIT path vs current context-mode baseline where applicable

**Files:**

- Modify: benchmark harness wiring/tests
- Create: focused parity evidence output if needed

**Acceptance:**

- [ ] no internal regression beyond the agreed threshold
- [ ] parity evidence against the old flow is captured

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Type safety | `wp_typecheck` | Zero errors |
| Lint | `wp_lint` (scoped) | Zero violations |
| Tests | `wp_test` (scoped) | All new tool/store tests pass |
| Discovery | MCP discovery tests | All `wp_session_*` tools present |
| Bench | benchmark harness gate | Meets parity/regression thresholds |

## Cross-Plan References

| Type | Blueprint | Relationship |
| --- | --- | --- |
| Upstream | `make-context-mode-an-opt-in-dependency...` | Ships first so this work is no longer urgent compliance work |
| Upstream | `harden-session-store-multi-window-wal-safety...` | Validates the shared SQLite foundation before persistent ai-memory work depends on it |
| Upstream | `token-savings-benchmark-harness-ak-bench-session-memory` | Supplies the benchmark/parity gate |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --- | --- | --- | --- |
| Current repo has no legacy session-memory engine to wrap | Plan drift | Build first persistent implementation on `ai-memory`, do not reference dead paths | 1.1–1.5 |
| Shared SQLite abstraction proves insufficient for ai-memory persistence | Scope growth | Stop and split a focused persistence-foundation follow-up if the WAL BP is not enough | 1.1 |
| Host confidence for new tools lags discovery | False sense of completion | Keep provider/runtime confidence tied to the same blocking lane as hook verification | 1.6 |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| This BP is larger than originally framed because the underlying engine does not exist | High | Keep strict subsystem boundaries and require WAL BP first |
| Fetch/index safety work introduces too much surface in one pass | Medium | Keep all safety gates in tests before exposing the tool publicly |

## Technology Choices

| Component | Technology | Version | Why |
| --- | --- | --- | --- |
| Memory primitives | `src/ai-memory/*` | current repo | Actual existing memory layer |
| Persistence boundary | shared SQLite in `src/blueprint/db/*` | current repo | Only real SQLite/WAL owner today |
| SSRF | third-party MIT/Apache dependency | TBD by implementation spike | Avoid bespoke network-security logic |
