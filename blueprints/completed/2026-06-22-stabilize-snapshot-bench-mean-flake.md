---
type: blueprint
title: "Stabilize snapshot_50_events bench mean against CI outlier flake"
owner: ozby
status: completed
complexity: S
created: "2026-06-22"
last_updated: "2026-06-25"
progress: "100% (fix landed in PR #240; plan-refine verified code and threshold contract on 2026-06-25)"
depends_on: []
cross_repo_depends_on: []
tags:
  - ci
  - performance
  - native
  - flaky-test
---

# Stabilize `snapshot_50_events` bench mean against CI outlier flake

## Goal

Stop the native session-memory bench gate from flaking on the **mean** threshold
for `snapshot_50_events`, by stabilizing the _measurement_ — **not** by raising
the threshold (the gate explicitly forbids that:
`native/session-memory-engine/scripts/check-bench-thresholds.sh:128`).

## Root cause

`check-bench-thresholds.sh` enforces both `mean` and `median` against a 500µs SLO
for `snapshot_50_events` (lines 26/34, 114/117). The benchmark
(`benches/hot_path.rs::bench_snapshot`) is a sub-200µs micro-op run with
Criterion **defaults** (warm-up 3s, measurement 5s, sample_size 100). On a shared
CI runner, an occasional **severe outlier** (scheduler preemption / cold cache)
drags the outlier-inclusive `mean.point_estimate` over 500µs while the `median`
stays ~150–260µs.

Observed: PR #236's run failed with `mean=550719 ns > 500000 ns` while
`median=263182 ns` — the mean was the only breach. `origin/main` runs were green;
a re-run passed at `mean=155242 ns`. Classic mean-skew flake, not a regression.

## Fix (measurement stabilization, not a threshold change)

`benches/hot_path.rs`: move `bench_snapshot` into its own `criterion_group!` with
a stabilized `config` — `warm_up_time(5s)`, `measurement_time(10s)`,
`sample_size(300)`. `criterion_group!{ config = … }` applies per-group **without
renaming benches**, so the id stays `snapshot_50_events` and the gate's threshold
key still matches. The slow `index_100_chunks` bench (350ms/iter) is left in the
default group so it is **not** subjected to the larger sample count.

Why this fixes the flake: 300 samples / 90k iterations gives a lone severe
outlier ~1/300 leverage on the mean instead of ~1/100 (~3× less), and the longer
warm-up sheds cold-start samples.

## Measurement evidence (local)

|        | samples | iters | warm-up | mean (ns) | median (ns) | outliers | severe |
| ------ | ------- | ----- | ------- | --------- | ----------- | -------- | ------ |
| before | 100     | 40k   | 3s      | 141607    | 141181      | 11%      | 2.0%   |
| after  | 300     | 90k   | 5s      | 151218    | 148012      | 5%       | 1.0%   |

Both well under the 500µs SLO (3.3× headroom); severe-outlier rate halved.
**Caveat:** a quiet local machine cannot reproduce the CI 550µs spike, so the fix
is mechanistically justified (sample leverage + warm-up); the merged PR's CI is
the real verification.

## Tasks

### [native] Task 1: Stabilize the snapshot bench measurement

**Status:** done
**Depends:** None

**Files:**

- Modify: `native/session-memory-engine/crates/session-memory-core/benches/hot_path.rs`

**Steps:**

1. Split `bench_snapshot` into its own `criterion_group!` with
   `warm_up_time(5s)`, `measurement_time(10s)`, `sample_size(300)`; keep the
   other benches on defaults; keep the bench id `snapshot_50_events`.
2. `cargo bench … --bench hot_path -- snapshot_50_events` — confirm the id/path is
   unchanged and mean/median stay well under 500µs.
3. Confirm `index_100_chunks` is untouched (still default sampling).

**Acceptance:**

- [x] Bench id `snapshot_50_events` unchanged (gate key matches).
- [x] `check-bench-thresholds.sh` SLO threshold untouched (no `MEAN_THRESHOLDS_NS` edit).
- [x] Local mean/median under 500µs with the stabilized config.
- [x] **CI `Native session-memory bench gate` green on this PR.**

## Plan-refine closeout (2026-06-25)

This planned record was already completed on `main`: `git log --all --oneline -- native/session-memory-engine/crates/session-memory-core/benches/hot_path.rs` shows `f1c0e0f5 fix(bench): stabilize snapshot_50_events mean against CI outlier flake (#240)`. Code verification found `snapshot_50_events` in its own Criterion group with `warm_up_time(5s)`, `measurement_time(10s)`, and `sample_size(300)`, while `index_100_chunks` remains outside that group and the threshold script still keeps `snapshot_50_events]=500000`.

No further implementation task remains in this blueprint.

## Out of scope

- Path-gating docs/blueprint-only PRs so they skip the bench job — separate work,
  tracked in `blueprints/draft/2026-06-19-ci-path-gating-for-docs-and-blueprint-prs.md`.
- Switching the gate from mean to median-only (a gate-policy change; rejected in
  favor of fixing the measurement at its source).
- Tuning the other micro-benches (capture/search/restore) — do so only if they
  flake; no evidence yet.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 83d99ec6f8289f843a2fbec8a5ec8a6b6b3b4b61
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                           | Evidence                                                                    |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document.                                  | repo:blueprints/completed/2026-06-22-stabilize-snapshot-bench-mean-flake.md |
| C2  | The plan keeps the `snapshot_50_events` threshold unchanged and stabilizes measurement instead. | repo:blueprints/completed/2026-06-22-stabilize-snapshot-bench-mean-flake.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.

## Policy gates

- **Engineering principles:** minimal change scoped to the flaky bench; no new
  deps; threshold/gate untouched. **no-timeout-as-fix:** fixes the measurement at
  source rather than relaxing the bound.
- **Public package safety:** N/A — bench-only Rust change; no `package.json` /
  `files` / `bin` / `exports` / release-surface change.
