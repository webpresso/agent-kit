---
type: blueprint
status: in-progress
complexity: S
created: '2026-07-01'
last_updated: '2026-07-01'
progress: '0% (0/1 tasks done, updated 2026-07-01)'
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

**Status:** todo

**Depends:** None

Modify `catalog/agent/skills/verify/SKILL.md` so Verify requires two additional model approvals by default and requires recording each outside approval as a PR comment with the approving model/tool name and verdict. The policy must specify provider preference by host:

- In Codex: prefer Claude plus one OpenCode reviewer.
- In Claude: prefer Codex plus one OpenCode reviewer.
- Without Codex/Claude access: use two OpenCode reviewers if OpenCode is logged in.
- If the user explicitly requests more, fewer, or specific reviewers, follow the explicit instruction.
- If outside reviewers are unavailable, Verify must report the exact approval gap instead of claiming merge-ready.

**Files:**

- Modify: `catalog/agent/skills/verify/SKILL.md`

**Acceptance:**

- [ ] Verify skill names the default count: two extra model approvals.
- [ ] Verify skill documents host-specific reviewer preferences.
- [ ] Verify skill requires PR comments for outside approvals.
- [ ] PR comment requirement includes approving model/tool name and verdict.
- [ ] Verify skill says unavailable reviewers are a merge-readiness gap, not a soft success.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Format | `wp format --check --affected --branch` | Changed markdown is formatted |
| Agent audit | `wp audit agents` | Agent surfaces remain valid |
| Sync check | `wp sync --check` | Projected skill surfaces are in sync, if catalog change requires projection |
| Blueprint audit | `wp audit blueprint-lifecycle` | Blueprint remains valid |

## Non-goals

- Implementing automation for invoking external CLIs.
- Changing provider-specific outside-voice skills.
- Requiring human GitHub approvals; this policy concerns model outside-voice approvals unless the user asks for human approvals.
