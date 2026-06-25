---
type: blueprint
title: "Harden and measure typecheck --affected reverse-dependency closure"
owner: ozby
status: planned
complexity: M
created: "2026-06-22"
last_updated: "2026-06-25"
progress: "70% (implementation exists via completed central affected contract; residual work is test timeout hardening and YAGNI measurement)"
depends_on:
  - 2026-06-25-centralize-wp-affected-contract
cross_repo_depends_on: []
tags:
  - cli
  - dx
  - typecheck
  - git
  - performance
---

# Harden and measure `typecheck --affected` reverse-dependency closure

## Goal

Finish the residual hardening for `wp typecheck --affected` now that the central affected contract has already delivered the core implementation. Do **not** reimplement affected flag parsing, git changed-file resolution, audit scoping, or hook integration; those are completed in `blueprints/completed/2026-06-25-centralize-wp-affected-contract.md`.

## Already done / do not duplicate

Plan-refine verification on 2026-06-25 found these pieces already present on `main`:

- `src/git/affected.ts` owns the shared `--affected` / `--branch` option contract, including invalid `--branch` without `--affected` and conflicts with explicit target flags.
- `src/typecheck/affected.ts` builds a TypeScript compiler `Program`, constructs a reverse-dependency graph, and checks the changed-file-plus-importer closure.
- `src/typecheck/affected.test.ts` contains tests for unchanged transitive importers, tsconfig path aliases, and diagnostics in unchanged importers.
- `src/cli/commands/typecheck.ts` wires `wp typecheck --affected [--branch]` to the closure runner and exposes it in CLI help.
- `src/cli/commands/typecheck.test.ts` covers the CLI option/help surface.

Targeted tests for `src/git/affected.test.ts`, `src/cli/commands/typecheck.test.ts`, and `src/cli/commands/audit.test.ts` passed in the installed workspace. The isolated `src/typecheck/affected.test.ts` command exited 143 in one run, and the combined targeted run showed the diagnostic-importer test timing out at Vitest's 10s default. Treat that as the remaining correctness/performance signal, not as a reason to rebuild the feature from scratch.

## Residual findings from refinement

| ID  | Severity | Finding                                                                                                                                                     | Fix                                                                                                                                                                 |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | HIGH     | The reverse-closure diagnostic test can exceed the 10s Vitest timeout locally, which makes the soundness guard unreliable as a release signal.              | Profile the fixture, shrink it or avoid unnecessary full-program work, and keep the test as a passing soundness guard. Do not raise the timeout as the primary fix. |
| F2  | MEDIUM   | The original plan required measuring closure runtime against whole-repo `tsc`; no durable measurement artifact is attached to the completed implementation. | Add a bounded benchmark/smoke comparison and document the result. If closure is not faster for representative changes, disable/descope narrowing per YAGNI.         |
| F3  | LOW      | The original plan text still described net-new implementation that is now done by the central affected contract.                                            | Keep this blueprint scoped to residual hardening only.                                                                                                              |

## Policy gates

- **Engineering principles / YAGNI:** if measured affected closure runtime is not better than whole-repo typecheck for representative staged edits, prefer whole-repo fallback over extra compiler-analysis complexity.
- **No-timeout-as-fix:** the diagnostic test timeout is a symptom. Prefer smaller fixtures, faster diagnostic collection, or narrower compiler host setup before increasing test timeout.
- **Public package safety:** N/A — residual work stays in internal typecheck/test surfaces; no `package.json`, `files`, `bin`, `exports`, catalog, or release-surface changes.

## Implementation tasks

#### [test] Task 1.1: Stabilize the reverse-closure soundness test

**Status:** todo

**Depends:** None

Profile and stabilize the diagnostic-importer case in `src/typecheck/affected.test.ts` so it reliably proves that an unchanged importer broken by a changed shared type is reported by `wp typecheck --affected`. Keep the fixture minimal and avoid using a timeout increase as the primary fix.

**Files:**

- Modify: `src/typecheck/affected.test.ts`
- Modify: `src/typecheck/affected.ts` (only if profiling shows avoidable compiler work)

**Steps (TDD):**

1. Run: `wp test --file src/typecheck/affected.test.ts` — reproduce the timeout/failure.
2. Add temporary local timing/profiling or reduce the fixture to identify the slow step.
3. Implement the smallest fixture or code-path change that keeps the diagnostic assertion and finishes under the default timeout.
4. Run: `wp test --file src/typecheck/affected.test.ts` — verify PASS.
5. Run: `wp typecheck --file src/typecheck/affected.ts --file src/typecheck/affected.test.ts`.
6. Run: `wp lint --file src/typecheck/affected.ts --file src/typecheck/affected.test.ts`.

**Acceptance:**

- [ ] `wp test --file src/typecheck/affected.test.ts` passes without increasing the timeout as the primary fix.
- [ ] The unchanged-importer diagnostic assertion remains in place.
- [ ] Any production-code change is justified by profiling evidence.
- [ ] Targeted typecheck and lint pass for changed files.

#### [perf] Task 1.2: Add affected-vs-full typecheck measurement evidence

**Status:** todo

**Depends:** Task 1.1

Create a durable, bounded measurement that compares the reverse-importer closure path with whole-repo typecheck for a representative changed source file. The result decides whether affected narrowing remains enabled or should fall back to whole-repo typecheck under the YAGNI gate.

**Files:**

- Modify: `src/typecheck/affected.test.ts` or create a focused benchmark/smoke under the existing test/bench conventions
- Modify: `blueprints/planned/2026-06-22-affected-flag-typecheck-followup.md`

**Steps (TDD):**

1. Define a representative changed-file fixture or repo-local smoke that exercises a non-trivial importer closure.
2. Capture closure runtime and whole-repo typecheck runtime with bounded commands; avoid flaky wall-clock assertions in unit tests.
3. Document the measured result in this blueprint's Trust Dossier / Promotion Gates.
4. If closure is not meaningfully faster, update `runAffectedTypecheck` to widen to whole-repo typecheck with a notice.
5. Run: `wp test --file src/typecheck/affected.test.ts`.
6. Run: `wp typecheck --file src/typecheck/affected.ts --file src/typecheck/affected.test.ts`.

**Acceptance:**

- [ ] A durable measurement artifact or documented smoke result exists.
- [ ] The plan records whether affected closure is retained or descope-to-full is chosen.
- [ ] No flaky wall-clock threshold is added to the normal unit suite.
- [ ] Targeted tests/typecheck pass.

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable | Effort (T-shirt) |
| ----------------- | --------- | ------------ | -------------- | ---------------- |
| **Wave 0**        | 1.1       | None         | 1 agent        | S                |
| **Wave 1**        | 1.2       | 1.1          | 1 agent        | S                |
| **Critical path** | 1.1 → 1.2 | —            | 2 waves        | M                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual |
| ------ | ---------------------------------- | -------------------- | ------ |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 1      |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 1.0    |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 0.5    |
| CP     | same-file overlaps per wave        | 0                    | 0      |

Refinement delta: this residual plan is intentionally narrow and is **not** a `/pll` throughput candidate. The broader implementation tasks were already completed by the central affected contract; only serialized verification/performance hardening remains.

## Acceptance criteria

- [ ] The reverse-closure soundness test passes reliably under the default test timeout.
- [ ] A measured YAGNI decision exists for closure narrowing versus whole-repo fallback.
- [ ] No duplicated affected git resolver or CLI flag parsing is introduced.
- [ ] `wp test --file src/typecheck/affected.test.ts` passes.
- [ ] `wp audit blueprint-lifecycle` passes after updating the blueprint record.

## Out of scope

- Reimplementing `--affected` option parsing or changed-file resolution.
- Reworking `lint`, `format`, `test`, `audit`, or hook affected behavior.
- Adding new import-graph dependencies such as `ts-morph`, `madge`, or `dependency-cruiser`.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                  | Evidence                                                               |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| C1  | This residual hardening blueprint has a canonical repository document. | repo:blueprints/planned/2026-06-22-affected-flag-typecheck-followup.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

- `src/typecheck/affected.test.ts` diagnostic-importer case timed out in a combined targeted run on 2026-06-25 and must be stabilized before completion.
- A durable affected-closure-vs-whole-repo typecheck measurement is still required by the YAGNI gate.
