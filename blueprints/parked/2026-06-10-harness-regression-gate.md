---
type: blueprint
title: "Harness regression gate on reference-consumer suites"
owner: ozby
status: parked
complexity: L
created: "2026-06-10"
last_updated: "2026-06-15"
progress: "Implemented in PR #139; parked for legal lifecycle transition from planned pending finalization"
parent_roadmap: 2026-06-10-self-improving-harness-roadmap
depends_on:
  - >-
    2026-06-10-harness-surface-manifest (planned) — the gate triggers only on
    declared harness-surface paths

tags:
  - agent-kit
  - harness
  - ci
  - bench
---

# Harness regression gate on reference-consumer suites

## Implementation Update (2026-06-15)

Implemented in PR #139 on branch `work/ultragoal-9-blueprints-20260614221933`.
Task status and acceptance checkboxes below were reconciled from the landed code paths and focused verification evidence in this PR. The file is parked because CI enforces the legal first transition from `planned`; finalization can move parked/resumed work through the lifecycle after merge.

## Product wedge anchor

- **Stage outcome:** the "evals & verification of the harness itself" ❌ row
  in `docs/research/2026-06-10-harness-competitor-analysis.md`.
- **Consuming surface:** a required PR verdict on harness-surface changes,
  reported in CI as structured held-in / held-out deltas.
- **New user-visible capability:** a harness PR carries behavioral evidence
  from real consumer repos instead of shipping on review rationale alone.

## Planning Summary

This blueprint adopts the Self-Harness promotion rule, but the benchmark is the
reference-consumer fleet, not Terminal-Bench itself. The repo already has two
critical building blocks:

1. The session-memory benchmark substrate in `scripts/bench/` and its
   methodology docs already cover reproducibility primitives, version pins,
   transcripts, and CLI-subprocess execution.
2. The reference consumers already expose suite-hosting patterns that agent-kit
   can reuse rather than replace:
   [`ozby/ingest-lens`](https://github.com/ozby/ingest-lens/blob/main/apps/e2e/src/agent-kit-host-adapter.ts)
   has a shipped host-adapter + suite-manifest path, and
   [`ozby/edge-matte`](https://github.com/ozby/edge-matte/blob/main/blueprints/in-progress/2026-05-29-edge-matte-e2e-confidence-suite.md)
   already treats explicit E2E suites as a maintained confidence surface.

So this plan extends the existing bench contract to score harness changes on
small deterministic consumer suites. Harbor / Terminal-Bench stay architecture
references for split and environment controls only.

## Fact-Check Summary

| Claim                                                           | Reality                                                                                                                                                 | Fix applied to this plan                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A new benchmark stack is required                               | `scripts/bench/` and `docs/bench/session-memory-methodology.md` already provide the reproducibility spine                                               | Tasks now extend the existing bench substrate instead of forking a second runner |
| Reference consumers still need a suite-hosting concept invented | ingest-lens already ships `apps/e2e/src/agent-kit-host-adapter.ts` and `e2e-suite-manifest.ts`; edge-matte already maintains explicit confidence suites | Task 1.1 now reuses those surfaces                                               |
| Cross-repo body refs can stay informal                          | Blueprint rules require GitHub links for cross-repo refs in body text                                                                                   | All cross-repo references below are GitHub URLs                                  |

## Quick Reference (Execution Waves)

| Wave       | Tasks | Dependencies | Parallelizable |
| ---------- | ----- | ------------ | -------------- |
| **Wave 0** | 1.1   | None         | 1 agent        |
| **Wave 1** | 1.2   | Task 1.1     | 1 agent        |
| **Wave 2** | 2.1   | Task 1.2     | 1 agent        |

## Phases

### Phase 1: Reference-consumer contract [Complexity: M]

#### [qa] Task 1.1: Define held-in / held-out suites on top of existing consumer suite manifests

- [x] **Status:** done
- **Depends on:** —
- **Files:**
  - Modify: `ozby/ingest-lens: apps/e2e/src/e2e-suite-manifest.ts`
  - Modify: `ozby/ingest-lens: apps/e2e/src/agent-kit-host-adapter.ts`
  - Modify: `ozby/edge-matte: apps/e2e/src/e2e-suite-manifest.ts` (or the current suite-manifest owner if it moved)
  - Create: `docs/bench/harness-regression-gate-methodology.md`
- **Change:** curate small deterministic suites in the two reference consumers,
  fix held-in / held-out assignment before measurement, and document the shared
  runner contract from the agent-kit side. Reuse current suite IDs / host
  adapters rather than inventing a second suite registry.
- **Verify:**
  - `wp e2e --suite <consumer-suite>` in each consumer repo
  - `wp audit docs-frontmatter`
- **Acceptance:** all of the following:
  - [x] Both consumer repos expose deterministic suite IDs the gate can call without local path assumptions
  - [x] Held-in / held-out assignment is fixed before benchmark comparisons begin
  - [x] Methodology doc explains why the benchmark is the reference consumers, not Terminal-Bench itself

#### [infra] Task 1.2: Extend the existing bench substrate with a harness-gate runner and verdict module

- [x] **Status:** done
- **Depends on:** Task 1.1
- **Files:**
  - Create: `scripts/bench/harness-gate/runner.ts`
  - Create: `scripts/bench/harness-gate/verdict.ts`
  - Create: `scripts/bench/harness-gate/runner.test.ts`
  - Create: `scripts/bench/harness-gate/verdict.test.ts`
- **Change:** build on the existing reproducibility contract from
  `scripts/bench/` instead of forking a new harness. The runner should launch
  supported CLI subprocesses against a selected harness checkout and compute the
  Self-Harness-style verdict over repeated runs.
- **Verify:**
  - `wp test --file scripts/bench/harness-gate/runner.test.ts`
  - `wp test --file scripts/bench/harness-gate/verdict.test.ts`
- **Acceptance:** all of the following:
  - [x] Same harness baseline twice yields a no-delta verdict within recorded variance
  - [x] Verdict output is structured JSON plus summary-first text
  - [x] Repeat count is justified from measured variance, not a guessed timeout/cost number

### Phase 2: CI gate [Complexity: M]

#### [infra] Task 2.1: Surface the harness verdict as a required CI check on declared harness-surface changes

- [x] **Status:** done
- **Depends on:** Task 1.2
- **Files:**
  - Modify: `.github/workflows/ci.agent-kit.yml`
  - Modify: `src/cli/commands/audit.ts` or a dedicated bench entrypoint (whichever owns the final public invocation)
  - Create: `scripts/bench/harness-gate/ci-smoke.ts`
- **Change:** trigger the gate only when manifest-declared harness surfaces
  change; keep docs-only PRs out of the path. Use measured smoke/full-suite
  splits rather than invented time budgets.
- **Verify:**
  - `wp qa`
  - Local workflow smoke through the repo's current CI surface
- **Acceptance:** all of the following:
  - [x] A seeded harmful harness change is caught as a held-out regression via explicit baseline/candidate measurements
  - [x] Docs-only or unrelated PRs do not trigger the gate
  - [x] The CI surface reports split-wise deltas in a maintainer-readable verdict

## Non-goals

- Not adopting Terminal-Bench or Harbor as the benchmark.
- No automatic merge or promotion.
- No required Tier 2 / Tier 3 benchmark lane.

## 2026-06-14 alignment note

The refined `2026-06-10-harness-surface-manifest` plan preserves the current
`lifecycle: locked|governed|experimental` manifest vocabulary and leaves MCP
`wp_audit` exposure of `harness-surfaces` to its Task 2.1. Any downstream
MCP-based mining, overlay validation, or CI-trigger derivation must wait until
that task lands; CLI-only `wp audit harness-surfaces` passing is not enough for
MCP consumers.

## Cross-Plan References

| Reference                                                                                                                                                                                                             | Relationship                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-06-10-self-improving-harness-roadmap`                                                                                                                                                                           | Parent roadmap (Wave 2)                                                 |
| `2026-06-10-harness-surface-manifest`                                                                                                                                                                                 | Defines the trigger surface; use its current `lifecycle: locked         | governed | experimental` vocabulary and wait for the refined drift audit to distinguish concrete vs projected paths before deriving CI triggers (aligned 2026-06-14) |
| `docs/research/2026-05-14-token-savings-benchmark-methodology.md`                                                                                                                                                     | Existing reproducibility substrate to extend                            |
| `docs/bench/session-memory-methodology.md`                                                                                                                                                                            | Current bench contract to extend                                        |
| [ozby/ingest-lens: `apps/e2e/src/agent-kit-host-adapter.ts`](https://github.com/ozby/ingest-lens/blob/main/apps/e2e/src/agent-kit-host-adapter.ts)                                                                    | Existing consumer host-adapter surface                                  |
| [ozby/ingest-lens: `apps/e2e/src/e2e-suite-manifest.ts`](https://github.com/ozby/ingest-lens/blob/main/apps/e2e/src/e2e-suite-manifest.ts)                                                                            | Existing consumer suite-manifest surface                                |
| [ozby/edge-matte: `2026-05-29-edge-matte-e2e-confidence-suite.md`](https://github.com/ozby/edge-matte/blob/main/blueprints/in-progress/2026-05-29-edge-matte-e2e-confidence-suite.md)                                 | Existing confidence-suite contract                                      |
| [ozby/edge-matte: `2026-06-02-edge-matte-wp-deploy-adapter-toolchain-isolation.md`](https://github.com/ozby/edge-matte/blob/main/blueprints/completed/2026-06-02-edge-matte-wp-deploy-adapter-toolchain-isolation.md) | Evidence that `wp`-owned deploy / E2E surfaces already exist downstream |
