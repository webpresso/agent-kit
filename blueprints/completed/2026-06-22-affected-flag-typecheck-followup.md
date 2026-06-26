---
type: blueprint
title: "Harden and measure typecheck --affected reverse-dependency closure"
owner: ozby
status: completed
complexity: M
created: "2026-06-22"
last_updated: "2026-06-26"
progress: "100% (affected-vs-full YAGNI measurement captured; affected closure retained; final gates passed)"
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
- `src/typecheck/affected.test.ts` contains tests for unchanged transitive importers, tsconfig path aliases, diagnostics in unchanged importers, and the public `runAffectedTypecheck` nonzero result path.
- `src/cli/commands/typecheck.ts` wires `wp typecheck --affected [--branch]` to the closure runner and exposes it in CLI help.
- `src/cli/commands/typecheck.test.ts` covers the CLI option/help surface.

Targeted tests for `src/git/affected.test.ts`, `src/cli/commands/typecheck.test.ts`, and `src/cli/commands/audit.test.ts` passed in the installed workspace. The isolated `src/typecheck/affected.test.ts` command exited 143 in one run, and the combined targeted run showed the diagnostic-importer test timing out at Vitest's 10s default. Treat that as the remaining correctness/performance signal, not as a reason to rebuild the feature from scratch.

## Residual findings from refinement

| ID  | Severity | Finding                                                                                                                                                        | Fix                                                                                                                                                         |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | HIGH     | The reverse-closure diagnostic test could exceed the 10s Vitest timeout locally because it proved a compiler diagnostic through the full async CLI log runner. | Fixed by exporting the affected diagnostic collector and making the soundness test assert diagnostics at the owner helper, without raising timeouts.        |
| F2  | MEDIUM   | The original plan required measuring closure runtime against whole-repo `tsc`; no durable measurement artifact is attached to the completed implementation.    | Add a bounded benchmark/smoke comparison and document the result. If closure is not faster for representative changes, disable/descope narrowing per YAGNI. |
| F3  | LOW      | The original plan text still described net-new implementation that is now done by the central affected contract.                                               | Keep this blueprint scoped to residual hardening only.                                                                                                      |

## Policy gates

- **Engineering principles / YAGNI:** if measured affected closure runtime is not better than whole-repo typecheck for representative staged edits, prefer whole-repo fallback over extra compiler-analysis complexity.
- **No-timeout-as-fix:** the diagnostic test timeout is a symptom. Prefer smaller fixtures, faster diagnostic collection, or narrower compiler host setup before increasing test timeout.
- **Public package safety:** N/A — residual work stays in internal typecheck/test surfaces; no `package.json`, `files`, `bin`, `exports`, catalog, or release-surface changes.

## Implementation tasks

#### [test] Task 1.1: Stabilize the reverse-closure soundness test

**Status:** done

**Depends:** None

Profile and stabilize the diagnostic-importer case in `src/typecheck/affected.test.ts` so it reliably proves that an unchanged importer broken by a changed shared type is reported by `wp typecheck --affected`. Keep the fixture minimal and avoid using a timeout increase as the primary fix.

**Completed (2026-06-25, strengthened 2026-06-26):** the test now calls `collectAffectedDiagnostics` directly after building the reverse-importer closure, so it proves the compiler diagnostic at the owning boundary instead of depending on CLI log finalization. A separate public-entry regression calls `runAffectedTypecheck` directly and asserts the nonzero result plus checked closure files, preserving the exit-code wiring proof without returning to the timeout-prone full CLI runner.

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

- [x] `wp test --file src/typecheck/affected.test.ts` passes without increasing the timeout as the primary fix.
- [x] The unchanged-importer diagnostic assertion remains in place.
- [x] The public `runAffectedTypecheck` path still returns exit code 1 for importer diagnostics.
- [x] Any production-code change is justified by profiling evidence.
- [x] Targeted typecheck and lint pass for changed files.

#### [perf] Task 1.2: Add affected-vs-full typecheck measurement evidence

**Status:** done

**Depends:** Task 1.1

Create a durable, bounded measurement that compares the reverse-importer closure path with whole-repo typecheck for a representative changed source file. The result decides whether affected narrowing remains enabled or should fall back to whole-repo typecheck under the YAGNI gate.

**Completed (2026-06-26):** a bounded local smoke staged a no-op comment in `src/typecheck/affected.ts`, then compared `./bin/wp typecheck --affected --full` with `./bin/wp typecheck --full` before restoring the temporary edit. The affected path checked one changed file with a two-file reverse-dependency closure in 13.31s real time; full typecheck took 21.50s real time. This is a meaningful local speedup (~38% less wall time) with no failing diagnostics, so the YAGNI decision is to retain affected closure narrowing. No wall-clock assertion was added to the unit suite.

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

- [x] A durable measurement artifact or documented smoke result exists.
- [x] The plan records whether affected closure is retained or descope-to-full is chosen.
- [x] No flaky wall-clock threshold is added to the normal unit suite.
- [x] Targeted tests/typecheck pass.

## Quick Reference (Execution Waves)

| Wave              | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ----------------- | ----- | ------------ | -------------- | ---------------- |
| **Completed**     | 1.1   | None         | Done           | S                |
| **Wave 0**        | 1.2   | 1.1          | 1 agent        | S                |
| **Critical path** | 1.2   | —            | 1 wave         | S                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual |
| ------ | ---------------------------------- | -------------------- | ------ |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 1      |
| CPR    | total_tasks / critical path length | ≥ 2.5                | 1.0    |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 0      |
| CP     | same-file overlaps per wave        | 0                    | 0      |

Refinement delta: this residual plan is intentionally narrow and is **not** a `/pll` throughput candidate. The broader implementation tasks were already completed by the central affected contract; only serialized verification/performance hardening remains.

## Acceptance criteria

- [x] The reverse-closure soundness test passes reliably under the default test timeout.
- [x] A measured YAGNI decision exists for closure narrowing versus whole-repo fallback.
- [x] No duplicated affected git resolver or CLI flag parsing is introduced.
- [x] `wp test --file src/typecheck/affected.test.ts` passes.
- [x] `wp audit blueprint-lifecycle` passes after updating the blueprint record.

## Out of scope

- Reimplementing `--affected` option parsing or changed-file resolution.
- Reworking `lint`, `format`, `test`, `audit`, or hook affected behavior.
- Adding new import-graph dependencies such as `ts-morph`, `madge`, or `dependency-cruiser`.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-26T00:13:22Z
- verified-head: d682e9fd76f1834f494240b0c06172a847d51436
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                       | Evidence                                                                 |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| C1  | This residual hardening blueprint has a canonical repository document.      | repo:blueprints/completed/2026-06-22-affected-flag-typecheck-followup.md |
| C2  | Affected closure narrowing is meaningfully faster than full typecheck here. | repo:blueprints/completed/2026-06-22-affected-flag-typecheck-followup.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                                                                                                        |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history.                                                                                  |
| D2  | Decide whether affected closure narrowing survives the YAGNI gate.         | Retain affected closure narrowing.     | Widen every affected typecheck to full repo typecheck.     | Local bounded smoke showed affected closure at 13.31s versus full typecheck at 21.50s for a representative source edit, without adding a flaky timing assertion. |

### Promotion Gates

| Gate                | Command                                       | Expected outcome | Last result                          |
| ------------------- | --------------------------------------------- | ---------------- | ------------------------------------ |
| lifecycle           | wp audit blueprint-lifecycle                  | pass             | pass at 2026-06-26T00:13:22Z         |
| diagnostic-importer | wp test --file src/typecheck/affected.test.ts | pass             | pass at 2026-06-26T00:13:22Z         |
| typecheck           | wp typecheck                                  | pass             | pass locally at 2026-06-26T00:13:22Z |
| lint                | wp lint                                       | pass             | pass locally at 2026-06-26T00:13:22Z |

### Measurement Scope Note

Broader CI/runtime variance and larger closure shapes were not benchmarked here by design; the YAGNI decision is based on the bounded local smoke recorded above, without adding flaky timing assertions.

### Residual Unknowns

None.
