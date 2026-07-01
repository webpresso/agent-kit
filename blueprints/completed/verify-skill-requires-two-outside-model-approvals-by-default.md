---
type: blueprint
title: "Verify skill requires two outside model approvals by default"
owner: "agent-kit"
status: completed
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "100% (implementation and verification complete, updated 2026-07-01)"
depends_on: []
cross_repo_depends_on: []
tags: []
approvals: []
worktree_owner_id: owner-6145b55ee67a
worktree_owner_branch: bp/verify-skill-requires-two-outside-model-approvals-by-default
---

# Verify skill requires two outside model approvals by default

## Summary

Update the repo-owned Verify skill so `/verify` requires outside-voice model approval by default before claiming merge readiness. The default is two extra model approvals unless the user explicitly asks for more, fewer, or a specific reviewer mix.

## Tasks

#### [docs] Task 1.1: Document default outside-voice approval policy in Verify skill

**Status:** done

**Depends:** None

Modify `catalog/agent/skills/verify/SKILL.md` so Verify requires two additional model approvals by default and requires recording each outside approval as a PR comment with the approving model/tool name and verdict. The policy must specify provider preference by host:

- In Codex: prefer Claude plus one OpenCode reviewer.
- In Claude: prefer Codex plus one OpenCode reviewer.
- Without Codex/Claude access: use two OpenCode reviewers if OpenCode is logged in.
- If the user explicitly requests more, fewer, or specific reviewers, follow the explicit instruction.
- If outside reviewers are unavailable, Verify must report the exact approval gap instead of claiming merge-ready.

**Files:**

- Modify: `catalog/agent/skills/verify/SKILL.md`
- Modify: `catalog/agent/commands/verify.md`
- Modify: `docs/skills-catalog.md`
- Regenerate: `skills/verify/SKILL.md`
- Modify source: `packages/workflow-skills/skills/codex.md`
- Regenerate: `catalog/agent/skills/codex/SKILL.md` and `skills/codex/SKILL.md`

**Acceptance:**

- [x] Verify skill names the default count: two extra model approvals.
- [x] Verify skill documents host-specific reviewer preferences.
- [x] Verify skill requires PR comments for outside approvals.
- [x] PR comment requirement includes approving model/tool name and verdict.
- [x] Verify skill says unavailable reviewers are a merge-readiness gap, not a soft success.
- [x] Codex outside-voice command matches installed `codex exec` help.

#### [qa] Task 1.2: Verify projected skill and repo gates

**Status:** done

**Depends:** Task 1.1

Run repo-owned checks for changed agent skill surfaces and update this blueprint with verification evidence.

**Files:**

- Modify: `blueprints/in-progress/verify-skill-requires-two-outside-model-approvals-by-default.md`

**Acceptance:**

- [x] `wp format --check --affected --branch` passes.
- [x] `wp audit agents` passes.
- [x] `wp sync --check` passes.
- [x] `wp audit blueprint-lifecycle` passes.

## Verification Gates

| Gate            | Command                                 | Success Criteria                                                            |
| --------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Format          | `wp format --check --affected --branch` | Changed markdown is formatted                                               |
| Agent audit     | `wp audit agents`                       | Agent surfaces remain valid                                                 |
| Sync check      | `wp sync --check`                       | Projected skill surfaces are in sync, if catalog change requires projection |
| Blueprint audit | `wp audit blueprint-lifecycle`          | Blueprint remains valid                                                     |

## Non-goals

- Implementing automation for invoking external CLIs.
- Changing provider-specific outside-voice skills beyond fixing stale command flags discovered while validating this policy.
- Requiring human GitHub approvals; this policy concerns model outside-voice approvals unless the user asks for human approvals.

## Verification evidence

Fresh verification on 2026-07-01:

- `codex exec --help` shows `--sandbox` and `--cd` but no `--ask-for-approval`; the Codex outside-voice skill command was updated accordingly.
- `claude --help` and `claude auth --help` confirm `claude --print` and `claude auth status` remain valid for the Claude outside-voice skill.
- `opencode run --help`, `opencode providers list`, and `opencode models opencode-go` confirm OpenCode Go is available and exposes reviewer families including DeepSeek, GLM, Kimi, MiMo, MiniMax, and Qwen.
- `vp run build` refreshed generated skill/docs/package assets, including `skills/verify/SKILL.md` and `skills/codex/SKILL.md`.
- `wp sync --check` passed after `wp sync` refreshed managed `AGENTS.md` blocks.
- `wp format --check --affected --branch` passed.
- `vp run docs:check` passed.
- `wp audit agents` passed.
- `wp audit tph` passed.
- `wp audit absolute-path-policy --root .` passed.
- `wp audit no-dev-vars` passed.
- `wp audit blueprint-lifecycle --affected --branch` passed after moving the worktree to a non-`blueprints` path to avoid path-segment misclassification.
