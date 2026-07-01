---
type: blueprint
status: draft
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "100% (1/1 tasks done; urgent governance fix implemented)"
depends_on: []
cross_repo_depends_on: []
tags:
  - governance
  - blueprint
  - review
  - ci
approvals: []
---

# Require provenance-backed outside-model approvals for blueprint promotion

## Summary

Future-proof the blueprint promotion approval gate so a self-authored `reviews.md` summary cannot satisfy the outside-voice requirement by itself. PR #345 merged with no GitHub PR reviews because the current machine gate only verifies matching frontmatter `approvals:` and structured `wp:review-entry` ledger comments. The fix belongs at the blueprint lifecycle approval gate.

## Broken Invariant

Promotion past draft must require two distinct approvals that are backed by committed review evidence with provenance strong enough to distinguish an independent outside-model review artifact from a hand-written summary.

## Scope

- Strengthen the approval evidence parser/gate in `src/blueprint/lifecycle/audit.ts`.
- Add regression tests in `src/blueprint/lifecycle/audit.approval-gate.test.ts`.
- Keep existing valid structured approval records working when they include provenance metadata.
- Do not require GitHub PR review state in this local lifecycle gate; GitHub branch protection remains a separate policy surface.

## Non-goals

- Do not retroactively rewrite PR #345.
- Do not add network calls or GitHub API dependencies to local blueprint audit.
- Do not change the number of required approvals; keep ≥2 distinct approving reviewers.

## Tasks

#### [governance] Task 1.1: Require review-entry provenance for approval counting

**Status:** done

**Depends:** None

Add regression coverage showing that bare `wp:review-entry` records without provenance no longer count as approval evidence, then update the lifecycle gate to count only records that include a committed evidence artifact reference.

**Files:**

- Modify: `src/blueprint/lifecycle/audit.ts`
- Modify: `src/blueprint/lifecycle/audit.approval-gate.test.ts`

**Steps (TDD):**

1. Add failing tests for bare self-authored ledger records and provenance-backed ledger records.
2. Run `./bin/wp test --file src/blueprint/lifecycle/audit.approval-gate.test.ts` and verify the bare-ledger regression fails before the fix.
3. Implement the minimal parser/gate change at the approval-counting owner.
4. Run the targeted test again and verify PASS.
5. Run scoped typecheck/lint and blueprint audit.

**Acceptance:**

- [x] Bare `{reviewer, rev, verdict, commit}` review-entry comments no longer satisfy the approval gate.
- [x] Two distinct approval entries with matching committed provenance artifacts satisfy the gate.
- [x] Failure messaging tells operators to record provenance-backed outside-model evidence.
- [x] Targeted tests, typecheck, lint, and blueprint audit pass.

**Verification:**

```webpresso-evidence-v1
[
  {"command":"./bin/wp test --file src/cli/commands/blueprint/mutations.test.ts --file src/cli/commands/review.test.ts --file src/blueprint/lifecycle/audit.approval-gate.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-07-01T00:00:00.000Z"},
  {"command":"./bin/wp typecheck","exit_code":0,"kind":"typecheck","result":"pass","ts":"2026-07-01T00:00:00.000Z"},
  {"command":"./bin/wp lint","exit_code":0,"kind":"lint","result":"pass","ts":"2026-07-01T00:00:00.000Z"},
  {"command":"./bin/wp blueprint audit --all --strict","exit_code":0,"kind":"audit","result":"pass","ts":"2026-07-01T00:00:00.000Z"}
]
```

## Verification Gates

| Gate                | Command                                                                    | Success Criteria         |
| ------------------- | -------------------------------------------------------------------------- | ------------------------ |
| Targeted regression | `./bin/wp test --file src/blueprint/lifecycle/audit.approval-gate.test.ts` | Approval-gate tests pass |
| Type safety         | `./bin/wp typecheck`                                                       | Zero errors              |
| Lint                | `./bin/wp lint`                                                            | Zero violations          |
| Blueprint audit     | `./bin/wp blueprint audit --all --strict`                                  | Zero lifecycle errors    |

## Trust Dossier

Draft implementation blueprint created for an urgent governance hardening fix. This blueprint is intentionally not promoted in this PR because the defect being repaired is the promotion approval gate itself.
