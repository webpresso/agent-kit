---
type: blueprint
title: ak to wp live rename cleanup
status: planned
complexity: XS
owner: ozby
created: "2026-06-27"
last_updated: "2026-06-27"
progress: "0% (0/1 tasks done, 0 blocked, updated 2026-06-27)"
tags:
  - cli
  - docs
  - naming
---

# ak to wp live rename cleanup

## Product wedge anchor

- **Stage outcome:** VISION 'Delete stale docs' + the no-legacy-cli-bin guard's intent (one canonical CLI name).
- **Consuming surface:** Live docs across the workspace and consumer repos.
- **New user-visible capability:** Every live doc a user reads says wp, never ak.

## Summary

Remove the remaining live `ak` CLI references (the binary is `wp`) so every doc a user reads says `wp`. The rename is already mostly done and guarded by no-legacy-cli-bin (src/audit/no-legacy-cli-bin.test.ts); this closes the doc stragglers.

### Scope (codex change folded in: keep this genuinely docs-only)

- Replace `ak <cmd>` -> `wp <cmd>` in live Markdown only: the workspace-root CLAUDE.md (~20 occurrences) and the live ingest-lens checkout docs (docs/research/2026-04-23-\*.md, AGENTS.md, Brewfile), NOT the \_worktrees/ copies.
- **Out of scope:** the stray `ak setup` comment in src/cli/commands/init/scaffolders/codex-mcp/index.ts is LEFT AS-IS (historical comment). Excluding the only non-Markdown edit keeps this blueprint genuinely docs-only / blueprint-PR-coverage exempt. If a future pass wants that comment fixed, it rides a code PR.
- Skip immutable logs/, .codex/sessions/, and history (CHANGELOG.md, completed-blueprint files).

### Acceptance breadth (codex)

The verification grep must cover ALL intended live locations, not a single file: workspace CLAUDE.md and each live ingest-lens doc path.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-27T23:04:19.675Z
- verified-head: 2b83330804972998d3d680cfb9c1210b35031742
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                               | Evidence                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| C1  | The CLI binary is wp and a no-legacy-cli-bin audit guards against ak re-introduction, so the remaining work is doc stragglers only. | repo:src/audit/no-legacy-cli-bin.test.ts |
| C2  | agent-kit's own docs already use wp; the live stragglers are workspace and consumer Markdown outside this repo.                     | repo:CLAUDE.md                           |

### Material Decisions

| ID  | Decision           | Chosen option                                | Rejected alternatives                       | Rationale                                                                         |
| --- | ------------------ | -------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| D1  | Non-Markdown edits | Exclude the codex-mcp .ts comment from scope | Include it and drop the docs-only exemption | Keeping this Markdown-only preserves the blueprint-PR-coverage exemption (codex). |
| D2  | Targets            | Live checkouts only                          | Rewrite \_worktrees/ copies and history     | Worktrees and history are not user-facing live docs.                              |

### Promotion Gates

| Gate       | Command                  | Expected outcome | Last result                      |
| ---------- | ------------------------ | ---------------- | -------------------------------- |
| trust-gate | wp audit blueprint-trust | pass             | pass at 2026-06-27T23:04:19.675Z |

### Residual Unknowns

None.

## Implementation notes

Tasks follow.

#### Task 1.1: Replace live ak references in workspace + consumer Markdown

**Status:** todo
**Wave:** 0

Replace ak <cmd> -> wp <cmd> in /Users/ozby/repos/CLAUDE.md and the live ingest-lens docs (docs/research/2026-04-23-cross-repo-vite-bundle-guardrails.md, docs/research/2026-04-23-cross-tool-skill-sharing-via-symlinker.md, AGENTS.md, Brewfile). Cross-repo ingest-lens edits are a separate commit. Leave the codex-mcp .ts comment and all history untouched.

**Acceptance:**

- [ ] A grep for ak <cmd> over ALL intended live locations (workspace CLAUDE.md and each named ingest-lens path) returns nothing.
- [ ] wp audit no-legacy-cli-bin (or its test) stays green.
- [ ] No non-Markdown file is modified.
