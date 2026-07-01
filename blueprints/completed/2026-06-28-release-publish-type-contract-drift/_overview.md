---
type: blueprint
title: "Fix release-publish transient package type-contract drift"
owner: ozby
status: completed
complexity: S
created: "2026-06-28"
last_updated: "2026-07-01"
tags:
  - release
  - typecheck
  - publish
progress: "100% (implemented transient package type-contract cleanup)"
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

Follow-up to the merged release-order repair. The final independent code-review lane found that `PublishablePackage` gained `workspaceDependencies`, but transient prepared/runtime package literals in `scripts/release-publish.ts` still omit that required field. Runtime behavior is already correct; this is a type-contract cleanliness fix so the final ultragoal gate can close on APPROVE/CLEAR instead of COMMENT/CLEAR.

# Fix

- add `workspaceDependencies: []` to transient prepared/runtime package literals that are not discovered from manifests
- keep release behavior unchanged

# Verification

- targeted `tsc --noEmit`
- targeted release-publish tests
- blueprint lifecycle / PR coverage audits

## Tasks

#### [backend] Task 1.1: Repair release-publish transient type contract

**Status:** done

**Depends:** None

Add explicit empty workspaceDependencies on transient prepared/runtime package literals without changing publish behavior.

**Files:**

- Modify: `scripts/release-publish.ts; scripts/release-publish.test.ts`

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

| ID  | Claim                                                                                                                     | Evidence                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| C1  | Release publish preparation now normalizes transient package metadata without drifting the durable package type contract. | repo:scripts/release-publish.ts; repo:scripts/release-publish.test.ts                                       |
| C2  | Focused regression coverage for this blueprint is present and was run in the managed worktree.                            | repo:scripts/release-publish.test.ts; derived:C1                                                            |
| C3  | Two review approvals are recorded for the lifecycle disposition.                                                          | repo:blueprints/completed/2026-06-28-release-publish-type-contract-drift/reviews.md; derived:C1; derived:C2 |

### Material Decisions

| ID  | Decision              | Chosen option                                       | Rejected alternatives                           | Rationale                                                                                                                                                  |
| --- | --------------------- | --------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Lifecycle disposition | Mark completed from existing implemented repo state | Force a process-only planned/in-progress detour | Repo transition matrix permits draft-to-completed when tasks are terminal; focused tests and lifecycle audits prove the implementation is already present. |

### Promotion Gates

| Gate            | Command                                        | Expected outcome            | Last result        |
| --------------- | ---------------------------------------------- | --------------------------- | ------------------ |
| focused-tests   | wp test --file scripts/release-publish.test.ts | All targeted tests pass     | PASS on 2026-07-01 |
| lifecycle-audit | wp audit blueprint-lifecycle                   | Lifecycle metadata is valid | PASS on 2026-07-01 |
| trust-audit     | wp audit blueprint-trust                       | Trust dossier validates     | PASS on 2026-07-01 |

### Residual Unknowns

None.

## Completion Summary

- Completed on: `2026-07-01`
- Implementation head: `32cd1968b861cd8d26558423740751728b738d25`
- Summary: implemented transient package type-contract cleanup.
- Verification: `wp test --file scripts/release-publish.test.ts` passed in the managed worktree after `vp install`.
- Review approvals: see `reviews.md` (eng-review + codex approvals).
- Remaining risks: None for the implemented scope; any explicitly scheduled/non-required follow-ups remain outside this blueprint completion gate.
