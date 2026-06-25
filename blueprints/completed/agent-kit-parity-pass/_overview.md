---
type: blueprint
title: "Agent-Kit Parity Pass"
owner: agent-kit
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
status: completed
complexity: L
created: "2026-04-25"
last_updated: "2026-04-30"
progress: "100% (completed)"
depends_on: []
tags:
  - agent-kit
  - parity
  - rules-fanout
  - mcp
  - audit
  - quality-engine
parent_roadmap: "cross-repo: webpresso/monorepo → webpresso/blueprints/completed/webpresso-public-extraction-roadmap"
historical_zero_task_waiver: true
historical_zero_task_rationale: Historical completed planning record predates the task-level blueprint format and is retained for roadmap continuity.
---

# Agent-Kit Parity Pass

## Product wedge anchor

- **Stage outcome:** the completed Agent-Kit Parity Pass work remains truthfully represented in the blueprint lifecycle and continues to describe the shipped outcome of this lane.
- **Consuming surface:** the repo-local agent-kit surfaces and docs touched by this completed lane.
- **New user-visible capability:** none new in this cleanup pass; the capability shipped already, and this blueprint now stays structurally valid as a completed record.

**Goal:** Close the table-stakes gap with the rest of the agent-kit ecosystem (rulesync, AGENTS.md spec, Claude Skills, etc.) and absorb `quality-engine` as another audit family inside `@webpresso/agent-kit`. Lean on audits as the brand wedge.

## Why

External research (2026-04-25) — see roadmap Decision 3/4 — identified concrete parity gaps with `dyoshikawa/rulesync` and the `agents.md` spec. These are cheap to add and unblock adoption of webpresso/agent-kit by repos already using competing tools. Meanwhile, splitting the audit story across `agent-kit` and a separate `quality-engine` package weakens the wedge ("agent kit + audit harness"); fold it.

## Scope

### Parity additions (from rulesync / agents.md)

- **AGENTS.md fan-out** — the canonical `.agent/AGENTS.md` is generated and kept in sync at repo-root `AGENTS.md`. Idempotent under `wp symlink sync`.
- **MCP server registration via fan-out** — canonical source `.agent/mcp.json` fans out to `.mcp.json`, `.cursor/mcp.json`, etc.
- **`wp symlink import`** — onboard repos that already have `.cursorrules`, `CLAUDE.md`, or `.github/copilot-instructions.md` by reading them into `.agent/` as the new canonical source.
- **Expanded fan-out targets** — Cline (`.clinerules/`), Aider (`CONVENTIONS.md`), Goose, Factory Droid, deepagents-cli (research scope per IDE; ship the cheap ones first).

### Audit absorption (replaces standalone quality-engine)

- `wp audit mutation` — wraps Stryker invocation, reads `@webpresso/tooling/stryker-config`, fails CI on threshold misses.
- `wp audit quality` — composite gate that runs `mutation`, `bundle-budget`, `catalog-drift`, `docs-frontmatter`, `blueprint-lifecycle`, `commit-message`. Single command for "is this repo healthy?"
- The `quality-engine` source from `monorepo/packages/foundation/quality-engine/` migrates into `webpresso/agent-kit/src/audits/quality/`.
- No new public package created.

## Out of scope

- New audit categories beyond what `quality-engine` already implements.
- Authoring additional skills.
- Symlinker rewrite — only adds new targets/behaviors, doesn't restructure.
- **Parent-roadmap promotion in `wp blueprint list`** — separate blueprint at `planned/promote-parent-roadmaps`. Different problem (internal hierarchy DX vs ecosystem rules-fanout), different urgency, different code surface (blueprint service + `/pll` dispatcher vs symlinker).

## Verification Gates

- `wp symlink sync` produces `AGENTS.md` at repo root that matches `.agent/AGENTS.md` byte-for-byte (after format transform).
- `wp symlink import --from .cursorrules` round-trips: import → sync → diff is empty.
- `cat .mcp.json` and `cat .cursor/mcp.json` both resolve to the same servers as `.agent/mcp.json`.
- `wp audit quality` exits zero on a clean ingest-lens checkout, non-zero with a seeded violation.
- `npm view @webpresso/quality-engine` returns 404 or `unpublished` (it never exists as a standalone package).

## Related

- Parent: `completed/webpresso-public-extraction-roadmap/_overview.md`
- Supersedes: `quality-engine` portion of `completed/extract-foundation-packages` Wave 1 plan
- Sibling: `planned/consolidate-runtime-umbrella`, `planned/expand-tooling-umbrella`, `planned/promote-parent-roadmaps`
- External reference: `dyoshikawa/rulesync` README, `agents.md` spec, `agentskills.io`

## Tasks

#### Task 1.1: Preserve this historical completed parity record without reopening execution

**Status:** done

**Wave:** 0

**Files:**

- Historical record only

**Acceptance:**

- [x] The completed parity outcome remains documented without pretending there is unfinished local work in this blueprint.

## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                      |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/agent-kit-parity-pass/\_overview.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
