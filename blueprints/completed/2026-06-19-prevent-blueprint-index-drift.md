---
type: blueprint
title: Prevent stale blueprint index commits and pushes
owner: ozby
status: completed
completed_at: '2026-06-21'
complexity: S
created: '2026-06-19'
last_updated: '2026-06-19'
progress: '100% (completed; 1/1 tasks done, 0 blocked)'
depends_on: []
cross_repo_depends_on: []
tags:
  - hooks
  - blueprints
  - ci
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Prevent stale blueprint index commits and pushes

## Goal

Prevent branches from committing or pushing blueprint changes while `blueprints/README.md` is stale. The existing pre-commit check was conditional on staged paths and the pre-push hook did not run the drift audit, so blueprint-only PRs reached CI with `blueprint-readme-drift` failures.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| **Wave 0** | 1.1 | None | 1 agent | XS |
| **Critical path** | 1.1 | — | 1 wave | XS |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 1 | 1 |
| CPR | total_tasks / critical_path_length | ≥ 1 | 1.0 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0 |
| CP | same-file overlaps per wave | 0 | 0 |

## Findings

| ID | Severity | Claim | Verified Reality | Fix Applied |
| -- | -------- | ----- | ---------------- | ----------- |
| F1 | HIGH | Pre-commit/push prevents stale blueprint indexes. | `pre-commit` checked drift only when staged paths matched `blueprints/`; `pre-push` did not run `blueprint-readme-drift`. | Fx1 — run drift audit unconditionally in pre-commit and pre-push. |
| F2 | MEDIUM | Scaffolded base-kit hook matches repo behavior. | Base-kit template still used the conditional staged-path heuristic. | Fx2 — make scaffolded pre-commit unconditional too. |

## Risks

| Risk | Severity | Mitigation | Fix |
| ---- | -------- | ---------- | --- |
| Hook adds latency to every commit | LOW | `blueprint-readme-drift` is a narrow file/index audit and already runs in CI. | Fx1 |
| Consumers inherit stale conditional behavior | MEDIUM | Update base-kit template and scaffold test. | Fx2 |

## Tasks

#### [hooks] Task 1.1: Harden blueprint README drift hooks

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","audit_kind":"blueprint-readme-drift","command":"./bin/wp audit blueprint-readme-drift","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-21T15:21:53.508Z"},{"agent":"codex","audit_kind":"blueprint-lifecycle","command":"./bin/wp audit blueprint-lifecycle","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-21T15:21:53.508Z"}]
```

**Depends:** None

Run `wp audit blueprint-readme-drift` only when affected blueprint files are present: staged blueprint files in pre-commit, and branch-level blueprint changes in pre-push. Update the base-kit pre-commit template so new consumers inherit the stricter local guard without adding heavyweight push-time audits.

**Files:**

- Modify: `.husky/pre-commit`
- Modify: `.husky/pre-push`
- Modify: `catalog/base-kit/.husky/pre-commit.tmpl`
- Modify: `src/cli/commands/init/scaffold-base-kit.test.ts`

**Steps (TDD):**

1. Update scaffold test to assert the staged blueprint path gate and drift audit are present.
2. Add staged-blueprint-gated drift audit to repo and template pre-commit hooks.
3. Add branch-blueprint-gated drift audit to repo pre-push before tests.
4. Run targeted scaffold test.
5. Run blueprint drift and guardrails audits.
6. Push through the updated lightweight pre-push hook.

**Acceptance:**

- [x] Pre-commit runs blueprint README drift only when staged blueprint files are affected.
- [x] Pre-push runs blueprint README drift before tests only when the branch affects blueprint files.
- [x] Base-kit template uses the same staged-path heuristic as the repo pre-commit hook.
- [x] Targeted scaffold test passes.
- [x] `wp audit blueprint-readme-drift` passes.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-prevent-blueprint-index-drift.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
