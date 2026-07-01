---
type: blueprint
title: Ultragoal origin/main controller safety instructions
owner: agent-kit
status: in-progress
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: 90% (0/1 tasks done, 0 blocked, updated 2026-07-01)
depends_on: []
cross_repo_depends_on: []
tags: [agent-instructions, ultragoal, worktree-discipline]
approvals: []
worktree_owner_id: owner-048e716a65a6
worktree_owner_branch: bp/ultragoal-origin-main-controller-safety-instructions
---

# Ultragoal origin/main controller safety instructions

**Goal:** Make the repo-owned agent instructions prevent future Ultragoal runs from starting in a stale primary checkout or from starting blueprints off non-`origin/main` history.

## Planning Summary

- Problem: prior Ultragoal/controller setup can accidentally inherit detached or stale primary checkout history because `wp worktree new` defaults to `HEAD` and `wp blueprint start <slug>` derives the owner branch from the caller worktree's current `HEAD`.
- Desired behavior: future agents must create a dedicated Ultragoal controller worktree from current `origin/main`, run all `wp blueprint start` commands from that controller, and finish with verification, green PR checks, merge, and final Ultragoal checkpoint.
- Scope: instruction surfaces only (`AGENTS.md`, `catalog/AGENTS.md.tpl`, `catalog/agent/rules/pre-implementation.md`).

## Key Decisions

| Decision         | Choice                                 | Rationale                                                                                            |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Controller base  | Always `origin/main`                   | Prevents stale/detached primary checkout history from contaminating downstream worktrees.            |
| Blueprint starts | Run from the controller                | `wp blueprint start` creates owner worktrees from caller `HEAD`; the controller is the trusted base. |
| Completion       | Verify + green PR + merge + checkpoint | Keeps durable Ultragoal state aligned with landed code, not local optimism.                          |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| ---- | ----- | ------------ | -------------- |
| 0    | 1.1   | None         | 1 agent        |

### Phase 1: Instruction hardening [Complexity: S]

#### [docs] Task 1.1: Add origin/main Ultragoal discipline to agent instructions

**Status:** in-progress

**Depends:** None

Update the repo-owned instruction sources so future agents know that Ultragoal orchestration must not run from the primary checkout and must derive both the controller and subsequent blueprint owner worktrees from current `origin/main` history.

**Files:**

- Modify: `AGENTS.md`
- Modify: `catalog/AGENTS.md.tpl`
- Modify: `catalog/agent/rules/pre-implementation.md`

**Steps:**

1. Add concise Ultragoal/controller worktree rules to `AGENTS.md` and its catalog template.
2. Add detailed operational rules to `catalog/agent/rules/pre-implementation.md` near the blueprint/worktree gate.
3. Run instruction verification commands.
4. Mark this task done only after checks pass or any blocker is recorded with evidence.

**Acceptance:**

**Evidence (2026-07-01):**

- `./bin/wp sync --check` → pass (`wp sync --check: in sync.`)
- `./bin/wp audit agents` → pass (`audit agents passed`)
- `./bin/wp format --check` → pass (`format check passed`)

- [x] Instructions say not to run Ultragoal from the primary/main checkout.
- [x] Instructions require a dedicated controller worktree created with `--base origin/main`.
- [x] Instructions require `wp blueprint start <slug>` commands to run from that controller worktree for Ultragoal-managed work.
- [x] Instructions require final `$agent-kit:verify`, green PR checks, merge, and final Ultragoal checkpoint before completion.
- [x] `./bin/wp sync --check` passes.
- [x] `./bin/wp audit agents` passes.
- [x] `./bin/wp format --check` passes.

---

## Verification Gates

| Gate         | Command                   | Success Criteria                         |
| ------------ | ------------------------- | ---------------------------------------- |
| Sync         | `./bin/wp sync --check`   | Generated surfaces are in sync.          |
| Agents audit | `./bin/wp audit agents`   | Agent surfaces pass repo audit.          |
| Format       | `./bin/wp format --check` | Formatting is clean through repo facade. |

## Non-goals

- Implementing any high-value Ultragoal story in this instruction-only PR.
- Changing `wp worktree` or `wp blueprint start` behavior.
