---
type: blueprint
status: draft
complexity: L
created: '2026-05-13'
last_updated: '2026-05-13'
progress: '15% (fact-checked and refined for Harbor 2.0 + repo-native benchmark assets)'
depends_on: []
tags:
  - benchmark
  - session-memory
  - terminal-bench
  - harbor
  - context-mode
  - decision-gate
---

# Context-tool productivity benchmark suite

## Product wedge anchor

- **Stage outcome:** Decide whether lane-2 session memory should ship as `agent-kit-v1-session-memory`, ship as `agent-kit-v2-ctx-rs`, or keep both parked while main continues to rely on context-mode.
- **Consuming surface:** `reports/session-memory-productivity/latest/decision.md` plus the adjacent reproducibility manifest. That memo is the only artifact allowed to recommend "ship v1", "ship v2", or "park both".
- **New user-visible capability:** A defensible answer to "does session memory improve Claude Code task outcomes enough to justify shipping?" backed by our own cost, pass-rate, and wall-time measurements rather than microbenchmarks or third-party marketing.
- **Recommendation boundary:** The conclusion applies only to this exact setup — Harbor 2.0, Claude Code, four isolated variants, and the locked task set in this repo. It is not a general claim about all agents or all task distributions.

## Problem statement

Three lane-2 variants exist today:

1. **main / context-mode** — the current baseline in active use
2. **v1 / TypeScript engine** — `agent-kit-v1-session-memory`
3. **v2 / Rust ctx-rs engine** — `agent-kit-v2-ctx-rs`

The existing local harness only measures backend latency and lives outside the repo as disposable `/tmp` state. That leaves the real product question unanswered: **does a session-memory plugin reduce cost or improve task completion in realistic coding work enough to ship?**

As of **May 13, 2026**, official Harbor documentation positions **Harbor as the supported harness for Terminal-Bench 2.0**, while the legacy `tb` workflow remains the older Terminal-Bench 1.0 surface. This blueprint therefore treats **Harbor 2.0 as the authoritative Tier 3 productivity harness** and rewrites the benchmark around checked-in, reproducible assets.

Current fact-check findings that shape this blueprint:

- Docker is reachable locally now, so "Docker unavailable" is **not** a standing blocker.
- Harbor / Terminal-Bench Python packages are not yet installed locally, so environment readiness must be proven explicitly.
- v2 already contains `@webpresso/ctx-rs` dependency wiring, backend selection, and core `store.ts` / `session.ts`; the remaining fairness gap is **feature parity + test parity**, not a fresh backend design.
- The benchmark decision is about **shipping remediated variants**, not about comparing the current raw worktrees without parity fixes.

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Repo-native benchmark assets                                               │
│                                                                             │
│ benchmarks/session-memory-productivity/                                     │
│   ├─ manifests/        run + variant contracts                              │
│   ├─ scripts/          preflight, oracle smoke, backend latency             │
│   ├─ ir/               qrels + scorer                                       │
│   └─ tier3/            proxy, settings, Harbor adapter, runner              │
│                                                                             │
│ reports/session-memory-productivity/latest/                                 │
│   ├─ decision.md                                                             │
│   ├─ run-manifest.json                                                      │
│   └─ summary.json                                                           │
│                                                                             │
│ .tmp/session-memory-productivity/<run-id>/                                  │
│   ├─ live logs, proxy jsonl, Harbor output-dir, isolated homes             │
│   └─ deleted / ignored after the run                                        │
└─────────────────────────────────────────────────────────────────────────────┘

                            ┌──────────────────────────┐
                            │  Phase 1 / 2 pre-work   │
                            │  benchmark scaffold +   │
                            │  v2 parity remediation  │
                            └─────────────┬───────────┘
                                          │
                                          ▼
                            ┌──────────────────────────┐
                            │  Phase 3 instrumentation │
                            │  proxy + settings +      │
                            │  Harbor Claude adapter   │
                            └─────────────┬───────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────┐
                    │ Phase 4 execution                           │
                    │ backend latency + Harbor productivity runs  │
                    │ across [baseline, context-mode, v1, v2]     │
                    └─────────────┬───────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────────────────────┐
                    │ Phase 5 decision                            │
                    │ one memo + one manifest + one recommendation│
                    └─────────────────────────────────────────────┘

Variant ↔ worktree mapping:
  baseline      → no lane-2 plugin
  context-mode  → installed context-mode plugin path resolved at runtime
  v1            → /Users/ozby/repos/webpresso/agent-kit-v1-session-memory
  v2            → /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs
                   (depends on /Users/ozby/repos/webpresso/ctx-rs)
```

## Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Tier 3 harness | **Harbor 2.0** via `harbor run -d terminal-bench/terminal-bench-2` | Official current Harbor docs position Harbor as the supported Terminal-Bench 2.0 harness. |
| Legacy `tb` usage | Optional local reference only; never authoritative | Avoids mixing 1.0 and 2.0 numbers in the ship/park recommendation. |
| Durable benchmark assets | Check in code under `benchmarks/session-memory-productivity/` and durable outputs under `reports/session-memory-productivity/` | Makes the benchmark reproducible and reviewable. |
| Ephemeral runtime state | Use `.tmp/session-memory-productivity/<run-id>/` only | Keeps large live logs out of git while preserving deterministic checked-in manifests. |
| Variant identity | Checked-in variant manifest with worktree path, plugin path, env overrides, and immutable commit SHA | Replaces destructive "commit/discard/push" steps with reproducible run metadata. |
| v2 comparison baseline | Benchmark **after** parity and test fixes land | Measures a shippable candidate instead of a knowingly incomplete branch. |
| Token attribution | HTTP proxy is authoritative **only if it fail-closes** when attribution is incomplete | Prevents silently accepting undercounted or misattributed runs. |
| Spend cap | Clean abort between cells / trials, never mid-cell termination | Keeps result state unambiguous and aggregation deterministic. |
| Task selection | Checked-in manifest of **16 tasks**: 8 context-heavy + 8 seeded random | Large enough to expose differences without turning the first iteration into an open-ended research project. |
| IR tier interpretation | Diagnostic only | IR quality can explain productivity outcomes but cannot overrule them. |
| Cache isolation | One API key per variant plus isolated HOME per run | Minimizes cross-variant cache contamination. |
| Default recommendation rule | If parity, attribution, or reproducibility gates fail, **park both** | No shipping recommendation without trustworthy evidence. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5 | None | 8 agents | XS–S |
| **Wave 1** | 1.4, 2.6, 3.1, 3.2, 3.3 | Wave 0 (specific) | 5 agents | S–M |
| **Wave 2** | 3.4, 4.1 | Wave 1 | 2 agents | M |
| **Wave 3** | 4.2 | Wave 2 | 1 agent | M |
| **Wave 4** | 4.3 | Wave 3 + 3.1 + 4.1 | 1 agent | S |
| **Critical path** | 1.3 → 1.4 → 3.4 → 4.2 → 4.3 | — | 5 waves | — |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ 4 | **8** ✓ |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | **17 / 5 = 3.4** ✓ |
| DD | dependency_edges / total_tasks | ≤ 2.0 | **20 / 17 = 1.18** ✓ |
| CP | same-file overlaps per wave | 0 | **0** ✓ |
| Parallelization score | Derived from RW0 / CPR / CP | A or B | **A** |

**Refinement delta:** The prior draft was effectively **B** because Tier 3 depended on stale `tb` assumptions, `/tmp`-only assets, and destructive worktree preparation. This revision widens Wave 0, removes false dependencies, and makes Harbor 2.0 + repo-native artifacts the fixed execution surface.

---

### Phase 1: Benchmark scaffold + reproducibility

#### [infra] Task 1.1: Scaffold repo-native benchmark surfaces

**Status:** todo

**Depends:** None

Create the checked-in benchmark home. This task defines the durable directory layout, the README that explains the benchmark contract, and the run-manifest schema used by every later step. No benchmark logic belongs in `/tmp`; only ephemeral runtime state may live there.

**Files:**

- Create: `benchmarks/session-memory-productivity/README.md`
- Create: `benchmarks/session-memory-productivity/manifests/run-manifest.schema.json`
- Create: `benchmarks/session-memory-productivity/manifests/run-manifest.schema.test.ts`

**Steps (TDD):**

1. Write failing schema test covering required fields: `run_id`, `harness`, `dataset`, `dataset_revision`, `variant_shas`, `tool_versions`, `spend_cap_usd`, `task_manifest_sha256`
2. Run: `pnpm vitest run benchmarks/session-memory-productivity/manifests/run-manifest.schema.test.ts` — verify FAIL
3. Add the schema and README with the repo-native layout and `.tmp/` contract
4. Run: `pnpm vitest run benchmarks/session-memory-productivity/manifests/run-manifest.schema.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] `benchmarks/session-memory-productivity/README.md` documents durable vs ephemeral assets
- [ ] Run-manifest schema validates the minimum reproducibility contract
- [ ] Benchmark scaffold is repo-native; no durable artifact path points to `/tmp`

#### [infra] Task 1.2: Add immutable variant-manifest contract

**Status:** todo

**Depends:** None

Define the checked-in contract that maps each variant to the exact worktree path, plugin path resolution strategy, environment overrides, and commit SHA capture fields. This replaces destructive "clean all worktrees then push" guidance with a reproducible manifest.

**Files:**

- Create: `benchmarks/session-memory-productivity/manifests/variant-manifest.schema.json`
- Create: `benchmarks/session-memory-productivity/config/variants.ts`
- Create: `benchmarks/session-memory-productivity/config/variants.test.ts`

**Steps (TDD):**

1. Write failing tests for the four variants: `baseline`, `context-mode`, `v1`, `v2`
2. Run: `pnpm vitest run benchmarks/session-memory-productivity/config/variants.test.ts` — verify FAIL
3. Implement the manifest loader and schema with fields for worktree path, plugin path, env overrides, and commit SHA
4. Run: `pnpm vitest run benchmarks/session-memory-productivity/config/variants.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity/config --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Variant manifest includes immutable SHA capture fields
- [ ] Baseline, context-mode, v1, and v2 all resolve through one contract
- [ ] No task in the blueprint requires commit/discard/push as part of benchmark setup

#### [qa] Task 1.3: Environment preflight + version capture

**Status:** todo

**Depends:** None

Codify the current environment facts instead of hand-waving them: Docker is reachable now, while Harbor / Terminal-Bench packages are not yet installed. This task produces the machine-readiness probe and version report consumed by the oracle smoke and later decision memo.

**Files:**

- Create: `benchmarks/session-memory-productivity/scripts/preflight.ts`
- Create: `benchmarks/session-memory-productivity/scripts/preflight.test.ts`
- Create: `reports/session-memory-productivity/README.md`

**Steps (TDD):**

1. Write failing tests for probe output: Docker reachable status, Harbor installed status, Claude CLI presence, Python presence, and JSON report shape
2. Run: `pnpm vitest run benchmarks/session-memory-productivity/scripts/preflight.test.ts` — verify FAIL
3. Implement the probe and document where preflight reports are stored under `reports/`
4. Run: `pnpm vitest run benchmarks/session-memory-productivity/scripts/preflight.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity/scripts --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Preflight emits a machine-readable readiness report
- [ ] The report distinguishes "available now" from "must install before benchmark"
- [ ] Docker reachability is treated as a live probe, not a stale assumption

#### [qa] Task 1.4: Harbor oracle smoke + dataset resolution lock

**Status:** todo

**Depends:** 1.3

Lock the authoritative Tier 3 harness around Harbor 2.0. Resolve the exact dataset identifier, capture the resolved revision / metadata needed for reproducibility, and require one successful oracle smoke run before any variant benchmarking starts.

**Files:**

- Create: `benchmarks/session-memory-productivity/scripts/harbor-oracle-smoke.ts`
- Create: `benchmarks/session-memory-productivity/scripts/harbor-oracle-smoke.test.ts`
- Create: `benchmarks/session-memory-productivity/manifests/task-manifest.json`

**Steps (TDD):**

1. Write failing tests for: Harbor command assembly, dataset resolution capture, and oracle smoke success parsing
2. Run: `pnpm vitest run benchmarks/session-memory-productivity/scripts/harbor-oracle-smoke.test.ts` — verify FAIL
3. Implement the smoke script and checked-in task manifest stub
4. Run: `pnpm vitest run benchmarks/session-memory-productivity/scripts/harbor-oracle-smoke.test.ts` — verify PASS
5. Manual smoke: `harbor run -d terminal-bench/terminal-bench-2 -a oracle`
6. Run: `pnpm lint benchmarks/session-memory-productivity/scripts --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Harbor 2.0 is the only authoritative Tier 3 harness in the benchmark code
- [ ] The benchmark captures dataset id + resolved revision in durable metadata
- [ ] One oracle smoke pass is required before variant runs

### Phase 2: Close v2 parity gaps

#### [backend] Task 2.1: Port `session-capture` + `session-restore` to v2

**Status:** todo

**Depends:** None

Port the first pair of missing session-memory MCP tools from v1 to v2. Keep v2's existing `getStore()` / backend abstraction intact; this task is parity work, not a redesign of the storage layer.

**Files:**

- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-capture.ts`
- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-capture.test.ts`
- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-restore.ts`
- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-restore.test.ts`

**Steps (TDD):**

1. Copy the v1 test intent and write failing v2 tests first
2. Run: `pnpm vitest run /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-capture.test.ts /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-restore.test.ts` — verify FAIL
3. Port the two tools without introducing a new backend API
4. Run: `pnpm vitest run /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-capture.test.ts /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-restore.test.ts` — verify PASS
5. Run: `pnpm lint /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] v2 exposes `session-capture` and `session-restore` with parity behavior
- [ ] Tests prove the tools use v2's existing store contract
- [ ] No backend selector rename or storage redesign is introduced

#### [backend] Task 2.2: Port `session-search` + `session-snapshot` to v2

**Status:** todo

**Depends:** None

Port the second pair of missing session-memory MCP tools from v1 to v2. This completes the MCP surface needed for fair lane-2 comparison.

**Files:**

- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-search.ts`
- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-search.test.ts`
- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-snapshot.ts`
- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-snapshot.test.ts`

**Steps (TDD):**

1. Write failing tests copied from the v1 behavior contract
2. Run: `pnpm vitest run /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-search.test.ts /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-snapshot.test.ts` — verify FAIL
3. Port both tools using the existing v2 store/session APIs
4. Run: `pnpm vitest run /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-search.test.ts /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools/session-snapshot.test.ts` — verify PASS
5. Run: `pnpm lint /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/mcp/tools --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] v2 exposes `session-search` and `session-snapshot`
- [ ] Tool behavior matches the v1 contract closely enough for benchmark fairness
- [ ] All four parity MCP tools now exist in v2

#### [backend] Task 2.3: Add post-tool dispatcher parity in v2

**Status:** todo

**Depends:** None

v2 currently wires `PostToolUse` directly to `lint-after-edit.ts`. Add the dispatcher entrypoint that preserves lint behavior while also routing session capture in a failure-isolated way.

**Files:**

- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/hooks/post-tool/index.ts`
- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/hooks/post-tool/index.test.ts`
- Modify: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/hooks/post-tool/session-capture.ts`

**Steps (TDD):**

1. Write failing tests for dual dispatch and failure isolation
2. Run: `pnpm vitest run /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/hooks/post-tool/index.test.ts` — verify FAIL
3. Implement the dispatcher and route the existing session capture through it
4. Run: `pnpm vitest run /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/hooks/post-tool/index.test.ts` — verify PASS
5. Run: `pnpm lint /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/hooks/post-tool --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Lint and capture both run through one dispatcher
- [ ] Capture failure does not suppress lint, and lint failure does not suppress capture
- [ ] v2 now matches v1's post-tool hook architecture closely enough for benchmarking

#### [backend] Task 2.4: Add `PreCompact` hook + plugin wiring parity in v2

**Status:** todo

**Depends:** None

v2 is missing the `PreCompact` hook and still points `PostToolUse` at the lint-only file. Add the missing pre-compact hook and update plugin wiring so the variant can be benchmarked as a real compaction-survival candidate.

**Files:**

- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/hooks/pre-compact/index.ts`
- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/hooks/pre-compact/index.test.ts`
- Modify: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/.claude-plugin/plugin.json`

**Steps (TDD):**

1. Write failing tests for pre-compact output and plugin hook registration expectations
2. Run: `pnpm vitest run /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/hooks/pre-compact/index.test.ts` — verify FAIL
3. Implement the hook and update plugin wiring to use `post-tool/index.ts` plus `PreCompact`
4. Run: `pnpm vitest run /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/hooks/pre-compact/index.test.ts` — verify PASS
5. Run: `pnpm lint /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/hooks/pre-compact --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] v2 plugin manifest registers `PreCompact`
- [ ] `PostToolUse` points at the dispatcher rather than lint-only logic
- [ ] Pre-compact capture is available for compaction-survival benchmarking

#### [backend] Task 2.5: Add v2 session-memory unit-test parity

**Status:** todo

**Depends:** None

v2 already has `store.ts` and `session.ts`, but it lacks the benchmark-critical tests that prove the ctx-rs path, TS fallback path, and search behavior are stable. Add the missing unit tests before the benchmark treats v2 as a candidate.

**Files:**

- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/session-memory/store.test.ts`
- Create: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/session-memory/session.test.ts`
- Modify: `/Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/session-memory/store.ts`

**Steps (TDD):**

1. Write failing tests for ctx-rs default path, TS fallback path, and stable search semantics
2. Run: `pnpm vitest run /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/session-memory/store.test.ts /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/session-memory/session.test.ts` — verify FAIL
3. Patch only the minimum code needed to make v2 testable and deterministic
4. Run: `pnpm vitest run /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/session-memory/store.test.ts /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/session-memory/session.test.ts` — verify PASS
5. Run: `pnpm lint /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/session-memory --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] v2 has store/session tests covering both engine paths
- [ ] The benchmark can treat v2 as a tested candidate rather than a speculative one
- [ ] Any TS fallback is explicit and test-covered

#### [qa] Task 2.6: Add plugin-path smoke harness for v1 / v2 parity

**Status:** todo

**Depends:** 2.1, 2.2, 2.3, 2.4

Before any benchmark run, prove that Claude Code actually loads the intended plugin/worktree for each lane-2 variant. A fair benchmark is impossible if a v1 or v2 run silently resolves to baseline behavior.

**Files:**

- Create: `benchmarks/session-memory-productivity/scripts/plugin-path-smoke.ts`
- Create: `benchmarks/session-memory-productivity/scripts/plugin-path-smoke.test.ts`
- Create: `benchmarks/session-memory-productivity/manifests/plugin-smoke.expectations.json`

**Steps (TDD):**

1. Write failing tests for expected plugin path, expected tool names, and expected hook entries per variant
2. Run: `pnpm vitest run benchmarks/session-memory-productivity/scripts/plugin-path-smoke.test.ts` — verify FAIL
3. Implement the smoke harness using the variant manifest and expectations file
4. Run: `pnpm vitest run benchmarks/session-memory-productivity/scripts/plugin-path-smoke.test.ts` — verify PASS
5. Manual smoke each variant via Claude Code with the resolved plugin path and settings
6. Run: `pnpm lint benchmarks/session-memory-productivity/scripts --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] The smoke harness proves the intended worktree/plugin path is active
- [ ] Expected lane-2 tools are present before benchmarking
- [ ] A failed plugin-path smoke blocks all productivity runs

### Phase 3: Measurement harness

#### [qa] Task 3.1: Add deterministic IR fixtures + scorer

**Status:** todo

**Depends:** 1.1

Keep Tier 2 as a diagnostic signal, but make it reproducible and repo-owned. Replace any idea of harvesting private local session JSONL with checked-in qrels and a deterministic scorer.

**Files:**

- Create: `benchmarks/session-memory-productivity/ir/fixtures/qrels.json`
- Create: `benchmarks/session-memory-productivity/ir/scorer.ts`
- Create: `benchmarks/session-memory-productivity/ir/scorer.test.ts`

**Steps (TDD):**

1. Write failing tests for MRR / nDCG calculation on the checked-in qrels
2. Run: `pnpm vitest run benchmarks/session-memory-productivity/ir/scorer.test.ts` — verify FAIL
3. Add the qrels fixture and scorer implementation
4. Run: `pnpm vitest run benchmarks/session-memory-productivity/ir/scorer.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity/ir --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] IR fixtures are checked in and reproducible
- [ ] No benchmark logic reads private `~/.claude/.../sessions` data
- [ ] Tier 2 output is clearly documented as diagnostic only

#### [infra] Task 3.2: Build fail-closed token proxy + spend-cap gate

**Status:** todo

**Depends:** 1.1

Build the HTTP proxy that captures provider usage, rewrites API keys by variant, and fail-closes if attribution is incomplete. The proxy must emit an explicit clean-abort marker when the spend cap is hit so the runner can terminate between cells rather than mid-cell.

**Files:**

- Create: `benchmarks/session-memory-productivity/tier3/proxy.ts`
- Create: `benchmarks/session-memory-productivity/tier3/proxy.test.ts`
- Create: `benchmarks/session-memory-productivity/tier3/proxy-log.schema.json`

**Steps (TDD):**

1. Write failing tests for non-streaming usage capture, streaming usage capture, variant-key rewrite, fail-closed behavior, and clean-abort marker emission
2. Run: `pnpm vitest run benchmarks/session-memory-productivity/tier3/proxy.test.ts` — verify FAIL
3. Implement the proxy and the JSONL schema
4. Run: `pnpm vitest run benchmarks/session-memory-productivity/tier3/proxy.test.ts` — verify PASS
5. Real-request smoke: one low-cost provider call through the proxy and verify one valid log row
6. Run: `pnpm lint benchmarks/session-memory-productivity/tier3 --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Usage logging works for both streaming and non-streaming responses
- [ ] Any unattributed request hard-fails the run
- [ ] Spend cap produces a clean abort marker, never silent partial accounting

#### [infra] Task 3.3: Add variant settings + isolated-home bootstrap

**Status:** todo

**Depends:** 1.1, 1.2

Create the repo-owned settings and HOME isolation layer that makes each variant comparable. This task owns environment shaping, not agent execution.

**Files:**

- Create: `benchmarks/session-memory-productivity/tier3/settings.ts`
- Create: `benchmarks/session-memory-productivity/tier3/settings.test.ts`
- Create: `benchmarks/session-memory-productivity/tier3/settings-fixtures.json`

**Steps (TDD):**

1. Write failing tests for per-variant env overrides, isolated HOME paths, and context-mode / v1 / v2 plugin-path injection
2. Run: `pnpm vitest run benchmarks/session-memory-productivity/tier3/settings.test.ts` — verify FAIL
3. Implement the settings/bootstrap layer and fixtures
4. Run: `pnpm vitest run benchmarks/session-memory-productivity/tier3/settings.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity/tier3 --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Every variant gets its own isolated HOME
- [ ] v1 and v2 resolve through the checked-in variant manifest rather than ad hoc shell flags
- [ ] Cache isolation rules are explicit and test-covered

#### [infra] Task 3.4: Implement Harbor Claude adapter

**Status:** todo

**Depends:** 1.4, 2.6, 3.2, 3.3

Implement the Tier 3 agent entrypoint that Harbor will execute. The adapter must run Claude Code with the exact variant settings, route through the proxy, and emit enough structured state that the runner can distinguish success, clean abort, and infrastructure failure.

**Files:**

- Create: `benchmarks/session-memory-productivity/tier3/claude_code_harbor_agent.py`
- Create: `benchmarks/session-memory-productivity/tier3/test_claude_code_harbor_agent.py`
- Create: `benchmarks/session-memory-productivity/tier3/agent_contract.md`

**Steps (TDD):**

1. Write failing adapter tests for command construction, env injection, clean-abort propagation, and output-dir wiring
2. Run: `python -m pytest benchmarks/session-memory-productivity/tier3/test_claude_code_harbor_agent.py` — verify FAIL
3. Implement the Harbor agent and contract documentation
4. Run: `python -m pytest benchmarks/session-memory-productivity/tier3/test_claude_code_harbor_agent.py` — verify PASS
5. Manual smoke: one Harbor task using the adapter against the oracle-verified environment
6. Run: `pnpm lint benchmarks/session-memory-productivity/tier3 --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Harbor can execute Claude Code through the custom adapter
- [ ] Variant settings, proxy routing, and isolated HOME all flow through one contract
- [ ] The adapter distinguishes task failure from clean budget abort and infra failure

### Phase 4: Execute + decide

#### [qa] Task 4.1: Add backend-latency runner

**Status:** todo

**Depends:** 1.2, 2.6

Keep Tier 1, but make it repo-native and explicitly subordinate to productivity. This task owns the backend latency runner and its summary artifact shape; it does not decide anything by itself.

**Files:**

- Create: `benchmarks/session-memory-productivity/scripts/backend-latency.ts`
- Create: `benchmarks/session-memory-productivity/scripts/backend-latency.test.ts`
- Create: `benchmarks/session-memory-productivity/manifests/backend-latency.expectations.json`

**Steps (TDD):**

1. Write failing tests for runner output shape and per-variant latency summary
2. Run: `pnpm vitest run benchmarks/session-memory-productivity/scripts/backend-latency.test.ts` — verify FAIL
3. Implement the runner and expectations file
4. Run: `pnpm vitest run benchmarks/session-memory-productivity/scripts/backend-latency.test.ts` — verify PASS
5. Run one local latency sample against all variants
6. Run: `pnpm lint benchmarks/session-memory-productivity/scripts --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Tier 1 latency output is reproducible and per-variant
- [ ] Latency summaries are stored as benchmark data, not as the recommendation
- [ ] Backend latency is explicitly separated from Tier 3 productivity

#### [qa] Task 4.2: Add productivity runner + aggregation

**Status:** todo

**Depends:** 3.4

Implement the authoritative Tier 3 execution loop. It must run a smoke pass first, then full Harbor productivity runs only if the smoke pass proves plugin loading, proxy attribution, and clean-abort behavior. Aggregation must reject incomplete or unattributed runs.

**Files:**

- Create: `benchmarks/session-memory-productivity/tier3/run-productivity.ts`
- Create: `benchmarks/session-memory-productivity/tier3/run-productivity.test.ts`
- Create: `benchmarks/session-memory-productivity/tier3/aggregate.ts`

**Steps (TDD):**

1. Write failing tests for smoke-pass gating, run-state transitions, and aggregation rejection of unattributed / partial runs
2. Run: `pnpm vitest run benchmarks/session-memory-productivity/tier3/run-productivity.test.ts` — verify FAIL
3. Implement smoke-first execution and aggregation
4. Run: `pnpm vitest run benchmarks/session-memory-productivity/tier3/run-productivity.test.ts` — verify PASS
5. Execute one smoke wave across all four variants before any full run
6. Run: `pnpm lint benchmarks/session-memory-productivity/tier3 --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Smoke pass is mandatory and blocks full runs on any misconfiguration
- [ ] Aggregation rejects partial or unattributed data
- [ ] Tier 3 productivity is the decision-driving metric

#### [docs] Task 4.3: Write the decision memo + reproducibility bundle

**Status:** todo

**Depends:** 3.1, 4.1, 4.2

Write the one memo that recommends ship v1, ship v2, or park both. It must include the run manifest, the benchmark caveats, and the exact reason the recommendation is safe (or unsafe) to act on.

**Files:**

- Create: `benchmarks/session-memory-productivity/templates/decision.memo.md`
- Create: `reports/session-memory-productivity/latest/decision.md`
- Create: `reports/session-memory-productivity/latest/run-manifest.json`

**Steps (TDD):**

1. Write the memo template first with required sections: setup, findings, caveats, recommendation, follow-up action
2. Populate the run manifest from the checked-in schemas and the executed benchmark data
3. Write `decision.md` using the template and the actual run outputs
4. Run: `pnpm lint benchmarks/session-memory-productivity/templates --fix=false` and `pnpm typecheck`
5. Run: `ak blueprint audit --all --strict` for the final blueprint pass

**Acceptance:**

- [ ] `decision.md` names exactly one recommendation: ship v1, ship v2, or park both
- [ ] `run-manifest.json` captures the reproducibility contract used for that recommendation
- [ ] The memo states the scope boundary of the conclusion and lists any caveats

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Blueprint validation | `ak blueprint audit --all --strict` | No blueprint-structure or lifecycle errors |
| Benchmark TS type safety | `pnpm typecheck` | Zero type errors in benchmark additions |
| Benchmark TS tests | `pnpm vitest run benchmarks/session-memory-productivity/...` | All benchmark unit tests pass |
| Harbor adapter tests | `python -m pytest benchmarks/session-memory-productivity/tier3/test_claude_code_harbor_agent.py` | Adapter contract passes locally |
| v2 parity tests | `pnpm vitest run /Users/ozby/repos/webpresso/agent-kit-v2-ctx-rs/src/...` | All new v2 parity tests pass |
| Oracle smoke | `harbor run -d terminal-bench/terminal-bench-2 -a oracle` | One successful Harbor 2.0 oracle execution |
| Variant smoke | variant-specific Claude / Harbor smoke | Correct plugin path + tool surface + proxy attribution |
| Full benchmark authorization | run smoke summary review | Full run starts only if smoke passes and spend cap remains available |

## Cross-Plan References

| Plan | Relationship | Required consistency |
| --- | --- | --- |
| `blueprints/parked/ak-session-memory-via-letta-adapter-permissive-replacement-for-context-mode-session-resume-tool-output-indexing/_overview.md` | Strategic neighbor | This benchmark must not claim to solve permissive replacement strategy; it only informs whether v1 or v2 should ship as the next lane-2 candidate. |
| `agent-kit-v1-session-memory` sibling worktree | Benchmark subject | Decision memo must capture the exact v1 commit SHA used for the run. |
| `agent-kit-v2-ctx-rs` sibling worktree | Benchmark subject | Decision memo must capture the exact v2 commit SHA and whether parity tasks were included. |
| `ctx-rs` sibling worktree | Transitive dependency | Any v2 recommendation must cite the exact ctx-rs SHA and artifact provenance used in the run manifest. |

## Edge Cases and Error Handling

| ID | Scenario | Handling |
| --- | --- | --- |
| (F1) | Harbor is not installed locally | Preflight fails fast; no benchmark run begins. |
| (F2) | Docker becomes unavailable after preflight | Oracle smoke or productivity smoke fails; recommendation is blocked. |
| (F3) | v2 silently falls back to the TS engine | v2 parity tests and runtime smoke must surface the active backend; unresolved fallback blocks v2 from candidacy. |
| (F4) | Claude loads the wrong plugin path | Task 2.6 blocks Tier 3 entirely. |
| (F5) | Proxy sees traffic without variant attribution | Proxy fail-closes and marks the run invalid. |
| (F6) | Spend cap trips mid-experiment | Runner records a clean abort state between cells and excludes incomplete full-run aggregates. |
| (F7) | IR looks better but productivity is flat or worse | Decision memo treats IR as diagnostic only and does not upgrade the recommendation. |
| (F8) | Harbor dataset content changes upstream | Task 1.4 captures dataset resolution metadata in the run manifest before any full run. |

## Non-goals

- Replacing context-mode with a permissive lane-2 product in this blueprint alone
- Publishing Terminal-Bench leaderboard numbers
- Proving general productivity gains across all models or all coding agents
- Measuring cross-compaction memory retention outside the fixed benchmark/task setup
- Designing a new session-memory engine API for v2

## Risks

| ID | Severity | Risk | Mitigation |
| --- | --- | --- | --- |
| (F9) | HIGH | Harbor / Claude integration assumptions drift before implementation | Re-run preflight and oracle smoke immediately before full runs. |
| (F10) | HIGH | Proxy misses billing edge cases and undercounts cost | Fail closed on incomplete attribution; require one real-request smoke check before full runs. |
| (F11) | HIGH | Plugin-path smoke passes but real runtime still resolves the wrong lane-2 behavior | Smoke both the tool surface and the loaded plugin/worktree path before productivity runs. |
| (F12) | MEDIUM | The 16-task sample is too small to separate close variants | Wilson intervals and caveats must be included in the memo; recommend parking if results are indecisive. |
| (F13) | MEDIUM | v2 parity work changes the candidate materially | Memo must explicitly state that v2 was benchmarked **after** remediation tasks, not as originally found. |
| (F14) | MEDIUM | IR tier receives too much attention in review | Put Tier 3 first in the memo and label Tier 2 as diagnostic everywhere. |

## Technology Choices

| Area | Choice | Why |
| --- | --- | --- |
| Productivity harness | Harbor 2.0 | Current official Terminal-Bench 2.0 execution surface |
| Language for benchmark scaffolding | TypeScript | Matches repo norms and existing lint/typecheck/test tooling |
| Language for Harbor adapter | Python | Matches Harbor custom-agent interfaces and existing ecosystem examples |
| Durable reports | Markdown + JSON | Reviewable memo plus machine-readable manifest |
| Temporary runtime state | `.tmp/session-memory-productivity/` | Repo-local and disposable without becoming a durable dependency |
| Token accounting | Proxy JSONL + schema | Minimal, auditable ground truth for cost attribution |
| Variant resolution | Checked-in manifest | Reproducible and reviewable path/env contract |

## Refinement summary

| Metric | Value |
| --- | --- |
| Findings total | 11 |
| Critical | 0 |
| High | 5 |
| Medium | 4 |
| Low | 2 |
| Fixes applied | 11 / 11 |
| Cross-plan updates required | 0 immediate |
| Edge cases documented | 8 |
| Risks documented | 6 |
| Parallelization score | **A** |
| Critical path | **5 waves** |
| Max parallel agents | **8** |
| Total tasks | **17** |
| Blueprint compliant | **17 / 17** |

## Unverified claims that gate Tier 3

These claims must be proven during implementation before any full productivity run is allowed:

1. **Harbor command contract on this machine** — one local oracle run must succeed using the exact installed Harbor version.
2. **Claude adapter contract** — the Harbor adapter must prove it can launch Claude Code with the variant-specific settings and plugin path.
3. **Proxy completeness** — one live request must show provider usage captured correctly in the JSONL schema.
4. **Dataset resolution lock** — the task manifest must record a stable dataset identifier and revision metadata before results are interpreted.
5. **v2 backend observability** — the benchmark must prove whether v2 is using ctx-rs or a TS fallback during the run.

## Expected outcome

If this blueprint is executed successfully, the repo will contain:

- a checked-in, reproducible benchmark harness under `benchmarks/session-memory-productivity/`
- a durable decision bundle under `reports/session-memory-productivity/latest/`
- a fair comparison of `baseline`, `context-mode`, `v1`, and `v2`
- exactly one recommendation:
  - **ship v1**
  - **ship v2**
  - **park both**

If parity, attribution, or reproducibility remains unproven, the default safe outcome is **park both and keep the current baseline** until the missing evidence exists.
