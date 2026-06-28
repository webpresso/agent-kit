---
type: blueprint
title: "Blueprint review records, approval cross-check, and reviewer scoreboard"
status: draft
complexity: M
owner: codex
created: "2026-06-28"
last_updated: "2026-06-28"
depends_on:
  - blueprints/completed/blueprint-pr-governance/_overview.md
cross_repo_depends_on: []
tags: [blueprint, governance, reviews, analytics]
---

# Blueprint review records, approval cross-check, and reviewer scoreboard

## Goal

Finish the residual governance work split out of `blueprint-pr-governance`: committed in-folder review records, approval-log cross-checking, and reviewer scoreboard analytics. Do not touch open PR #289/#294-owned setup/pretool surfaces until those PRs resolve.

## Why this exists

The original `blueprint-pr-governance` blueprint landed its docs, approval-count gate, `bp/<slug>` branch convention, worktree discipline, PR review-to-ready workflow, and branch cleanup workflow on `main` via PR #285, with doc alignment in PR #290/#293. The remaining work is a distinct storage/analytics lane:

- frontmatter approval counting exists, but committed review-record storage and log-backed approval cross-checking do not yet exist as a durable `wp review` surface;
- reviewer scoreboard analytics are not implemented;
- live PR #289 and #294 own nearby setup/pretool surfaces, so this residual should avoid overlapping implementation until those PRs clear.

## Scope

- Add a committed in-folder review record surface for blueprint review outcomes.
- Make approval validation cross-check frontmatter entries against committed review records.
- Add read-only reviewer scoreboard analytics over committed records / derived cache.
- Keep `.webpresso` as derived, gitignored cache only.

## Non-goals

- Changing pretool worktree-discipline behavior while PR #294 is open.
- Changing dependency setup/worktree install behavior while PR #289 is open.
- Implementing PR auto-merge.

## Tasks

#### [records] Task 1.1: Committed review record writer/reader

**Status:** todo

**Depends:** None

Define and implement the `wp review log` / `wp review read` surface that writes committed review records into a blueprint folder (`reviews.md` and any per-review entries the implementation chooses), then refreshes a gitignored `.webpresso` cache as a derived speed layer.

**Files:**

- Modify/Create: `src/cli/commands/review*` or the current review-command owner discovered during implementation
- Modify/Create: review record parser/storage tests
- Modify: `docs/blueprint-format.md` / templates if the durable record schema changes

**Steps (TDD):**

1. Add tests for writing and reading a committed review record with reviewer, verdict, target slug/hash, commit, evidence, timestamp, and quality signals.
2. Implement the smallest command/storage surface.
3. Verify `.webpresso` remains derived/cache-only and is rebuildable from committed records.
4. Run targeted tests, lint, typecheck, and blueprint lifecycle audit.

**Acceptance:**

- [ ] Review records are committed under the blueprint folder and survive clone/checkout.
- [ ] `.webpresso` is not the source of truth.
- [ ] Tests cover schema, write/read, and cache rebuild behavior.

#### [gate] Task 1.2: Approval frontmatter cross-checks committed records

**Status:** todo

**Depends:** Task 1.1

Upgrade the existing approval-count gate so draft→planned promotion and `wp audit blueprint-lifecycle` count only approval frontmatter entries with matching committed review records for the current blueprint target/hash.

**Files:**

- Modify: `src/blueprint/lifecycle/audit.ts`
- Modify: `src/cli/commands/blueprint/mutations.ts`
- Modify/Create: approval gate tests

**Steps (TDD):**

1. Add failing tests: fabricated frontmatter approval without committed review record is rejected.
2. Add passing tests: two distinct reviewers with matching records pass.
3. Implement cross-check using the committed record reader from Task 1.1.
4. Run targeted lifecycle/mutation tests plus `wp audit blueprint-lifecycle`.

**Acceptance:**

- [ ] Frontmatter-only fabricated approvals do not count.
- [ ] Two distinct log-backed approvals pass promotion/audit.
- [ ] Error messages point to the review log/read surface.

#### [analytics] Task 1.3: Reviewer scoreboard

**Status:** todo

**Depends:** Task 1.1

Implement read-only reviewer scoreboard analytics over committed review records, optionally using the derived `.webpresso` cache for speed.

**Files:**

- Modify/Create: `src/cli/commands/review*` scoreboard surface
- Modify/Create: scoreboard aggregation tests
- Modify: docs for model-routing analytics if user-facing

**Steps (TDD):**

1. Add fixture records covering approve/reject/no-verdict, agreement with final outcome, latency/timeout, and false-positive/survived findings.
2. Implement aggregation by reviewer × task type.
3. Emit routing recommendations from the data without inventing claims.
4. Run targeted tests/lint/typecheck.

**Acceptance:**

- [ ] Scoreboard aggregates approval/rejection counts, agreement with final outcome, surviving findings, false positives, latency, and timeout rate.
- [ ] Recommendations are evidence-backed and deterministic for fixture data.
- [ ] Scoreboard is read-only and does not create new review records.

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable | Effort (T-shirt) |
| ----------------- | --------- | ------------ | -------------- | ---------------- |
| **Wave 0**        | 1.1       | None         | 1 agent        | S                |
| **Wave 1**        | 1.2, 1.3  | 1.1          | 2 agents       | S                |
| **Critical path** | 1.1 → 1.2 | —            | 2 waves        | M                |

### Parallel Metrics Snapshot

| Metric | Meaning                            | Target | Actual |
| ------ | ---------------------------------- | ------ | ------ |
| RW0    | Ready tasks in Wave 0              | ≥ 1    | 1      |
| CPR    | total_tasks / critical_path_length | ≥ 2.0  | 1.5    |
| DD     | dependency_edges / total_tasks     | ≤ 2.0  | 0.67   |
| CP     | same-file overlaps per wave        | 0      | 0      |

**Refinement delta:** storage is the honest serial prerequisite. Gate and scoreboard can run in parallel after the committed-record reader/writer exists.

## Trust Dossier

### Readiness Verdict

- promotion-ready: false
- unresolved-count: 1
- verified-at: 2026-06-28T00:00:00.000Z
- trust-gate-version: v1

### Residual Unknowns

- Exact current owner/path for `wp review` commands must be discovered before promotion.
- Re-check open PR #289/#294 overlap before implementation.
