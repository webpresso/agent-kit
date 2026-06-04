---
type: blueprint
title: Context-tool productivity benchmark suite — Codex CLI track
status: parked
complexity: L
owner: agent-kit
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
created: '2026-05-13'
last_updated: '2026-05-29'
progress: 'Parked on 2026-05-29 as a narrower predecessor track superseded locally by the in-progress vendor-neutral `wp bench session-memory` harness; unresolved Codex invocation and hook-gate details remain documentary inputs to that broader lane'
depends_on: []
tags:
  - benchmark
  - codex
  - session-memory
  - context-mode
  - decision-gate
  - harbor
---

# Context-tool productivity benchmark suite — Codex CLI track

## Product wedge anchor

- **Stage outcome:** Decide whether lane-2 session memory should ship for **Codex CLI users** as `agent-kit-v1-session-memory`, ship as `agent-kit-v2-ctx-rs`, or keep both parked while Codex stays on the current baseline/context-mode setup.
- **Consuming surface:** `reports/session-memory-productivity-codex/latest/decision.md` plus its reproducibility manifest. This memo is the only allowed artifact to recommend **ship v1**, **ship v2**, or **park both** for the Codex track.
- **New user-visible capability:** A defensible Codex-specific answer to "does session memory improve Codex task outcomes enough to justify shipping?" backed by our own cost, pass-rate, and wall-time measurements.
- **Scope boundary:** This benchmark applies only to **Codex CLI** under the exact locked benchmark setup defined here. It does not prove anything about Claude Code, OpenCode, Cursor, or general agent performance.

## Problem statement

The existing benchmark suite now has a Claude/Harbor track, but it does **not** answer the same ship/park question for **Codex CLI** users. That leaves a product gap: Codex has a different runtime contract (`CODEX_HOME`, `config.toml`, `hooks.json`, `.agents/skills` discovery, context-mode Codex hooks), so a Claude-only result cannot safely be reused as the Codex recommendation.

This draft defines the **parallel Codex benchmark track** across four variants:

1. **baseline** — Codex with no lane-2 session-memory enhancement
2. **context-mode** — Codex with context-mode routing and session-memory surface
3. **v1** — Codex against `agent-kit-v1-session-memory`
4. **v2** — Codex against `agent-kit-v2-ctx-rs`

The benchmark keeps the same three-tier shape as the Claude track:

- Tier 1 — backend latency
- Tier 2 — IR quality (diagnostic only)
- Tier 3 — real task productivity

Unlike the Claude track, Codex Tier 3 is still **gated** by one unproven assumption: we must first verify a stable, automatable Codex execution contract for benchmark runs. This blueprint therefore treats Codex Tier 3 as a **draft execution plan with explicit gate checks**, not as already-proven runnable infrastructure.

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Repo-native Codex benchmark assets                                         │
│                                                                             │
│ benchmarks/session-memory-productivity-codex/                               │
│   ├─ manifests/        run + variant + Codex-home contracts                 │
│   ├─ scripts/          preflight, invocation smoke, backend latency         │
│   ├─ ir/               qrels + scorer                                       │
│   └─ tier3/            proxy, CODEX_HOME bootstrap, Codex adapter, runner   │
│                                                                             │
│ reports/session-memory-productivity-codex/latest/                           │
│   ├─ decision.md                                                             │
│   ├─ run-manifest.json                                                      │
│   └─ summary.json                                                           │
│                                                                             │
│ .tmp/session-memory-productivity-codex/<run-id>/                            │
│   ├─ live logs, proxy jsonl, isolated CODEX_HOME dirs, runner output        │
│   └─ deleted / ignored after the run                                        │
└─────────────────────────────────────────────────────────────────────────────┘

                             ┌──────────────────────────────┐
                             │  Phase 1 / 2 pre-work       │
                             │  Codex scaffold + variant   │
                             │  profile / hook validation  │
                             └──────────────┬──────────────┘
                                            │
                                            ▼
                             ┌──────────────────────────────┐
                             │  Phase 3 instrumentation     │
                             │  proxy + isolated CODEX_HOME │
                             │  + Codex execution shim      │
                             └──────────────┬──────────────┘
                                            │
                                            ▼
                     ┌────────────────────────────────────────────┐
                     │ Phase 4 execution                          │
                     │ backend latency + Codex productivity runs  │
                     │ across [baseline, context-mode, v1, v2]    │
                     └──────────────┬─────────────────────────────┘
                                    │
                                    ▼
                     ┌────────────────────────────────────────────┐
                     │ Phase 5 decision                           │
                     │ one memo + one manifest + one recommendation│
                     └────────────────────────────────────────────┘

Codex runtime surfaces explicitly modeled in this track:
  - $CODEX_HOME/config.toml
  - $CODEX_HOME/hooks.json
  - repo-scanned .agents/skills
  - context-mode Codex hook chain
  - worktree-specific benchmark cwd
```

## Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Track separation | Separate Codex blueprint and decision memo | Codex runtime differs enough from Claude Code that we should not blur conclusions. |
| Tier 3 harness target | Harbor 2.0 outer harness with a custom Codex adapter | Keeps the productivity harness comparable to the Claude track while isolating the agent-specific adapter. |
| Tier 3 gate | Do **not** authorize full runs until the Codex invocation contract is proven | Prevents building a recommendation on speculative CLI behavior. |
| Durable benchmark assets | Check in code under `benchmarks/session-memory-productivity-codex/` and durable outputs under `reports/session-memory-productivity-codex/` | Same reproducibility standard as the Claude track. |
| Ephemeral runtime state | Use `.tmp/session-memory-productivity-codex/<run-id>/` only | Keeps live logs and temp homes out of git. |
| Codex variant identity | Variant manifest includes cwd, worktree path, `CODEX_HOME`, hook expectations, and commit SHA | Codex behavior depends on both repo cwd and home config. |
| Skill discovery assumption | Use `.agents/skills` as the only repo-local Codex skill surface | Matches repo docs; avoids deprecated `.codex/prompts` assumptions. |
| Hook verification | Treat Codex hook-chain validation as a first-class benchmark gate | context-mode behavior on Codex depends on correct hook installation. |
| Token accounting | Fail-closed proxy remains authoritative if attribution completeness is proven | Same accounting standard as the Claude track. |
| IR tier interpretation | Diagnostic only | IR may explain productivity outcomes but cannot overrule them. |
| Default recommendation rule | If Codex invocation, hook, or attribution gates fail, **park both for Codex** | No Codex shipping recommendation without trustworthy evidence. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4 | None | 7 agents | XS–S |
| **Wave 1** | 1.4, 2.5, 3.1, 3.2, 3.3 | Wave 0 (specific) | 5 agents | S–M |
| **Wave 2** | 3.4, 4.1 | Wave 1 | 2 agents | M |
| **Wave 3** | 4.2 | Wave 2 | 1 agent | M |
| **Wave 4** | 4.3 | Wave 3 + 3.1 + 4.1 | 1 agent | S |
| **Critical path** | 1.3 → 1.4 → 3.4 → 4.2 → 4.3 | — | 5 waves | — |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ 4 | **7** ✓ |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | **16 / 5 = 3.2** ✓ |
| DD | dependency_edges / total_tasks | ≤ 2.0 | **19 / 16 = 1.19** ✓ |
| CP | same-file overlaps per wave | 0 | **0** ✓ |
| Parallelization score | Derived from RW0 / CPR / CP | A or B | **A** |

**Refinement note:** This is intentionally a **draft** rather than a fully fact-checked execution blueprint because the Codex Tier 3 invocation contract is still unverified. The tasks below exist to prove or disprove that contract early.

---

### Phase 1: Benchmark scaffold + Codex reproducibility

#### [infra] Task 1.1: Scaffold repo-native Codex benchmark surfaces

**Status:** todo

**Depends:** None

Create the checked-in Codex benchmark home and its top-level contracts. This mirrors the Claude benchmark layout but keeps Codex outputs separate so a later decision memo can cite Codex-only evidence.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/README.md`
- Create: `benchmarks/session-memory-productivity-codex/manifests/run-manifest.schema.json`
- Create: `benchmarks/session-memory-productivity-codex/manifests/run-manifest.schema.test.ts`

**Steps (TDD):**

1. Write failing schema tests for required fields: `run_id`, `codex_version`, `variant_shas`, `codex_home_contract`, `task_manifest_sha256`, `spend_cap_usd`
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/manifests/run-manifest.schema.test.ts` — verify FAIL
3. Add the schema and README with the repo-native vs `.tmp/` boundary
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/manifests/run-manifest.schema.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity-codex --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] The Codex benchmark has its own checked-in home
- [ ] Durable artifacts never point at `/tmp`
- [ ] The run-manifest schema captures Codex-specific runtime facts

#### [infra] Task 1.2: Add immutable Codex variant-manifest contract

**Status:** todo

**Depends:** None

Define the per-variant contract for Codex runs: benchmark cwd, worktree path, isolated `CODEX_HOME`, required hook files, required config keys, and commit SHA capture fields.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/manifests/variant-manifest.schema.json`
- Create: `benchmarks/session-memory-productivity-codex/config/variants.ts`
- Create: `benchmarks/session-memory-productivity-codex/config/variants.test.ts`

**Steps (TDD):**

1. Write failing tests for `baseline`, `context-mode`, `v1`, and `v2`
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/config/variants.test.ts` — verify FAIL
3. Implement the variant manifest loader and schema
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/config/variants.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity-codex/config --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Every Codex variant captures cwd + `CODEX_HOME` + hook expectations
- [ ] Commit SHAs are part of the contract
- [ ] The variant manifest can drive both smoke tests and full runs

#### [qa] Task 1.3: Codex environment preflight + version capture

**Status:** todo

**Depends:** None

Probe the Codex runtime facts before any benchmark code assumes them: Codex presence, `CODEX_HOME` shape, `config.toml`, `hooks.json`, context-mode hook registration, proxy prerequisites, and Python/Bun availability.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/scripts/preflight.ts`
- Create: `benchmarks/session-memory-productivity-codex/scripts/preflight.test.ts`
- Create: `reports/session-memory-productivity-codex/README.md`

**Steps (TDD):**

1. Write failing tests for preflight report shape and required checks
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/scripts/preflight.test.ts` — verify FAIL
3. Implement the probe and the reports README
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/scripts/preflight.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity-codex/scripts --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Preflight emits a machine-readable Codex readiness report
- [ ] `CODEX_HOME` and hook-chain checks are explicit
- [ ] Missing Codex prerequisites fail early

#### [qa] Task 1.4: Lock Codex invocation contract with one oracle smoke

**Status:** todo

**Depends:** 1.3

Before the benchmark assumes Codex can be driven by Harbor or another runner, prove the exact non-interactive invocation contract locally. This task is the primary Tier 3 gate for the entire draft.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/scripts/codex-invocation-smoke.ts`
- Create: `benchmarks/session-memory-productivity-codex/scripts/codex-invocation-smoke.test.ts`
- Create: `benchmarks/session-memory-productivity-codex/manifests/task-manifest.json`

**Steps (TDD):**

1. Write failing tests for command assembly, exit-state parsing, and machine-readable smoke output
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/scripts/codex-invocation-smoke.test.ts` — verify FAIL
3. Implement the smoke script and checked-in task manifest stub
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/scripts/codex-invocation-smoke.test.ts` — verify PASS
5. Manual smoke: run the smallest supported Codex non-interactive command and capture output
6. Run: `pnpm lint benchmarks/session-memory-productivity-codex/scripts --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] The exact Codex invocation contract is written down and machine-checked
- [ ] A successful oracle smoke is required before any full productivity run
- [ ] If Codex cannot be driven deterministically, Tier 3 is blocked

### Phase 2: Codex variant parity + control surfaces

#### [infra] Task 2.1: Define baseline Codex control profile

**Status:** todo

**Depends:** None

Create the benchmark control profile for Codex with no lane-2 enhancements. This is the anchor every other variant will be compared against.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/config/baseline-profile.ts`
- Create: `benchmarks/session-memory-productivity-codex/config/baseline-profile.test.ts`

**Steps (TDD):**

1. Write failing tests for baseline cwd, empty lane-2 surface, and isolated `CODEX_HOME`
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/config/baseline-profile.test.ts` — verify FAIL
3. Implement the baseline profile
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/config/baseline-profile.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity-codex/config --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Baseline Codex behavior is explicit rather than inferred
- [ ] No lane-2 session-memory surface leaks into the control profile
- [ ] Baseline uses the same general runner contract as the other variants

#### [infra] Task 2.2: Define context-mode Codex profile

**Status:** todo

**Depends:** None

Codex with context-mode is not just a different cwd; it relies on `config.toml`, `hooks.json`, and the context-mode MCP server. Encode that profile explicitly so benchmark runs can verify it before execution.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/config/context-mode-profile.ts`
- Create: `benchmarks/session-memory-productivity-codex/config/context-mode-profile.test.ts`

**Steps (TDD):**

1. Write failing tests for required context-mode MCP config and hook events
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/config/context-mode-profile.test.ts` — verify FAIL
3. Implement the context-mode profile contract
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/config/context-mode-profile.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity-codex/config --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] context-mode Codex profile requires the documented Codex hook chain
- [ ] MCP config requirements are explicit
- [ ] The benchmark can prove whether context-mode is really active

#### [infra] Task 2.3: Define v1 / v2 Codex worktree profiles

**Status:** todo

**Depends:** None

Codex discovers repo-local skills differently from Claude. Define how v1 and v2 should be benchmarked in Codex terms: cwd, worktree root, `.agents/skills` expectations, and any required home-config overrides.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/config/worktree-profiles.ts`
- Create: `benchmarks/session-memory-productivity-codex/config/worktree-profiles.test.ts`

**Steps (TDD):**

1. Write failing tests for v1 and v2 cwd/worktree/skill-surface expectations
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/config/worktree-profiles.test.ts` — verify FAIL
3. Implement the two worktree profiles
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/config/worktree-profiles.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity-codex/config --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] v1 and v2 Codex profiles are explicit and test-covered
- [ ] The benchmark never relies on deprecated `.codex/prompts`
- [ ] Worktree-specific expectations are machine-readable

#### [qa] Task 2.4: Add Codex hook-chain verifier

**Status:** todo

**Depends:** None

Codex behavior in this benchmark depends heavily on the context-mode hook chain. Build one verifier that checks required hook entries and flags drift before any benchmark run starts.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/scripts/verify-hooks.ts`
- Create: `benchmarks/session-memory-productivity-codex/scripts/verify-hooks.test.ts`
- Create: `benchmarks/session-memory-productivity-codex/manifests/hook-expectations.json`

**Steps (TDD):**

1. Write failing tests for required hook events: `PreToolUse`, `PostToolUse`, `SessionStart`, `UserPromptSubmit`, `Stop`, `PreCompact`
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/scripts/verify-hooks.test.ts` — verify FAIL
3. Implement the verifier and expectations file
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/scripts/verify-hooks.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity-codex/scripts --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Hook verification is automated, not manual
- [ ] Any missing or drifted hook blocks Tier 3
- [ ] The expected Codex hook chain is checked into the repo

#### [qa] Task 2.5: Add Codex tool-surface smoke harness

**Status:** todo

**Depends:** 2.1, 2.2, 2.3, 2.4

Before a Codex productivity run counts, prove each variant resolves the intended tool/skill surface. This is the Codex equivalent of the Claude plugin-path smoke harness.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/scripts/tool-surface-smoke.ts`
- Create: `benchmarks/session-memory-productivity-codex/scripts/tool-surface-smoke.test.ts`
- Create: `benchmarks/session-memory-productivity-codex/manifests/tool-surface.expectations.json`

**Steps (TDD):**

1. Write failing tests for expected tool names, skill surface, and variant-specific home config
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/scripts/tool-surface-smoke.test.ts` — verify FAIL
3. Implement the smoke harness and expectations file
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/scripts/tool-surface-smoke.test.ts` — verify PASS
5. Manual smoke each variant using the locked Codex invocation contract from Task 1.4
6. Run: `pnpm lint benchmarks/session-memory-productivity-codex/scripts --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] The benchmark can prove which Codex surface is active per variant
- [ ] Misresolved baseline / context-mode / v1 / v2 runs are blocked
- [ ] Codex skill/tool expectations are explicit and reproducible

### Phase 3: Measurement harness

#### [qa] Task 3.1: Add deterministic IR fixtures + scorer

**Status:** todo

**Depends:** 1.1

Mirror the Claude track's IR tier, but keep its outputs separate. This tier remains diagnostic only and must use checked-in qrels.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/ir/fixtures/qrels.json`
- Create: `benchmarks/session-memory-productivity-codex/ir/scorer.ts`
- Create: `benchmarks/session-memory-productivity-codex/ir/scorer.test.ts`

**Steps (TDD):**

1. Write failing tests for MRR / nDCG on the checked-in qrels
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/ir/scorer.test.ts` — verify FAIL
3. Add the qrels fixture and scorer
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/ir/scorer.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity-codex/ir --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] IR fixtures are reproducible and checked in
- [ ] IR remains explicitly diagnostic only
- [ ] No private local session data is used

#### [infra] Task 3.2: Build fail-closed token proxy + spend-cap gate

**Status:** todo

**Depends:** 1.1

Reuse the same accounting standard as the Claude benchmark: a fail-closed proxy that captures provider usage and enforces a clean spend-cap boundary.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/tier3/proxy.ts`
- Create: `benchmarks/session-memory-productivity-codex/tier3/proxy.test.ts`
- Create: `benchmarks/session-memory-productivity-codex/tier3/proxy-log.schema.json`

**Steps (TDD):**

1. Write failing tests for usage capture, attribution, and clean-abort marker behavior
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/tier3/proxy.test.ts` — verify FAIL
3. Implement the proxy and log schema
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/tier3/proxy.test.ts` — verify PASS
5. Real-request smoke through the proxy and validate one log row
6. Run: `pnpm lint benchmarks/session-memory-productivity-codex/tier3 --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Proxy attribution is explicit and fail-closed
- [ ] Spend cap produces a clean abort marker
- [ ] Token accounting is benchmark-authoritative only when attribution is complete

#### [infra] Task 3.3: Add isolated `CODEX_HOME` bootstrap

**Status:** todo

**Depends:** 1.2, 2.4

Every Codex variant needs its own deterministic home config. Build the bootstrap that materializes isolated `CODEX_HOME` dirs with variant-specific `config.toml`, `hooks.json`, and benchmark-owned state.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/tier3/bootstrap-codex-home.ts`
- Create: `benchmarks/session-memory-productivity-codex/tier3/bootstrap-codex-home.test.ts`
- Create: `benchmarks/session-memory-productivity-codex/tier3/codex-home-fixtures.json`

**Steps (TDD):**

1. Write failing tests for isolated home creation, config injection, and hook-file rendering
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/tier3/bootstrap-codex-home.test.ts` — verify FAIL
3. Implement the bootstrap and fixtures
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/tier3/bootstrap-codex-home.test.ts` — verify PASS
5. Run: `pnpm lint benchmarks/session-memory-productivity-codex/tier3 --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Each variant gets an isolated `CODEX_HOME`
- [ ] Home config is benchmark-owned and reproducible
- [ ] Hook / config drift can be detected before execution

#### [infra] Task 3.4: Implement Codex productivity adapter

**Status:** todo

**Depends:** 1.4, 2.5, 3.2, 3.3

Implement the Tier 3 Codex execution shim. It must launch Codex through the proven invocation contract, use the variant-specific cwd + `CODEX_HOME`, route traffic through the proxy, and emit enough state to distinguish task failure, clean budget abort, and infrastructure failure.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/tier3/codex_runner.py`
- Create: `benchmarks/session-memory-productivity-codex/tier3/test_codex_runner.py`
- Create: `benchmarks/session-memory-productivity-codex/tier3/agent_contract.md`

**Steps (TDD):**

1. Write failing tests for command construction, cwd selection, `CODEX_HOME` injection, and clean-abort propagation
2. Run: `python -m pytest benchmarks/session-memory-productivity-codex/tier3/test_codex_runner.py` — verify FAIL
3. Implement the runner and contract documentation
4. Run: `python -m pytest benchmarks/session-memory-productivity-codex/tier3/test_codex_runner.py` — verify PASS
5. Manual smoke: one tiny Codex benchmark task through the adapter
6. Run: `pnpm lint benchmarks/session-memory-productivity-codex/tier3 --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Codex can be run deterministically through the benchmark adapter
- [ ] Variant cwd and `CODEX_HOME` flow through one contract
- [ ] The runner distinguishes product failure from infra failure and clean abort

### Phase 4: Execute + decide

#### [qa] Task 4.1: Add backend-latency runner

**Status:** todo

**Depends:** 1.2, 2.5

Keep Tier 1 aligned with the Claude benchmark but store the output under the Codex benchmark tree so the decision memo can cite it separately.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/scripts/backend-latency.ts`
- Create: `benchmarks/session-memory-productivity-codex/scripts/backend-latency.test.ts`
- Create: `benchmarks/session-memory-productivity-codex/manifests/backend-latency.expectations.json`

**Steps (TDD):**

1. Write failing tests for per-variant latency summary output
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/scripts/backend-latency.test.ts` — verify FAIL
3. Implement the runner and expectations file
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/scripts/backend-latency.test.ts` — verify PASS
5. Run one local latency sample against all variants
6. Run: `pnpm lint benchmarks/session-memory-productivity-codex/scripts --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Tier 1 latency output is reproducible and per-variant
- [ ] Latency data is available but not decision-authoritative by itself
- [ ] Codex latency outputs live under the Codex benchmark tree

#### [qa] Task 4.2: Add Codex productivity runner + aggregation

**Status:** todo

**Depends:** 3.4

Implement the authoritative Tier 3 Codex execution loop. It must require a smoke pass before any full run, reject incomplete or unattributed data, and only produce a final summary when the Codex invocation contract has been proven.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/tier3/run-productivity.ts`
- Create: `benchmarks/session-memory-productivity-codex/tier3/run-productivity.test.ts`
- Create: `benchmarks/session-memory-productivity-codex/tier3/aggregate.ts`

**Steps (TDD):**

1. Write failing tests for smoke-pass gating, state transitions, and aggregation rejection of invalid runs
2. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/tier3/run-productivity.test.ts` — verify FAIL
3. Implement smoke-first execution and aggregation
4. Run: `pnpm vitest run benchmarks/session-memory-productivity-codex/tier3/run-productivity.test.ts` — verify PASS
5. Execute one smoke wave across all four variants
6. Run: `pnpm lint benchmarks/session-memory-productivity-codex/tier3 --fix=false` and `pnpm typecheck`

**Acceptance:**

- [ ] Smoke pass is mandatory before full Codex runs
- [ ] Aggregation rejects partial, unattributed, or hook-drifted runs
- [ ] Tier 3 productivity is the only decision-driving metric

#### [docs] Task 4.3: Write the Codex decision memo + reproducibility bundle

**Status:** todo

**Depends:** 3.1, 4.1, 4.2

Write the Codex-specific recommendation memo. It must cite Codex-only evidence, the exact `CODEX_HOME` / hook assumptions used in the run, and any caveats that would block a safe shipping recommendation.

**Files:**

- Create: `benchmarks/session-memory-productivity-codex/templates/decision.memo.md`
- Create: `reports/session-memory-productivity-codex/latest/decision.md`
- Create: `reports/session-memory-productivity-codex/latest/run-manifest.json`

**Steps (TDD):**

1. Write the memo template first with required sections: setup, findings, hook/config caveats, recommendation, follow-up action
2. Populate the run manifest from the executed benchmark data
3. Write `decision.md` using the template and the actual outputs
4. Run: `pnpm lint benchmarks/session-memory-productivity-codex/templates --fix=false` and `pnpm typecheck`
5. Run: `wp blueprint audit --all --strict`

**Acceptance:**

- [ ] `decision.md` names exactly one recommendation: ship v1, ship v2, or park both for Codex
- [ ] `run-manifest.json` captures the Codex-specific reproducibility contract
- [ ] The memo states whether the Tier 3 invocation contract was fully proven

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Blueprint validation | `wp blueprint audit --all --strict` | No blueprint structure or lifecycle errors |
| Benchmark TS type safety | `pnpm typecheck` | Zero type errors in benchmark additions |
| Benchmark TS tests | `pnpm vitest run benchmarks/session-memory-productivity-codex/...` | All benchmark unit tests pass |
| Python adapter tests | `python -m pytest benchmarks/session-memory-productivity-codex/tier3/test_codex_runner.py` | Runner contract passes locally |
| Codex preflight | benchmark preflight script | Codex config + hook + runtime prerequisites proven |
| Codex invocation smoke | invocation smoke script | Stable non-interactive Codex execution contract proven |
| Variant smoke | tool-surface + hook verifier | Correct surface per variant |
| Full benchmark authorization | smoke summary review | Full run starts only if invocation + attribution + hook gates pass |

## Cross-Plan References

| Plan | Relationship | Required consistency |
| --- | --- | --- |
| `blueprints/draft/context-tool-productivity-benchmark-suite-terminal-bench-ir-quality-backend-latency-across-context-mode-v1-ts-v2-rust-variants-to-decide-ship-park/_overview.md` | Sibling benchmark track | Keep tier definitions, recommendation semantics, and proxy accounting standards aligned while allowing Codex-specific runtime differences. |
| `blueprints/parked/ak-session-memory-via-letta-adapter-permissive-replacement-for-context-mode-session-resume-tool-output-indexing/_overview.md` | Strategic neighbor | This Codex draft informs lane-2 shipping for Codex users only; it does not replace the permissive-replacement strategy work. |
| `agent-kit-v1-session-memory` sibling worktree | Benchmark subject | Memo must capture exact v1 SHA used for the Codex run. |
| `agent-kit-v2-ctx-rs` sibling worktree | Benchmark subject | Memo must capture exact v2 SHA and any parity assumptions used for the Codex run. |

## Edge Cases and Error Handling

| ID | Scenario | Handling |
| --- | --- | --- |
| (C1) | Codex CLI is not available or cannot be invoked non-interactively | Task 1.4 fails and Tier 3 is blocked. |
| (C2) | `CODEX_HOME` config shape differs from expectations | Preflight or hook verifier fails before any productivity run. |
| (C3) | Context-mode hook chain is partially installed | Hook verifier blocks the affected variant. |
| (C4) | Repo-local `.agents/skills` resolution differs by cwd | Tool-surface smoke must prove the active surface before execution. |
| (C5) | Proxy sees traffic without variant attribution | Proxy fail-closes and marks the run invalid. |
| (C6) | Spend cap trips mid-experiment | Runner records a clean abort state between tasks and excludes incomplete full-run aggregates. |
| (C7) | Tier 2 IR looks better but productivity is flat or worse | Decision memo treats IR as diagnostic only. |

## Non-goals

- Reusing Claude benchmark conclusions as Codex conclusions without running the Codex track
- Proving general Codex superiority over other agents
- Benchmarking deprecated `.codex/prompts` surfaces
- Shipping a Codex recommendation if the execution contract remains unproven
- Replacing context-mode or designing a new Codex runtime integration in this draft alone

## Risks

| ID | Severity | Risk | Mitigation |
| --- | --- | --- | --- |
| (C8) | HIGH | Codex invocation behavior is less stable or less scriptable than assumed | Make Task 1.4 an explicit hard gate before building the rest of Tier 3 conclusions. |
| (C9) | HIGH | Hook/config drift silently changes the active variant surface | Automate hook verification and tool-surface smoke. |
| (C10) | HIGH | Proxy attribution is incomplete under Codex execution paths | Fail closed and refuse to aggregate incomplete runs. |
| (C11) | MEDIUM | Worktree cwd changes skill resolution unexpectedly | Encode cwd in the variant manifest and test it. |
| (C12) | MEDIUM | Codex and Claude benchmark task semantics drift if maintained separately | Keep shared task-manifest shape and recommendation semantics aligned across both blueprints. |
| (C13) | MEDIUM | Results are too close to separate variants confidently | Include Wilson intervals and allow "park both" as the safe default. |

## Technology Choices

| Area | Choice | Why |
| --- | --- | --- |
| Productivity harness target | Harbor 2.0 + custom Codex adapter | Keeps the benchmark family structurally aligned while isolating agent-specific behavior |
| Skill surface | `.agents/skills` | Matches documented Codex discovery behavior |
| Home-config isolation | isolated `CODEX_HOME` per variant | Codex behavior depends on home config and hook files |
| Durable reports | Markdown + JSON | Reviewable memo plus machine-readable manifest |
| Temporary runtime state | `.tmp/session-memory-productivity-codex/` | Repo-local and disposable |
| Token accounting | Proxy JSONL + schema | Same auditable accounting standard as the Claude track |

## Refinement summary

| Metric | Value |
| --- | --- |
| Findings total | 8 |
| Critical | 0 |
| High | 4 |
| Medium | 3 |
| Low | 1 |
| Fixes applied | draft scaffold only |
| Cross-plan updates required | 0 immediate |
| Edge cases documented | 7 |
| Risks documented | 6 |
| Parallelization score | **A** |
| Critical path | **5 waves** |
| Max parallel agents | **7** |
| Total tasks | **16** |
| Blueprint compliant | **16 / 16** |

## Unverified claims that gate Tier 3

These claims must be proven before a full Codex productivity run is allowed:

1. **Codex non-interactive execution contract** — one stable, automatable invocation path must succeed.
2. **Variant surface determinism** — the benchmark must prove which skills, hooks, and home config are active for each variant.
3. **Token attribution completeness** — one live request path through Codex must produce correct proxy usage accounting.
4. **Runner stability** — the Codex adapter must distinguish task failure from infra failure and clean budget abort.
5. **Task-harness compatibility** — Harbor + Codex adapter assumptions must be validated on at least one oracle/smoke task before full runs.

## Expected outcome

If this blueprint is executed successfully, the repo will contain:

- a checked-in Codex benchmark harness under `benchmarks/session-memory-productivity-codex/`
- a durable Codex decision bundle under `reports/session-memory-productivity-codex/latest/`
- a fair Codex comparison across `baseline`, `context-mode`, `v1`, and `v2`
- exactly one recommendation for the Codex track:
  - **ship v1**
  - **ship v2**
  - **park both**

If the Codex invocation contract, hook chain, or attribution model remains unproven, the default safe outcome is **park both for Codex and keep the current baseline/context-mode setup** until the missing evidence exists.
