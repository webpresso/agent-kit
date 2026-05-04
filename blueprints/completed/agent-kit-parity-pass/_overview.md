---
type: blueprint
status: completed
complexity: L
created: '2026-04-25'
last_updated: '2026-04-30'
progress: '100% (completed)'
depends_on: []
tags:
  - agent-kit
  - parity
  - rules-fanout
  - mcp
  - audit
  - quality-engine
parent_roadmap: 'cross-repo: webpresso/monorepo → webpresso/blueprints/completed/webpresso-public-extraction-roadmap'
---

# Agent-Kit Parity Pass

**Goal:** Close the table-stakes gap with the rest of the agent-kit ecosystem (rulesync, AGENTS.md spec, Claude Skills, etc.) and absorb `quality-engine` as another audit family inside `@webpresso/agent-kit`. Lean on audits as the brand wedge.

## Why

External research (2026-04-25) — see roadmap Decision 3/4 — identified concrete parity gaps with `dyoshikawa/rulesync` and the `agents.md` spec. These are cheap to add and unblock adoption of webpresso/agent-kit by repos already using competing tools. Meanwhile, splitting the audit story across `agent-kit` and a separate `quality-engine` package weakens the wedge ("agent kit + audit harness"); fold it.

## Scope

### Parity additions (from rulesync / agents.md)

- **AGENTS.md fan-out** — the canonical `.agent/AGENTS.md` is generated and kept in sync at repo-root `AGENTS.md`. Idempotent under `ak symlink sync`.
- **MCP server registration via fan-out** — canonical source `.agent/mcp.json` fans out to `.mcp.json`, `.cursor/mcp.json`, etc.
- **`ak symlink import`** — onboard repos that already have `.cursorrules`, `CLAUDE.md`, or `.github/copilot-instructions.md` by reading them into `.agent/` as the new canonical source.
- **Expanded fan-out targets** — Cline (`.clinerules/`), Aider (`CONVENTIONS.md`), Goose, Factory Droid, deepagents-cli (research scope per IDE; ship the cheap ones first).

### Audit absorption (replaces standalone quality-engine)

- `ak audit mutation` — wraps Stryker invocation, reads `@webpresso/tooling/stryker-config`, fails CI on threshold misses.
- `ak audit quality` — composite gate that runs `mutation`, `bundle-budget`, `catalog-drift`, `docs-frontmatter`, `blueprint-lifecycle`, `commit-message`. Single command for "is this repo healthy?"
- The `quality-engine` source from `monorepo/packages/foundation/quality-engine/` migrates into `webpresso/agent-kit/src/audits/quality/`.
- No new public package created.

## Out of scope

- New audit categories beyond what `quality-engine` already implements.
- Authoring additional skills.
- Symlinker rewrite — only adds new targets/behaviors, doesn't restructure.
- **Parent-roadmap promotion in `ak blueprint list`** — separate blueprint at `draft/promote-parent-roadmaps`. Different problem (internal hierarchy DX vs ecosystem rules-fanout), different urgency, different code surface (blueprint service + `/pll` dispatcher vs symlinker).

## Verification Gates

- `ak symlink sync` produces `AGENTS.md` at repo root that matches `.agent/AGENTS.md` byte-for-byte (after format transform).
- `ak symlink import --from .cursorrules` round-trips: import → sync → diff is empty.
- `cat .mcp.json` and `cat .cursor/mcp.json` both resolve to the same servers as `.agent/mcp.json`.
- `ak audit quality` exits zero on a clean ingest-lens checkout, non-zero with a seeded violation.
- `npm view @webpresso/quality-engine` returns 404 or `unpublished` (it never exists as a standalone package).

## Related

- Parent: `completed/webpresso-public-extraction-roadmap/_overview.md`
- Supersedes: `quality-engine` portion of `completed/extract-foundation-packages` Wave 1 plan
- Sibling: `planned/consolidate-runtime-umbrella`, `planned/expand-tooling-umbrella`, `draft/promote-parent-roadmaps`
- External reference: `dyoshikawa/rulesync` README, `agents.md` spec, `agentskills.io`
