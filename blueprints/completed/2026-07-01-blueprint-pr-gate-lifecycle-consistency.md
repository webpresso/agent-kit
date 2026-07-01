---
type: blueprint
title: Blueprint PR gate lifecycle consistency
owner: codex
status: completed
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "100% (implemented; targeted verification passed)"
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
- [x] Targeted CI workflow tests pass.
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

- `./bin/wp test --file src/build/ci-workflow-version-pr-gate.test.ts --file src/audit/blueprint-lifecycle-sql.test.ts --file src/audit/repo-guardrails.test.ts --full` passed: 3 files, 173 tests.
- `vp run typecheck` passed.
- `./bin/wp lint` passed.
- `./bin/wp format --check` passed.
- `./bin/wp audit blueprint-lifecycle --affected --base origin/main --full` passed.
- `./bin/wp audit blueprint-lifecycle --full` passed.
