---
type: blueprint
title: "Harness regression gate on reference-consumer suites"
owner: ozby
status: draft
complexity: L
created: "2026-06-10"
last_updated: "2026-06-10"
progress: "0% (draft)"
parent_roadmap: 2026-06-10-self-improving-harness-roadmap
depends_on:
  - >-
    2026-06-10-harness-surface-manifest (draft) — the gate triggers on PRs
    touching declared harness surfaces
tags:
  - agent-kit
  - harness
  - ci
  - bench
---

# Harness regression gate on reference-consumer suites

## Product wedge anchor

- **Stage outcome:** the "evals & verification of the harness itself" ❌ row
  in `docs/research/2026-06-10-harness-competitor-analysis.md`; the
  credibility claim "our harness changes are regression-tested on real
  consumer repos" that no competitor in either arena can make.
- **Consuming surface:** a required PR check on agent-kit PRs touching
  declared harness surfaces (`catalog/`, `src/hooks/`, routing blocks),
  surfaced as a structured pass/fail verdict in CI.
- **New user-visible capability:** a harness PR shows a behavioral verdict
  ("held-in Δ=+2, held-out Δ=0 — promotable") instead of shipping on review
  rationale alone.

## Planning Summary

Adopts the Self-Harness promotion rule (see
`docs/research/papers/2026-self-harness.md`): a harness change is promotable
iff Δheld-in ≥ 0 AND Δheld-out ≥ 0 AND max > 0; for pure refactors the gate
relaxes to non-regression only (Δ ≥ 0 on both). Split/environment controls
follow Terminal-Bench practice (fixed split assignment across variants,
fresh environment per task — see
`docs/research/papers/2026-terminal-bench.md`).

**The benchmark is the reference consumers, not a public benchmark:** small
fixed task suites defined in ingest-lens (two-axis consumer) and edge-matte
(agent-kit-only consumer), run under Tier 1 CLIs per
`catalog/agent/rules/supported-agent-clis.md` (per-call token extraction and
reproducible session lifecycle are exactly the Tier 1 requirements). Extends
the measurement design already specified in
`docs/research/2026-05-14-token-savings-benchmark-methodology.md` and
`docs/bench/session-memory-methodology.md` — same CLI-subprocess approach,
new metric (task pass-rate) — rather than forking a new bench stack.

Stochasticity: repeated runs with aggregate pass counts, exactly as the paper
prescribes; repeat count is a measured cost/variance tradeoff decided in
Phase 1, not a guess.

## Phases

### Phase 1: Suite definition and baseline [Complexity: M]

#### [qa] Task 1.1: Define held-in/held-out task suites in reference consumers

**Status:** todo

**Depends:** —

Curate 10–20 small, verifier-checkable agent tasks per consumer (e.g. "add a
route with tests passing", "fix this seeded lint violation via wp_* tools"),
partitioned held-in/held-out before any measurement. Tasks live in the
consumer repos; agent-kit owns only the runner contract.

**Acceptance:**

- [ ] Suites committed in ingest-lens and edge-matte with deterministic
      verifiers
- [ ] Split assignment fixed and documented
- [ ] Baseline pass rates measured ≥3 repeats; variance recorded and the
      repeat count justified from it

#### [infra] Task 1.2: Runner + verdict computation

**Status:** todo

**Depends:** Task 1.1

CLI-subprocess runner (Tier 1 CLIs) executing a suite under a given harness
checkout; verdict module implements the promotion rule with repeat
aggregation.

**Acceptance:**

- [ ] Same harness twice → no-delta verdict within recorded variance
- [ ] Verdict output is structured (JSON) + summary-first text

### Phase 2: CI integration [Complexity: M]

#### [infra] Task 2.1: PR gate on harness-surface paths

**Status:** todo

**Depends:** Task 1.2

Trigger on PRs touching manifest-declared surfaces; post the verdict as a
check. Cost control: full suite on labeled/release PRs, smoke subset
otherwise — thresholds measured, not invented (no-timeout-as-fix rule
applies to runtime budgets).

**Acceptance:**

- [ ] A seeded harmful rule change (e.g. instruction inversion fixture) is
      caught as a held-out regression in CI
- [ ] A docs-only PR does not trigger the suite
- [ ] Verdict check appears on the PR with split-wise deltas

## Non-goals

- Not adopting Terminal-Bench/Harbor as the benchmark (architecture
  reference only, if sandboxed scale is ever needed).
- No automatic merge/promotion — the gate informs; humans merge.
- No Tier 2 CLIs in the required check (documented-degradation rules per the
  supported-CLI rule make their numbers non-comparable).

## Cross-Plan References

| Reference | Relationship |
| --- | --- |
| `2026-06-10-self-improving-harness-roadmap` | Parent roadmap (Wave 2) |
| `2026-06-10-harness-surface-manifest` | Defines gate-triggering paths |
| `docs/research/2026-05-14-token-savings-benchmark-methodology.md` | Measurement substrate to extend |
| `docs/bench/session-memory-methodology.md` | Bench conventions to extend |
