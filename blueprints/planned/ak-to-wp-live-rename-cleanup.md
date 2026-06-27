---
type: blueprint
title: Retire the legacy CLI alias from live docs (wp is canonical)
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

# Retire the legacy CLI alias from live docs (wp is canonical)

## Product wedge anchor

- **Stage outcome:** VISION 'Delete stale docs' + the no-legacy-cli-bin guard's intent (one canonical CLI name).
- **Consuming surface:** Live docs across the workspace and consumer repos.
- **New user-visible capability:** Every live doc a user reads invokes wp, never the retired alias.

## Summary

Remove the remaining live references to the retired `ak`-prefixed CLI name (the binary is `wp`) so every doc a user reads says `wp`. The rename is already mostly done and guarded by no-legacy-cli-bin (src/audit/no-legacy-cli-bin.test.ts); this closes the documentation stragglers.

### Scope (codex change folded in: keep this genuinely docs-only)

- Replace the retired `ak`-prefixed invocations with their `wp` equivalents in live Markdown only: the workspace-root CLAUDE.md (~20 occurrences) and the live ingest-lens checkout docs (docs/research/2026-04-23-\*.md, AGENTS.md, Brewfile), NOT the \_worktrees/ copies.
- **Out of scope:** the stray legacy-alias comment in src/cli/commands/init/scaffolders/codex-mcp/index.ts is LEFT AS-IS (historical code comment). Excluding the only non-Markdown edit keeps this blueprint genuinely docs-only / blueprint-PR-coverage exempt. If a future pass wants that comment fixed, it rides a code PR.
- Skip immutable logs/, .codex/sessions/, and history (CHANGELOG.md, completed-blueprint files).
- This blueprint deliberately spells the retired name only as the backtick token `ak`->`wp` so it does not itself trip the no-legacy-cli-bin guard.

### Acceptance breadth (codex)

The verification grep must cover ALL intended live locations, not a single file: workspace CLAUDE.md and each live ingest-lens doc path.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-27T23:34:03.508Z
- verified-head: 1dbc3edc547d94d0e57fbde488620b8df7a48293
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                                                    | Evidence                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| C1  | The CLI binary is wp and a no-legacy-cli-bin audit guards against retired-alias re-introduction, so the remaining work is documentation stragglers only. | repo:src/audit/no-legacy-cli-bin.test.ts |
| C2  | agent-kit's own docs already use wp; the live stragglers are workspace and consumer Markdown outside this repo.                                          | repo:CLAUDE.md                           |

### Material Decisions

| ID  | Decision           | Chosen option                                 | Rejected alternatives                       | Rationale                                                                         |
| --- | ------------------ | --------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| D1  | Non-Markdown edits | Exclude the codex-mcp code comment from scope | Include it and drop the docs-only exemption | Keeping this Markdown-only preserves the blueprint-PR-coverage exemption (codex). |
| D2  | Targets            | Live checkouts only                           | Rewrite \_worktrees/ copies and history     | Worktrees and history are not user-facing live docs.                              |

### Promotion Gates

| Gate       | Command                  | Expected outcome | Last result                      |
| ---------- | ------------------------ | ---------------- | -------------------------------- |
| trust-gate | wp audit blueprint-trust | pass             | pass at 2026-06-27T23:34:03.508Z |

### Residual Unknowns

None.

## Implementation notes

Tasks follow.

#### Task 1.1: Replace live retired-alias references in workspace + consumer Markdown

**Status:** todo
**Wave:** 0

Replace the retired `ak`-prefixed invocations with their `wp` equivalents in /Users/ozby/repos/CLAUDE.md and the live ingest-lens docs (docs/research/2026-04-23-cross-repo-vite-bundle-guardrails.md, docs/research/2026-04-23-cross-tool-skill-sharing-via-symlinker.md, AGENTS.md, Brewfile). Cross-repo ingest-lens edits are a separate commit. Leave the codex-mcp code comment and all history untouched.

**Acceptance:**

- [ ] A grep for the retired alias over ALL intended live locations (workspace CLAUDE.md and each named ingest-lens path) returns nothing.
- [ ] wp audit no-legacy-cli-bin stays green.
- [ ] No non-Markdown file is modified.
