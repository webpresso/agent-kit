---
type: blueprint
title: "CI path gating for docs and blueprint-only PRs"
owner: ozby
status: draft
complexity: M
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "0% (drafted as lightweight follow-up; no implementation started)"
depends_on:
  - 2026-06-19-prevent-blueprint-index-drift
cross_repo_depends_on: []
tags:
  - ci
  - blueprints
  - docs
  - performance
---

# CI path gating for docs and blueprint-only PRs

## Goal

Stop running the full test suite for PRs that only change documentation or blueprint files, while preserving required GitHub check names and merge safety.

## Planning Summary

Current CI runs the full `Test` job for every PR through `.github/workflows/ci.agent-kit.yml`, including blueprint-only planning PRs. The local hook work in `2026-06-19-prevent-blueprint-index-drift` keeps commit/push checks lightweight, but GitHub CI still spends full-suite time even when no executable code changed.

This blueprint drafts a separate, small CI classifier that can skip heavy code gates for docs/blueprint-only changes without weakening branch protection.

## Key Decisions

| Decision                     | Choice                                                                   | Rationale                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Required check names         | Preserve existing required jobs/check names                              | Branch protection should not need churn or risk accidental bypass.                             |
| Classifier shape             | One early changed-files classifier job                                   | Keep path logic centralized and testable instead of copying glob conditions across jobs.       |
| Docs/blueprint-only behavior | Run markdown/blueprint/audit gates; mark code gates as successful no-ops | PRs remain mergeable only when the relevant checks pass, but do not run irrelevant full tests. |
| Default safety               | Unknown or mixed changes run full CI                                     | Conservative fallback prevents false skips.                                                    |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable | Effort |
| ----------------- | --------- | ------------ | -------------- | ------ |
| **Wave 0**        | 1.1       | None         | 1 agent        | S      |
| **Wave 1**        | 2.1, 2.2  | 1.1          | 2 agents       | S-M    |
| **Critical path** | 1.1 → 2.1 | —            | 2 waves        | M      |

## Scope

### In scope

- Add a repeatable changed-files classifier for GitHub Actions.
- Define code-impact vs docs/blueprint-only path classes.
- Skip or no-op heavyweight test/build jobs only for docs/blueprint-only PRs.
- Preserve required check names and status semantics.
- Add regression coverage for path classification.

### Out of scope

- Replacing local hooks.
- Weakening `blueprint-gate`, `blueprint-readme-drift`, or PR coverage requirements.
- Skipping full CI for mixed changes.
- Adding third-party CI services or heavy dependencies.

## Tasks

#### [ci] Task 1.1: Define and test the changed-files classifier

**Status:** todo

**Depends:** None

Create a small classifier that maps branch diffs to one of at least three classes: `code`, `docs_blueprints_only`, and `unknown`. It must treat unknown files conservatively as `code` unless explicitly classified safe.

**Files:**

- Create or modify: `scripts/ci/*` path classifier helper
- Create: classifier test file near the helper

**Steps (TDD):**

1. Write failing tests for docs-only, blueprint-only, mixed code+docs, workflow changes, package/config changes, and unknown paths.
2. Implement the smallest classifier needed to pass.
3. Verify tests pass through the repo wrapper.

**Acceptance:**

- [ ] Blueprint-only and docs-only diffs classify as `docs_blueprints_only`.
- [ ] Source, package, workflow, lockfile, config, generated-surface, and unknown diffs classify as `code`.
- [ ] Mixed diffs classify as `code`.
- [ ] Tests use exact expected classifications, not truthy assertions.

#### [ci] Task 2.1: Wire CI jobs without breaking required checks

**Status:** todo

**Depends:** Task 1.1

Update GitHub Actions so existing required check names still report success, but heavyweight test/build work is skipped for `docs_blueprints_only` diffs. The no-op path must still print why it skipped and which classifier output caused the skip.

**Files:**

- Modify: `.github/workflows/ci.agent-kit.yml`
- Possibly modify: `.github/workflows/ci.yml`

**Steps (TDD):**

1. Add workflow-level or job-level classifier output plumbing.
2. Gate heavyweight steps, not the required job names, unless branch protection is updated in the same change.
3. Keep blueprint and docs validation active for docs/blueprint-only PRs.
4. Run local workflow/static checks available in the repo.

**Acceptance:**

- [ ] Required check names remain stable.
- [ ] Docs/blueprint-only PRs do not run `pnpm run test`.
- [ ] Mixed/code PRs still run full current CI.
- [ ] Skip logs include the classifier result and changed path summary.

#### [qa] Task 2.2: Add fixture coverage for CI path decisions

**Status:** todo

**Depends:** Task 1.1

Add fixtures or table-driven tests covering representative PR file sets so future workflow edits do not silently reintroduce full-suite runs for blueprint-only PRs or accidentally skip tests for code changes.

**Files:**

- Modify: classifier test file
- Optionally create: `test-fixtures/ci-paths/*`

**Steps (TDD):**

1. Add representative path-set fixtures.
2. Assert exact classifier outputs for every fixture.
3. Include at least one conservative fallback case.

**Acceptance:**

- [ ] Blueprint-only planning PR fixture classifies as `docs_blueprints_only`.
- [ ] Workflow/package/config fixture classifies as `code`.
- [ ] Unknown path fixture classifies as `code`.

## Verification Gates

| Gate                   | Command                                               | Success Criteria                                                                       |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Blueprint lifecycle    | `vp run blueprints:check`                             | Passes                                                                                 |
| Blueprint README drift | `./bin/wp audit blueprint-readme-drift`               | Passes                                                                                 |
| Classifier tests       | repo wrapper for the new test file                    | Passes                                                                                 |
| CI static check        | repo workflow/static validation surface, if available | Passes                                                                                 |
| GitHub smoke           | draft PR with docs/blueprint-only diff                | Heavy test job reports success without `pnpm run test`; blueprint/docs gates still run |

## Edge Cases and Error Handling

| Edge Case                                               | Risk                             | Solution                                                               | Task |
| ------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- | ---- |
| Branch protection requires the old `Test` job           | Skipping the job can block merge | Keep the job name and return a successful no-op for safe path classes. | 2.1  |
| Workflow file changes classify as docs-only by accident | CI can be bypassed               | Classify workflow/config/package/lockfile changes as `code`.           | 1.1  |
| New source directory appears and is not in glob list    | False skip                       | Unknown paths default to `code`.                                       | 1.1  |
| Blueprint README is stale                               | Docs-only PR still fails late    | Keep `blueprint-readme-drift` and blueprint gates active.              | 2.1  |

## Non-goals

- Do not implement path gating in this blueprint PR.
- Do not add broad dependencies for changed-file detection if a small script is enough.
- Do not alter branch protection without an explicit migration plan.
