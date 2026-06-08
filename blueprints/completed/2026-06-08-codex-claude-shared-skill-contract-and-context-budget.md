---
type: blueprint
title: "Codex/Claude shared skill contract and context budget"
owner: agent-kit
status: completed
complexity: M
created: '2026-06-08'
last_updated: '2026-06-08'
progress: '100% (6/6 tasks complete; shared-favorites contract, opt-in projection, AGENTS budget guard, consumer smoke, and regression coverage verified on 2026-06-08)'
depends_on:
  - blueprints/completed/2026-06-08-hooks-orchestrator-contract-series.md
cross_repo_depends_on: []
tags:
  - setup
  - codex
  - claude
  - skills
  - prompt-budget
---

# Codex/Claude shared skill contract and context budget

**Goal:** Preserve same-core Webpresso skills across Codex and Claude while cutting prompt bloat by narrowing default projection to curated shared favorites, keeping OMX/gstack global-first, and enforcing a small root `AGENTS.md`.

## Planning Summary

- Goal input: `Keep cross-host skill continuity, cut only the real bloat.`
- Shared default contract: `fix`, `verify`, `testing-philosophy`, `plan-refine`, `pll`
- Global prerequisites: OMX and gstack stay user-scope/global-first
- Default exclusions to validate: `systematic-debugging`, `test-driven-development`, `deep-research`, `monorepo-navigation`
- This run closed the remaining gap between source truth and packed-consumer verification by rebuilding the package surface before re-running the public consumer smoke.

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Shared default set | Tier-1 favorites only | These are the highest-value cross-host skills and match the intended “same everywhere” baseline. |
| Tier-2 handling | Opt-in add-ons | Cuts host-visible skill noise without deleting useful skills. |
| Monorepo navigation | Scaffold source, opt-in projection | Keeps repo-owned continuity while removing a known large default prompt surface. |
| OMX/gstack | Global-first | Already the correct ownership boundary; do not project them repo-wide to solve context issues. |
| Root AGENTS budget | ≤ 8 KB generated default | Forces durable contract language only; longer guidance moves to docs. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| ---- | ----- | ------------ | -------------- |
| **Wave 0** | 1.1, 1.2 | None | 1 agent |
| **Wave 1** | 2.1, 2.2 | 1.1 | 1 agent |
| **Wave 2** | 3.1, 3.2 | 2.1, 2.2 | 1 agent |

### Phase 1: Define the shared skill contract [Complexity: S]

#### [agent-kit] Task 1.1: Lock the shared favorites set used by host-visible default projection

**Status:** done

**Depends:** None

Change setup/sync defaults so Codex and Claude always see the same shared favorite Webpresso skills by default: `fix`, `verify`, `testing-philosophy`, `plan-refine`, and `pll`. Do not remove the catalog skills themselves; only narrow the default host-visible projection set.

**Files:**

- Modify: `src/cli/commands/init/scaffold-agent.ts`
- Modify: `src/cli/commands/init/index.ts`
- Modify: `src/cli/commands/init/host-visibility.ts`

**Acceptance:**

- [x] Shared favorites are the only guaranteed default Webpresso host-visible skills.
- [x] Host-visibility checks gate the shared favorites, not the old narrower pair.
- [x] OMX/gstack behavior is unchanged.

#### [agent-kit] Task 1.2: Move Tier-2 and rendered navigation skill projection behind explicit opt-in

**Status:** done

**Depends:** None

Keep the source skills available, but stop projecting `systematic-debugging`, `test-driven-development`, `deep-research`, and `monorepo-navigation` into default Codex/Claude surfaces. Support explicit opt-in through setup selection flows.

**Files:**

- Modify: `src/cli/commands/init/prompts.ts`
- Modify: `src/cli/commands/init/init.integration.test.ts`
- Modify: `src/cli/commands/init/prompts.test.ts`

**Acceptance:**

- [x] Default setup omits Tier-2 and `monorepo-navigation` from generated host-visible skill roots.
- [x] Explicit opt-in still projects them.
- [x] Existing Tier-3/base-kit behavior remains compatible.

### Phase 2: Reduce prompt bloat without breaking parity [Complexity: S]

#### [docs] Task 2.1: Shrink the generated root AGENTS contract and add a hard budget

**Status:** done

**Depends:** Task 1.1

Trim the generated template to durable command contracts and safety/ownership rules. Keep required setup/install language and add a hard generated-default budget of ≤ 8 KB.

**Files:**

- Modify: `catalog/AGENTS.md.tpl`
- Modify: `AGENTS.md`
- Modify: `src/cli/commands/init/scaffold-agents-md.ts`
- Modify: `src/cli/commands/init/scaffold-agents-md.test.ts`

**Acceptance:**

- [x] Generated default `AGENTS.md` is under the locked byte budget.
- [x] Repo-specific user-owned blocks remain preserved.
- [x] Required install/setup wording still matches the current product contract.

#### [qa] Task 2.2: Add shared-favorites and prompt-budget smoke coverage

**Status:** done

**Depends:** Task 1.2

Extend the public consumer smoke to assert the default shared favorites are present, non-favorite catalog skills are absent by default, and the generated root `AGENTS.md` stays under budget.

**Files:**

- Modify: `scripts/public-consumer-smoke.ts`

**Acceptance:**

- [x] Smoke proves both Codex and Claude default roots contain the shared favorites.
- [x] Smoke proves Tier-2 and `monorepo-navigation` are absent by default.
- [x] Smoke fails if the generated default `AGENTS.md` exceeds budget.

### Phase 3: Verify the cross-host continuity contract [Complexity: S]

#### [qa] Task 3.1: Add targeted host-visibility and consumer-contract regression checks

**Status:** done

**Depends:** Task 2.1

Refresh targeted tests so the host-visibility contract and unified consumer expectations match the new shared-favorites baseline.

**Files:**

- Modify: `src/cli/commands/init/host-visibility.test.ts`
- Modify: `src/cli/commands/init/config.test.ts`

**Acceptance:**

- [x] Host-visibility tests assert the new shared favorite set.
- [x] Config/default tests stay aligned with the same required capabilities.

#### [qa] Task 3.2: Re-run blueprint/readme drift and targeted setup verification

**Status:** done

**Depends:** Task 2.2

Keep the blueprint surface and generated repo surfaces in sync after the new planned blueprint and setup contract changes land.

**Acceptance:**

- [x] Blueprint lifecycle/readme state reflects the new planned blueprint.
- [x] Setup-focused tests and smoke pass with the narrowed default projection.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Unit/integration tests | `wp test` on touched init/symlink/smoke tests | All targeted tests pass |
| Type safety | `wp typecheck` | Zero errors |
| Lint | `wp lint` on touched files | Zero violations |
| Blueprint drift | `wp audit blueprint-readme-drift` | No drift |
| Consumer smoke | `bun scripts/public-consumer-smoke.ts --setup-only --skip-build` | Shared favorites present, non-favorites absent, AGENTS budget green |

## Fresh verification evidence

- `node bin/wp test --file src/cli/commands/init/host-visibility.test.ts --file src/cli/commands/init/prompts.test.ts --file src/cli/commands/init/config.test.ts --file src/cli/commands/init/scaffold-agents-md.test.ts --file src/cli/commands/init/init.integration.test.ts` ✅
- `node bin/wp lint src/cli/commands/init/host-visibility.ts src/cli/commands/init/host-visibility.test.ts src/cli/commands/init/prompts.ts src/cli/commands/init/prompts.test.ts src/cli/commands/init/config.ts src/cli/commands/init/config.test.ts src/cli/commands/init/scaffold-agents-md.ts src/cli/commands/init/scaffold-agents-md.test.ts scripts/public-consumer-smoke.ts` ✅
- `node bin/wp typecheck` ✅
- `vp run build` ✅
- `bun scripts/public-consumer-smoke.ts --setup-only --skip-build` ✅
- `node bin/wp audit blueprint-readme-drift` ✅
- `node bin/wp audit blueprint-lifecycle` ✅

## Non-goals

- Reworking OMX or gstack into repo-local projected prompt surfaces.
- Deleting Tier-2 or rendered skills from the catalog.
- Changing the active hooks orchestrator blueprint boundary.
