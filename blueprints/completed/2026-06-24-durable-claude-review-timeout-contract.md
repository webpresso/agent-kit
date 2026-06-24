---
type: blueprint
title: Durable Claude outside-review timeout contract
owner: ozby
status: completed
complexity: S
created: '2026-06-24'
last_updated: '2026-06-24'
progress: '100% (implemented, regenerated, installed locally, and verified)'
depends_on:
  - blueprints/completed/2026-06-21-cross-host-outside-voice-skills.md
cross_repo_depends_on: []
tags:
  - claude
  - skills
  - plugin
  - timeout
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Durable Claude outside-review timeout contract

## Goal

Keep the durable Claude outside-voice skill usable in Codex by replacing the current broad one-shot review guidance with a bounded `claude --print` workflow, a loud timeout sentinel, and a retry-once fallback that stops instead of hanging indefinitely.

## Scope

### In scope

- Update `packages/workflow-skills/skills/claude.md` as the source of truth for Claude review mode.
- Regenerate `catalog/agent/skills/claude/SKILL.md` and `skills/claude/SKILL.md` from source.
- Strengthen text-contract tests so the bounded review instructions cannot silently regress.
- Refresh the local Codex plugin install from the durable source repo after verification.

### Out of scope

- Editing plugin cache copies by hand.
- Publishing a release or npm package as part of this pass.
- Adding live Claude network/auth CI coverage.

## Tasks

#### [skill] Task 1.1: Replace unbounded Claude review guidance
- [x] **Status:** done
- **Files:** `packages/workflow-skills/skills/claude.md`
- **Acceptance:** Review mode documents bounded payload construction, `claude --print`, a stable timeout sentinel, split-and-retry-once fallback, and explicitly avoids `--bare`.

#### [tests] Task 1.2: Lock the new review contract in text tests
- [x] **Status:** done
- **Files:** `packages/workflow-skills/src/skill-text.test.ts`, `packages/workflow-skills/src/claude-auth.test.ts`, `scripts/stage-workflow-skills.test.ts`
- **Acceptance:** Tests assert the new review markers and prevent regressions to raw `claude -p` or `--bare`.

#### [projection] Task 1.3: Regenerate staged and packaged skill surfaces
- [x] **Status:** done
- **Files:** `catalog/agent/skills/claude/SKILL.md`, `skills/claude/SKILL.md`
- **Acceptance:** Generated surfaces are byte-identical to the updated source skill.

#### [rollout] Task 1.4: Refresh the local Codex plugin install
- [x] **Status:** done
- **Files:** local user/plugin install only
- **Acceptance:** The refreshed local Codex-installed skill bundle resolves from the updated durable source repo.

## Verification plan

- `vp run stage:workflow-skills`
- `vp run generate-skills`
- `wp test --file packages/workflow-skills/src/skill-text.test.ts --file packages/workflow-skills/src/claude-auth.test.ts --file scripts/stage-workflow-skills.test.ts`
- `cmp` or equivalent byte-identity checks across source, staged, and packaged Claude skill surfaces
- `WP_FORCE_SOURCE=1 ./bin/wp init --host codex --user-only --yes --prune`

## Verification evidence

- `vp run stage:workflow-skills` → passed.
- `vp run generate-skills` → passed.
- Byte-identity checks across `packages/workflow-skills/skills/claude.md`, `catalog/agent/skills/claude/SKILL.md`, and `skills/claude/SKILL.md` → passed before and after the final wrapper correction.
- `wp test --file packages/workflow-skills/src/skill-text.test.ts --file packages/workflow-skills/src/claude-auth.test.ts --file scripts/stage-workflow-skills.test.ts` → passed after tightening the `--bare` regression assertions to allow explicit “do not recommend” guidance.
- wp typecheck → passed.
- `wp format --check --file ...` on the touched skill/test/blueprint files → passed.
- wp audit blueprint-lifecycle → passed.
- wp audit catalog-drift → passed.
- `WP_FORCE_SOURCE=1 ./bin/wp init --host codex --user-only --yes --prune --source-maintenance` → refreshed the local Codex plugin staging/install path; installed `~/.codex/plugins/cache/webpresso/agent-kit/2.3.3/skills/claude/SKILL.md` now matches the updated source byte-for-byte.

## Residual note

- The timeout sentinel path was verified locally.
- A tiny live `claude --print` smoke prompt still timed out in this environment even from a neutral temp directory, which indicates an external Claude CLI/runtime issue rather than a skill-text regression. The durable skill now fails loudly with `CLAUDE_REVIEW_TIMEOUT` instead of hanging indefinitely.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-24T17:00:00.000Z
- verified-head: c4f0fe99bb21d3458e1f512b81e47b20d3e7f19b
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | Claude review guidance is bounded and timeout-sentinel based. | repo:packages/workflow-skills/skills/claude.md; repo:packages/workflow-skills/src/claude-auth.test.ts; repo:packages/workflow-skills/src/skill-text.test.ts |
| C2 | Hooks doctor no longer hangs forever when hook-bin probes hang. | repo:src/hooks/doctor.ts; repo:src/hooks/doctor.test.ts |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Bound hook-bin diagnostic probes. | Add a small probe timeout and process-tree termination in the shared probe helpers. | Raise outer CI/doctor timeouts or patch individual hooks. | Fixes the owner once and preserves loud failure diagnostics. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| tests | wp test | pass | pass |
| typecheck | wp typecheck | pass | pass |
| lifecycle | wp audit blueprint-lifecycle | pass | pass |
| catalog | wp audit catalog-drift | pass | pass |
| trust | wp audit blueprint-trust | pass | pass after Trust Dossier backfill |

### Residual Unknowns

None.
