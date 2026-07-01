---
type: blueprint
title: Blueprint PR gate lifecycle consistency
owner: codex
status: completed
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "100% (implemented; CI hardening verification passed)"
depends_on: []
cross_repo_depends_on: []
tags: [ci, governance, blueprints]
---

# Blueprint PR gate lifecycle consistency

**Goal:** Future-proof the PR Blueprint gate so a completed or otherwise terminal-looking blueprint cannot remain under `blueprints/draft/` and still pass required PR checks.

## Problem

PR #339 merged with `blueprints/draft/fix-session-memory-snapshot-bench-gate.md` even though the blueprint text had 100% completion evidence and checked acceptance criteria. The repo already has lifecycle validation for draft/completed folder consistency, but the required PR `Blueprint gate` only ran `wp audit blueprint-pr-coverage`, so lifecycle drift was not part of that required gate.

## Acceptance

- [x] The PR-required `Blueprint gate` runs blueprint lifecycle consistency in addition to coverage.
- [x] A regression test fails if the CI workflow stops invoking the lifecycle audit in the `Blueprint gate` job.
- [x] The merged PR #339 blueprint is moved to `blueprints/completed/` and frontmatter matches its shipped state.
- [x] Targeted CI workflow/dependency freshness tests pass.
- [x] `wp audit blueprint-lifecycle` passes for the repository.

## Tasks

#### [ci] Task 1.1: Enforce lifecycle consistency in the PR Blueprint gate

**Status:** done

Wire the required PR `Blueprint gate` job to run changed blueprint lifecycle validation after blueprint coverage, reuse the existing core plan-state validator from the lifecycle audit, normalize historical lifecycle-drift records, and pin the behavior with targeted regression tests.

**Acceptance:**

- [x] Required PR Blueprint gate invokes `wp audit blueprint-lifecycle --affected --base ...`.
- [x] Lifecycle audit rejects a draft blueprint with checked acceptance criteria.
- [x] Historical completed-looking draft records are moved to `blueprints/completed/`.

## Non-goals

- Reworking the blueprint lifecycle model.
- Changing branch protection settings outside repository-owned CI configuration.

## Verification evidence

Fresh verification on 2026-07-01:

- `./bin/wp test --file scripts/check-dependency-freshness.subprocess.test.ts --file src/build/ci-workflow-version-pr-gate.test.ts --file src/audit/blueprint-lifecycle-sql.test.ts --file src/audit/repo-guardrails.test.ts --full` passed: 4 files, 180 tests.
- `vp run typecheck` passed.
- `./bin/wp lint` passed.
- `./bin/wp format --check` passed.
- `pnpm run deps:freshness` passed.
- `./bin/wp audit docs-frontmatter --full` passed.
- `./bin/wp audit blueprint-lifecycle --affected --base origin/main --full` passed.
- `./bin/wp audit blueprint-lifecycle --full` passed.
- `./bin/wp audit guardrails --full` passed.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T19:31:00Z
- verified-head: 35920d8f94201fbbfeb1f9ff94842bade13a35a2
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                         | Evidence                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| C1  | The required PR Blueprint gate now invokes changed blueprint lifecycle validation after coverage validation.  | repo:.github/workflows/ci.agent-kit.yml                                                                |
| C2  | The lifecycle audit rejects draft blueprints with checked acceptance criteria.                                | repo:src/audit/repo-guardrails.ts; repo:src/audit/repo-guardrails.test.ts                              |
| C3  | CI pins the Blueprint gate lifecycle command so future workflow drift is caught by tests.                     | repo:src/build/ci-workflow-version-pr-gate.test.ts                                                     |
| C4  | Dependency freshness parsing tolerates pnpm warning text around JSON instead of crashing before drift checks. | repo:scripts/check-dependency-freshness.ts; repo:scripts/check-dependency-freshness.subprocess.test.ts |

### Material Decisions

| ID  | Decision                | Chosen option                                                              | Rejected alternatives                                   | Rationale                                                                  |
| --- | ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| D1  | PR lifecycle gate shape | Add lifecycle validation inside the existing required Blueprint gate.      | Add a separate optional/skippable workflow job.         | Required checks only protect invariants that run for the latest PR commit. |
| D2  | Lifecycle owner         | Reuse the existing core plan-state validator in `auditBlueprintLifecycle`. | Duplicate draft/completed checkbox logic in CI scripts. | Keeps one source of truth for folder/frontmatter/checklist consistency.    |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result |
| --------- | ---------------------------- | ---------------- | ----------- |
| Tests     | wp test                      | pass             | pass        |
| Typecheck | wp typecheck                 | pass             | pass        |
| Lint      | wp lint                      | pass             | pass        |
| Lifecycle | wp audit blueprint-lifecycle | pass             | pass        |

### Residual Unknowns

None.
