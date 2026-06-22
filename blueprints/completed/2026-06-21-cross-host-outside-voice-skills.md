---
type: blueprint
title: Cross-host outside-voice skills for Codex, Claude, and OpenCode Go
owner: ozby
status: completed
complexity: M
created: '2026-06-21'
last_updated: '2026-06-21'
progress: '100% (implemented; focused verification passed)'
depends_on:
  - blueprints/completed/2026-06-19-webpresso-gstack-package.md
cross_repo_depends_on: []
tags:
  - skills
  - codex
  - claude
  - opencode
  - gstack
  - package-surface
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Cross-host outside-voice skills for Codex, Claude, and OpenCode Go

## Goal

Close the gap in the curated gstack-derived outside-voice skill package: Codex must be callable from the Claude plugin, Claude must be callable from the Codex plugin using local Claude CLI/Max authentication, and both plugin surfaces must include OpenCode Go review skills for every current OpenCode Go model family.

## Critical evaluation of the previous state

- The prior package shipped `claude` but not `codex`, so the cross-host reviewer contract was asymmetric.
- The `claude` skill still documented API-key and credentials-file fallbacks. That conflicted with the desired Claude Max account flow and could accidentally steer users toward API-key auth.
- The curated model-family coverage was absent. OpenCode Go was not represented even though it is the intended low-cost outside-review backend for DeepSeek, GLM, Qwen, MiMo, and the other Go families.
- The original blueprint was marked complete for the v1 slice, but this follow-up expands the acceptance criteria rather than invalidating that shipped PR.

## External reference check

Official OpenCode sources checked on 2026-06-21:

- `https://opencode.ai/docs/go/` lists the current documented Go families: GLM, Kimi, MiMo, MiniMax, Qwen, and DeepSeek, and says model IDs are used as `opencode-go/<model-id>`.
- `https://opencode.ai/zen/go/v1/models` additionally exposes older/preview Go IDs not in the short docs list: `minimax-m2.5`, `kimi-k2.5`, `glm-5`, `qwen3.5-plus`, `mimo-v2-pro`, `mimo-v2-omni`, and `hy3-preview`.

## Implemented scope

- Added `codex` outside-voice skill for non-Codex hosts using `codex exec --sandbox read-only`.
- Updated `claude` outside-voice skill to require `claude auth status --json` local CLI login and removed API-key / credentials-file fallback instructions.
- Added OpenCode Go aggregate and model-family skills:
  - `opencode-go`
  - `deepseek`
  - `glm`
  - `kimi`
  - `minimax`
  - `mimo`
  - `qwen`
  - `hy3`
- Staged all new skills into both `catalog/agent/skills/<name>/SKILL.md` and package-root `skills/<name>/SKILL.md` so Claude and Codex plugin projections both receive them.
- Updated provenance, staging policy, package metadata, and tests to lock the expanded allowlist.

## Acceptance criteria

- [x] `claude` skill no longer mentions `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY`, or credentials-file fallback auth.
- [x] `codex` skill is staged into catalog and package-root skill surfaces.
- [x] OpenCode Go skills are staged into catalog and package-root skill surfaces.
- [x] OpenCode Go model catalog covers DeepSeek, GLM, Kimi, MiniMax, MiMo, Qwen, and HY3 preview IDs from the current model endpoint.
- [x] Tests lock skill allowlist, Claude auth contract, OpenCode model-family text, and package-surface behavior.

## Verification evidence

- `wp_test` focused file set passed for:
  - `scripts/stage-gstack-skills.test.ts`
  - `packages/gstack/src/claude-auth.test.ts`
  - `packages/gstack/src/provenance.test.ts`
  - `packages/gstack/src/skill-text.test.ts`
  - `packages/gstack/src/staging-policy.test.ts`
  - `src/audit/package-surface.test.ts`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-21-cross-host-outside-voice-skills.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
