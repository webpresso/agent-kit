---
type: blueprint
title: ak to wp live rename cleanup
status: draft
complexity: XS
owner: ozby
created: "2026-06-27"
last_updated: "2026-06-27"
progress: "0% (planned; docs-only, independent — no wait)"
tags:
  - cli
  - docs
  - naming
---

# ak to wp live rename cleanup

## Product wedge anchor

- **Stage outcome:** VISION "Delete stale docs" + the no-legacy-cli-bin guard's intent (one canonical CLI name).
- **Consuming surface:** Live docs across the workspace.
- **New user-visible capability:** Every live doc a user reads says wp, never ak.

## Summary

**Goal:** Remove the remaining live `ak` CLI references (the binary is `wp`) so every doc a user reads says `wp`. The rename is already mostly done and guarded by `no-legacy-cli-bin`; this closes the doc stragglers.

**Why:** The CLI binary is `wp` and a `no-legacy-cli-bin` audit guards against `ak` re-introduction (`src/audit/no-legacy-cli-bin.test.ts`), but live docs still carry `ak …` examples. Stale naming contradicts VISION. Ref: approved plan `~/.claude/plans/i-am-still-not-effervescent-blossom.md`.

**Constraints:** Docs-only (all `*.md` plus one source comment) → blueprint-PR-coverage exempt, but tracked here so the rename intent is recorded. Live targets only — skip immutable `logs/`, `.codex/sessions/`, and `_worktrees/` copies. Leave `CHANGELOG.md` and completed-blueprint history as-is (immutable record).

**Sequencing / wait:** No wait; independent of the CLI-behavior blueprints.

#### Task 1.1: Workspace + agent-kit stragglers

**Status:** todo

Replace `ak <cmd>` -> `wp <cmd>` in /Users/ozby/repos/CLAUDE.md (~20 occurrences) and the stray comment in src/cli/commands/init/scaffolders/codex-mcp/index.ts:131.

**Acceptance:**

- [ ] grep -rE '\bak (setup|blueprint|sync|audit|init|test|e2e)\b' over those files returns nothing.
- [ ] wp audit no-legacy-cli-bin (or its test) green.

#### Task 1.2: ingest-lens docs stragglers (cross-repo)

**Status:** todo

Replace `ak <cmd>` -> `wp <cmd>` in the live ingest-lens checkout (not \_worktrees/): docs/research/2026-04-23-cross-repo-vite-bundle-guardrails.md, docs/research/2026-04-23-cross-tool-skill-sharing-via-symlinker.md, and AGENTS.md / Brewfile occurrences. Separate commit in the ingest-lens repo (no workspace link).

**Acceptance:**

- [ ] Live ingest-lens grep for '\bak (setup|blueprint|sync|audit|init)\b' returns nothing.
