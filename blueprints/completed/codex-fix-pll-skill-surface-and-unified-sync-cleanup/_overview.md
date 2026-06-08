---
type: blueprint
title: "Codex Fix/PLL Skill Surface and Unified Sync Cleanup"
owner: agent-kit
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
status: completed
complexity: S
created: '2026-05-13'
last_updated: '2026-05-13'
progress: '100% (4/4 tasks done, 0 blocked, updated 2026-05-13)'
depends_on: []
tags:
  - agent-kit
  - codex
  - skills
  - sync
  - cleanup
completed_at: '2026-05-13'
historical_zero_task_waiver: true
historical_zero_task_rationale: Historical completed planning record predates the current task-checklist blueprint schema and remains as a concise migration note.
---

# Codex Fix/PLL Skill Surface and Unified Sync Cleanup
## Product wedge anchor

- **Stage outcome:** the completed Codex Fix/PLL Skill Surface and Unified Sync Cleanup work remains truthfully represented in the blueprint lifecycle and continues to describe the shipped outcome of this lane.
- **Consuming surface:** the repo-local agent-kit surfaces and docs touched by this completed lane.
- **New user-visible capability:** none new in this cleanup pass; the capability shipped already, and this blueprint now stays structurally valid as a completed record.


## Goal

Make `fix`, `verify`, and `pll` available through Codex-compatible skill surfaces and remove the conflicting legacy tail-sync path from `wp setup` / `wp sync` so generated surfaces do not oscillate between old and unified projections.

## Acceptance Criteria

- `fix` exists as a first-class skill in both catalog and package-root plugin skill output.
- `fix` is installed by default with the same Tier-1 skill set as `verify` and `pll`.
- `pll` remains available as both command and skill, with regression coverage for portable skill projection.
- `wp setup` / `wp sync` use unified rule/skill projection for supported host surfaces and do not invoke the old tail `syncAll` path.
- Focused tests, typecheck, lint, and changed-file format checks pass.

## Completed Tasks

1. Added `catalog/agent/skills/fix/SKILL.md` from the existing root-cause fix command workflow and regenerated `skills/fix/SKILL.md` for plugin distribution.
2. Added `fix` to the Tier-1 default skill list next to `verify`, `testing-philosophy`, `plan-refine`, and `pll`.
3. Removed `syncAll` invocation from `wp sync` and `wp setup`; kept setup host visibility tied to generated skill surfaces.
4. Added regression coverage for `fix`, `pll`, portable `.agents/skills` projection, and `--kind rules` preserving existing skill projections.

## Verification Evidence

- `pnpm exec vitest run src/cli/commands/init/init.integration.test.ts src/symlinker/unified-sync.test.ts src/cli/commands/sync.test.ts src/symlinker/consumers.test.ts` — PASS, 4 files / 44 tests.
- `pnpm run typecheck` — PASS.
- `pnpm run lint` — PASS.
- Legacy source-entrypoint format check for changed files — PASS. Prefer
  `wp format --check` for current work.

## Notes

- Full `wp format --check` still reported pre-existing unrelated drift in
  `src/audit/hook-surface*.ts` and `src/symlinker/index.ts`; those files were
  outside this blueprint's change set and were not reformatted there.

## Tasks

#### Task 1.1: Preserve this historical completed fix/pll cleanup record without reopening execution

**Status:** done

**Wave:** 0

**Files:**
- Historical record only

**Acceptance:**
- [x] The completed fix/pll cleanup outcome remains documented without pretending there is unfinished local work in this blueprint.
## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.
