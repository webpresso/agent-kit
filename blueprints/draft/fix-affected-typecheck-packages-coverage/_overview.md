---
type: blueprint
status: draft
complexity: S
created: "2026-06-28"
last_updated: "2026-06-28"
progress: "0% (0 of 3 tasks completed)"
depends_on: []
cross_repo_depends_on: []
tags:
  - typecheck
  - hooks
  - dx
approvals: [] # ≥2 distinct reviewer approvals required before draft→planned
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

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Coverage vs skip-not-fail | Cover `packages/*` via per-owning-tsconfig programs | Pure skip-not-fail would silently stop typechecking any package-only PR — a real coverage gap; violates the repo's fail-loud ethos. |
| Owning-tsconfig resolution | Nearest `tsconfig.json` walking up to repoRoot | Dependency-free, general; naturally maps `src/**` → root, `packages/x/**` → `packages/x/tsconfig.json`. |
| Preserve fail-loud | Fail-closed only when **zero** closure plans can be built | A changed `.ts` that belongs to no active program still fails, so the original diagnostic intent is kept. |
| Reverse-closure granularity | Per owning tsconfig (no cross-package closure) | Packages have isolated tsconfigs by design; cross-package type breaks are caught by the importing package's own typecheck or full CI. |

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

**Status:** todo

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

- [ ] `planAffectedTypecheckClosures` returns ≥1 plan for a `packages/*`-only change
- [ ] Fail-closed throw retained when no plan can be built

#### [backend] Task 1.2: Aggregate diagnostics across plans in runAffectedTypecheck

**Status:** todo

**Depends:** Task 1.1

`runAffectedTypecheck` iterates the plural plans, runs
`collectAffectedDiagnostics` per plan, unions `checkedFiles`, and sets
`exitCode = 1` if any plan has diagnostics. Log config + changed + closure
counts per plan.

**Files:**

- Modify: `src/typecheck/affected.ts`

**Acceptance:**

- [ ] exitCode is the max across plans; checkedFiles is the union

#### [qa] Task 1.3: Tests — packages/* covered, mixed src+package, fail-closed preserved

**Status:** todo

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

- [ ] All new tests pass; existing closure tests stay green

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Tests | `wp test --file src/typecheck/affected.test.ts` | All pass |
| Typecheck | `wp typecheck --affected --branch` (with a packages/* change staged) | No fail-closed; exits per real diagnostics |
| Lint | scoped oxlint | Zero violations |

## Non-goals

- Cross-package reverse-dependency closure (per-tsconfig granularity is intended).
- Converting the repo to TS project references / composite builds.
- Changing the pre-commit (`--affected`) guardrails path (separate, already green).

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Over-skipping a genuinely unconfigured `.ts` | Missed typecheck | Fail-closed retained when zero plans build; test 3 guards it. |
| Per-package program startup cost | Slower hook | Only owning tsconfigs of changed files are loaded (typically 1). |
