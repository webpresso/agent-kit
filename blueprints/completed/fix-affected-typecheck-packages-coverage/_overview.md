---
type: blueprint
status: completed
complexity: S
created: "2026-06-28"
last_updated: "2026-07-01"
progress: "100% (3 of 3 tasks completed)"
depends_on: []
cross_repo_depends_on: []
tags:
  - typecheck
  - hooks
  - dx
approvals:
  - reviewer: eng-review
    verdict: approve
    commit: 32cd1968b861cd8d26558423740751728b738d25
    evidence: "plan-refine engineering review: repo paths and tests verified on 2026-07-01"
  - reviewer: codex
    verdict: approve
    commit: 32cd1968b861cd8d26558423740751728b738d25
    evidence: "independent Codex verification: focused test gate passed on 2026-07-01"
title: "Fix affected-typecheck coverage for `packages/*` sub-packages"
owner: ozby
---

# Fix affected-typecheck coverage for `packages/*` sub-packages

**Goal:** Stop `wp typecheck --affected` from fail-closing on `packages/*`-only
changes so new-package PRs (the DRY extraction wave) can pass the pre-push hook.

## Product wedge anchor

- **Stage outcome:** The DRY package-extraction wave (`@webpresso/agent-core`,
  `@webpresso/agent-config`) — shared low-level primitives consumers depend on.
  Cite: workspace CLAUDE.md "open-sourcing building blocks" + the in-flight
  `feat/agent-core-primitives` branch.
- **Consuming surface:** `.husky/pre-push` → `wp typecheck --affected --branch`
  (and CI affected typecheck). Every PR that adds/edits files under
  `packages/*`.
- **New user-visible capability:** A contributor can push a PR that
  adds/modifies a `packages/*` sub-package and the pre-push hook typechecks it
  in its own TS project instead of fail-closing with "no changed files inside
  the active TypeScript program."

## Problem Statement

`planAffectedTypecheckClosure` (`src/typecheck/affected.ts`) builds a single
`ts.Program` from **only the root `tsconfig.json`** (`include: ["src/**/*"]`).
When the only changed files live under a workspace package (`packages/agent-config`,
`packages/workflow-skills`, incoming `packages/agent-core`) — each of which has
its **own** `tsconfig.json` — those files are not in the root program, so
`changedFiles` is empty and the planner throws fail-closed. The package
typechecks clean on its own; the hook is the defect.

This blocks **every** `packages/*`-only PR, not just agent-core.

## Fact-Checked Findings

- `tsconfig.json` root: `"include": ["src/**/*"]` (no `references`, no
  `packages/*`). Evidence: `repo:tsconfig.json:85`.
- Fail-closed throw: `repo:src/typecheck/affected.ts:103-107`.
- `packages/agent-config/tsconfig.json` and
  `packages/workflow-skills/tsconfig.json` already exist on `main`. Evidence:
  `git ls-files 'packages/**/tsconfig.json'`.
- Caller passes only typecheckable files and handles the empty case upstream
  (`filterTypecheckableFiles` + `kind === "empty" → return 0`):
  `repo:src/cli/commands/typecheck.ts:83,101-104`.
- The planner already resolves per-file owning scopes for `--file`/`--package`
  (`resolveFileScopes`/`getWorkspaceScopes`): `repo:src/typecheck/planner.ts`.

## Key Decisions

| Decision                    | Choice                                                    | Rationale                                                                                                                             |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Coverage vs skip-not-fail   | Cover `packages/*` via per-owning-tsconfig programs       | Pure skip-not-fail would silently stop typechecking any package-only PR — a real coverage gap; violates the repo's fail-loud ethos.   |
| Owning-tsconfig resolution  | Nearest `tsconfig.json` walking up to repoRoot            | Dependency-free, general; naturally maps `src/**` → root, `packages/x/**` → `packages/x/tsconfig.json`.                               |
| Preserve fail-loud          | Fail-closed only when **zero** closure plans can be built | A changed `.ts` that belongs to no active program still fails, so the original diagnostic intent is kept.                             |
| Reverse-closure granularity | Per owning tsconfig (no cross-package closure)            | Packages have isolated tsconfigs by design; cross-package type breaks are caught by the importing package's own typecheck or full CI. |

## Architecture Overview

```text
runAffectedTypecheck(files)
  └─ planAffectedTypecheckClosures(files)        # NEW (plural)
       ├─ group files by findOwningTsconfig(file, repoRoot)   # nearest tsconfig up-tree
       ├─ for each owning tsconfig with ≥1 in-program file:
       │     buildClosurePlanForConfig(configPath, files) → AffectedClosurePlan
       └─ if zero plans built → throw fail-closed (preserved intent)
  └─ for each plan: collectAffectedDiagnostics → aggregate exitCode + checkedFiles
```

`planAffectedTypecheckClosure` (singular) is kept for the root case and existing
closure tests.

### Phase 1: Implementation [Complexity: S]

#### [backend] Task 1.1: Group affected files by owning tsconfig and plan per project

**Status:** done

**Depends:** None

Add `findOwningTsconfig(absFile, repoRoot)` (nearest `tsconfig.json` from the
file's directory up to and including repoRoot, else `null`). Extract the
single-config closure build into `buildClosurePlanForConfig(configPath, repoRoot,
files)` returning `AffectedClosurePlan | null` (null when no file is in that
program). Add `planAffectedTypecheckClosures(options): AffectedClosurePlan[]`
that groups changed files by owning tsconfig, builds a plan per config, and
throws the fail-closed error only when zero plans build. Keep
`planAffectedTypecheckClosure` (singular) delegating to the root config.

**Files:**

- Modify: `src/typecheck/affected.ts`

**Acceptance:**

- [x] `planAffectedTypecheckClosures` returns ≥1 plan for a `packages/*`-only change
- [x] Fail-closed throw retained when no plan can be built

#### [backend] Task 1.2: Aggregate diagnostics across plans in runAffectedTypecheck

**Status:** done

**Depends:** Task 1.1

`runAffectedTypecheck` iterates the plural plans, runs
`collectAffectedDiagnostics` per plan, unions `checkedFiles`, and sets
`exitCode = 1` if any plan has diagnostics. Log config + changed + closure
counts per plan.

**Files:**

- Modify: `src/typecheck/affected.ts`

**Acceptance:**

- [x] exitCode is the max across plans; checkedFiles is the union

#### [qa] Task 1.3: Tests — packages/\* covered, mixed src+package, fail-closed preserved

**Status:** done

**Depends:** Task 1.2

Add tests to `src/typecheck/affected.test.ts` using a multi-tsconfig fixture
(root `src/` + `packages/pkg-a/` with its own tsconfig):

1. A changed file under `packages/pkg-a/src` produces a plan (no throw) and is
   typechecked in pkg-a's program.
2. A mixed change (root `src/` + `packages/pkg-a/`) produces two plans; both
   sets of files are checked.
3. A changed `.ts` file with no owning tsconfig still fail-closes.
4. Diagnostics inside a package are reported (exitCode 1).

**Files:**

- Modify: `src/typecheck/affected.test.ts`

**Acceptance:**

- [x] All new tests pass; existing closure tests stay green

## Verification Gates

| Gate      | Command                                                               | Success Criteria                           |
| --------- | --------------------------------------------------------------------- | ------------------------------------------ |
| Tests     | `wp test --file src/typecheck/affected.test.ts`                       | All pass                                   |
| Typecheck | `wp typecheck --affected --branch` (with a packages/\* change staged) | No fail-closed; exits per real diagnostics |
| Lint      | scoped oxlint                                                         | Zero violations                            |

## Non-goals

- Cross-package reverse-dependency closure (per-tsconfig granularity is intended).
- Converting the repo to TS project references / composite builds.
- Changing the pre-commit (`--affected`) guardrails path (separate, already green).

## Risks

| Risk                                         | Impact           | Mitigation                                                       |
| -------------------------------------------- | ---------------- | ---------------------------------------------------------------- |
| Over-skipping a genuinely unconfigured `.ts` | Missed typecheck | Fail-closed retained when zero plans build; test 3 guards it.    |
| Per-package program startup cost             | Slower hook      | Only owning tsconfigs of changed files are loaded (typically 1). |

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T12:52:00Z
- verified-head: 32cd1968b861cd8d26558423740751728b738d25
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                    | Evidence                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| C1  | Affected typecheck package closure coverage is implemented and regression-tested for package-level dependency expansion. | repo:src/typecheck/affected.ts; repo:src/typecheck/affected.test.ts                                   |
| C2  | Focused regression coverage for this blueprint is present and was run in the managed worktree.                           | repo:src/typecheck/affected.test.ts; derived:C1                                                       |
| C3  | Two review approvals are recorded for the lifecycle disposition.                                                         | repo:blueprints/completed/fix-affected-typecheck-packages-coverage/reviews.md; derived:C1; derived:C2 |

### Material Decisions

| ID  | Decision              | Chosen option                                       | Rejected alternatives                           | Rationale                                                                                                                                                  |
| --- | --------------------- | --------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Lifecycle disposition | Mark completed from existing implemented repo state | Force a process-only planned/in-progress detour | Repo transition matrix permits draft-to-completed when tasks are terminal; focused tests and lifecycle audits prove the implementation is already present. |

### Promotion Gates

| Gate            | Command                                       | Expected outcome            | Last result        |
| --------------- | --------------------------------------------- | --------------------------- | ------------------ |
| focused-tests   | wp test --file src/typecheck/affected.test.ts | All targeted tests pass     | PASS on 2026-07-01 |
| lifecycle-audit | wp audit blueprint-lifecycle                  | Lifecycle metadata is valid | PASS on 2026-07-01 |
| trust-audit     | wp audit blueprint-trust                      | Trust dossier validates     | PASS on 2026-07-01 |

### Residual Unknowns

None.

## Completion Summary

- Completed on: `2026-07-01`
- Implementation head: `32cd1968b861cd8d26558423740751728b738d25`
- Summary: 3 of 3 tasks completed.
- Verification: `wp test --file src/typecheck/affected.test.ts` passed in the managed worktree after `vp install`.
- Review approvals: see `reviews.md` (eng-review + codex approvals).
- Remaining risks: None for the implemented scope; any explicitly scheduled/non-required follow-ups remain outside this blueprint completion gate.
