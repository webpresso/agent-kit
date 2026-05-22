---
type: blueprint
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
---

# Codex Fix/PLL Skill Surface and Unified Sync Cleanup

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
- `bun ./src/cli/cli.ts format --check <changed files>` — PASS.

## Notes

- Full `pnpm run format:check` still reports pre-existing unrelated drift in `src/audit/hook-surface*.ts` and `src/symlinker/index.ts`; those files are outside this blueprint's change set and were not reformatted here.
