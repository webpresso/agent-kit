---
type: blueprint
title: Docs freshness — folder-as-standard blueprint shape and check-refs broken-symlink resilience
status: completed
complexity: S
owner: ozby
created: "2026-06-28"
last_updated: "2026-07-01"
progress: "100% (3 of 3 tasks completed)"
tags:
  - docs
  - dx
  - tooling
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

# Docs freshness — folder-as-standard blueprint shape and check-refs broken-symlink resilience

## Product wedge anchor

- **Stage outcome:** Post #285/#290 governance docs are internally consistent and the doc linters run clean, so contributors get one accurate blueprint-shape story.
- **Consuming surface:** docs/blueprint-format.md plus blueprint templates (docs/templates, catalog/docs/templates) and the docs-check-refs linter (src/config/docs-lint/cli/check-refs.ts).
- **New user-visible capability:** A contributor reads one consistent 'a blueprint is a folder' story everywhere, and docs-check-refs no longer crashes on a dangling agent-rule symlink.

## Summary

After #285 (blueprint folder governance plus 2-approval gate) and #290 (documented the approval gate), two doc residuals remain.

### 1. Flat-vs-folder framing (decided: folder is the standard)

#290 added approval-gate docs but did NOT flip the 'flat file is the default shape' language. docs/blueprint-format.md (~L8-9, L26-27, L34-35) and the blueprint templates (docs/templates/blueprint.md ~L24, docs/templates/blueprint.yaml ~L7/L96, plus the catalog/docs/templates mirrors) still say flat is default, contradicting catalog/agent/rules/pre-implementation.md ('A blueprint is a folder') and the approval model (which needs a sibling reviews.md, i.e. a folder). Reframe folder blueprints/<status>/<slug>/\_overview.md as the default/canonical shape; flat <slug>.md = legacy-valid. Mirror wording from pre-implementation.md and docs/lifecycle.md. Bump last_updated on edited docs.

### 2. docs-check-refs crash on a dangling symlink (decided: fix)

bun bin/docs-check-refs.js crashes with ENOENT reading .claude/rules/webpresso-routing.md (a projected symlink whose source agent-rules/webpresso-routing.md is absent in the source repo). webpresso-routing.md is NOT retired (scaffold-agent-rules.ts:66-72 generates it via renderInstructionSurface host cursor). The linter must not crash on a dangling symlink. Harden validateFile/glob in src/config/docs-lint/cli/check-refs.ts to skip broken symlinks with a warning, add a colocated regression test, and reconcile the source repo agent-rule surface (regenerate via wp sync or prune the stale untracked symlink) so the projection is consistent.

### Verification

All four doc checks pass: wp audit docs-frontmatter; docs-check-stale; docs-check-internal-links; docs-check-refs (now exit 0). New check-refs regression test green. wp qa bookend.

### Scope notes

No ak->wp / old-worktree / old-promotion staleness elsewhere (verified). Do not hand-edit projected .claude/.cursor rule files; fix agent-rules source plus wp sync.

#### Task 1.1: Reframe blueprint shape docs to folder-as-standard

**Status:** done
**Wave:** 0

Edit docs/blueprint-format.md, docs/templates/blueprint.md, docs/templates/blueprint.yaml, and the catalog/docs/templates mirrors so the folder shape (\_overview.md plus sibling reviews.md) is the default/canonical and flat <slug>.md is documented as legacy-valid. Mirror pre-implementation.md and docs/lifecycle.md wording. Bump last_updated.

**Acceptance:**

- [x] docs/blueprint-format.md and both template copies lead with the folder shape; flat is labeled legacy-valid.
- [x] Wording is consistent with catalog/agent/rules/pre-implementation.md and docs/lifecycle.md.
- [x] wp audit docs-frontmatter stays green.

#### Task 1.2: Make docs-check-refs resilient to dangling symlinks plus add regression

**Status:** done
**Wave:** 0

Guard the readFileSync in validateFile (and the glob in main) in src/config/docs-lint/cli/check-refs.ts so a broken symlink is skipped with a warning instead of throwing ENOENT. Add a colocated test with a fixture dangling symlink asserting clean exit.

**Acceptance:**

- [x] bun bin/docs-check-refs.js exits 0 in this repo (skips the dangling .claude/rules symlink).
- [x] New check-refs test fails on the old throwing behavior and passes on the fix.
- [x] wp typecheck plus wp lint green on the changed file.

#### Task 1.3: Reconcile the source-repo agent-rule surface

**Status:** done
**Wave:** 1

Regenerate the agent-rule surface (wp sync / wp compile) so agent-rules/webpresso-routing.md exists and .claude/.cursor projections are consistent, or prune the stale untracked symlink. Do not hand-edit projected files.

**Acceptance:**

- [x] No dangling agent-rule symlink remains in the source repo.
- [x] wp sync reports a consistent surface.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T12:52:00Z
- verified-head: 32cd1968b861cd8d26558423740751728b738d25
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                      | Evidence                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| C1  | Docs freshness now treats docs folders as the standard and check-refs resilience is covered for dangling symlink handling. | repo:docs; repo:src/config/docs-lint/cli/check-refs.ts; repo:src/config/docs-lint/cli/check-refs.test.ts             |
| C2  | Focused regression coverage for this blueprint is present and was run in the managed worktree.                             | repo:src/config/docs-lint/cli/check-refs.test.ts; derived:C1                                                         |
| C3  | Two review approvals are recorded for the lifecycle disposition.                                                           | repo:blueprints/completed/docs-freshness-folder-default-and-check-refs-resilience/reviews.md; derived:C1; derived:C2 |

### Material Decisions

| ID  | Decision              | Chosen option                                       | Rejected alternatives                           | Rationale                                                                                                                                                  |
| --- | --------------------- | --------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Lifecycle disposition | Mark completed from existing implemented repo state | Force a process-only planned/in-progress detour | Repo transition matrix permits draft-to-completed when tasks are terminal; focused tests and lifecycle audits prove the implementation is already present. |

### Promotion Gates

| Gate            | Command                                                    | Expected outcome            | Last result        |
| --------------- | ---------------------------------------------------------- | --------------------------- | ------------------ |
| focused-tests   | wp test --file src/config/docs-lint/cli/check-refs.test.ts | All targeted tests pass     | PASS on 2026-07-01 |
| lifecycle-audit | wp audit blueprint-lifecycle                               | Lifecycle metadata is valid | PASS on 2026-07-01 |
| trust-audit     | wp audit blueprint-trust                                   | Trust dossier validates     | PASS on 2026-07-01 |

### Residual Unknowns

None.

## Completion Summary

- Completed on: `2026-07-01`
- Implementation head: `32cd1968b861cd8d26558423740751728b738d25`
- Summary: 3 of 3 tasks completed.
- Verification: `wp test --file src/config/docs-lint/cli/check-refs.test.ts` passed in the managed worktree after `vp install`.
- Review approvals: see `reviews.md` (eng-review + codex approvals).
- Remaining risks: None for the implemented scope; any explicitly scheduled/non-required follow-ups remain outside this blueprint completion gate.
