---
type: blueprint
title: "Fix release-publish workspace dependency order"
owner: ozby
status: completed
complexity: M
created: "2026-06-28"
last_updated: "2026-07-01"
tags:
  - release
  - publish
  - packages
progress: "100% (implemented release workspace dependency ordering)"
approvals:
  - reviewer: eng-review
    verdict: approve
    commit: 32cd1968b861cd8d26558423740751728b738d25
    evidence: "plan-refine engineering review: repo paths and tests verified on 2026-07-01"
  - reviewer: codex
    verdict: approve
    commit: 32cd1968b861cd8d26558423740751728b738d25
    evidence: "independent Codex verification: focused test gate passed on 2026-07-01"
---

# Summary

`scripts/release-publish.ts` currently discovers public workspace packages alphabetically.
That breaks the first real `@webpresso/agent-core` + `@webpresso/agent-config` publish,
because `agent-config` builds against `agent-core` subpath exports and fails from a clean
checkout until `agent-core` is built first.

# Broken invariant

Release publishing must build/publish local workspace dependencies before dependents.
Alphabetical order is invalid once a publishable package depends on another publishable
workspace package.

# Fix

- derive local `workspace:*` dependencies from each publishable package manifest
- topologically order publishable workspace packages before publish
- fail closed on cycles
- add regression tests for dependency order and cycle detection

# Verification

- targeted tests for the ordering helper and `release-publish` source contract
- clean-checkout reproduction: `agent-config` build fails before `agent-core` build,
  succeeds after `agent-core` build
- release-script dry proof with fake successful `npm publish` logs `agent-core` before
  `agent-config`

## Tasks

#### [backend] Task 1.1: Implement workspace dependency ordering

**Status:** done

**Depends:** None

Add topological workspace package ordering, fail closed on cycles, and wire release-publish to use it.

**Files:**

- Modify: `src/build/workspace-release-order.ts; scripts/release-publish.ts; src/build/workspace-release-order.test.ts`

**Steps (TDD):**

1. Add/verify regression coverage for the release-publish behavior.
2. Implement the minimal source change.
3. Run the focused release-publish verification gate.

**Acceptance:**

- [x] Regression coverage passes.
- [x] Release-publish source contract is type-clean for this scope.
- [x] Focused tests pass in the managed worktree.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T12:52:00Z
- verified-head: 32cd1968b861cd8d26558423740751728b738d25
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                          | Evidence                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Release publishing now computes and uses workspace dependency order before publish execution.  | repo:src/build/workspace-release-order.ts; repo:src/build/workspace-release-order.test.ts; repo:scripts/release-publish.ts; repo:scripts/release-publish.test.ts |
| C2  | Focused regression coverage for this blueprint is present and was run in the managed worktree. | repo:src/build/workspace-release-order.test.ts; repo:scripts/release-publish.test.ts; derived:C1                                                                 |
| C3  | Two review approvals are recorded for the lifecycle disposition.                               | repo:blueprints/completed/2026-06-28-release-publish-workspace-order/reviews.md; derived:C1; derived:C2                                                          |

### Material Decisions

| ID  | Decision              | Chosen option                                       | Rejected alternatives                           | Rationale                                                                                                                                                  |
| --- | --------------------- | --------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Lifecycle disposition | Mark completed from existing implemented repo state | Force a process-only planned/in-progress detour | Repo transition matrix permits draft-to-completed when tasks are terminal; focused tests and lifecycle audits prove the implementation is already present. |

### Promotion Gates

| Gate            | Command                                                                                         | Expected outcome            | Last result        |
| --------------- | ----------------------------------------------------------------------------------------------- | --------------------------- | ------------------ |
| focused-tests   | wp test --file src/build/workspace-release-order.test.ts --file scripts/release-publish.test.ts | All targeted tests pass     | PASS on 2026-07-01 |
| lifecycle-audit | wp audit blueprint-lifecycle                                                                    | Lifecycle metadata is valid | PASS on 2026-07-01 |
| trust-audit     | wp audit blueprint-trust                                                                        | Trust dossier validates     | PASS on 2026-07-01 |

### Residual Unknowns

None.

## Completion Summary

- Completed on: `2026-07-01`
- Implementation head: `32cd1968b861cd8d26558423740751728b738d25`
- Summary: implemented release workspace dependency ordering.
- Verification: `wp test --file src/build/workspace-release-order.test.ts --file scripts/release-publish.test.ts` passed in the managed worktree after `vp install`.
- Review approvals: see `reviews.md` (eng-review + codex approvals).
- Remaining risks: None for the implemented scope; any explicitly scheduled/non-required follow-ups remain outside this blueprint completion gate.
