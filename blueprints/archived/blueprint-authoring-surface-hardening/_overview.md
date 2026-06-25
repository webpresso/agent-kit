---
type: blueprint
title: Blueprint authoring surface hardening
status: archived
owner: agent-kit
complexity: M
created: "2026-05-26"
last_updated: "2026-05-29"
progress: "100% (superseded by completed structured blueprint authoring control-plane work; placeholder retired on 2026-05-29)"
depends_on: []
tags:
  - blueprint-authoring
  - validation
  - scaffold
  - repair
  - superseded
---

# Archived: Blueprint authoring surface hardening

## Decision

Archive this placeholder. Do **not** reopen it as a parked execution lane.

The blueprint-authoring control-plane work that justified this placeholder is
already represented by the completed
`completed/replace-markdown-first-blueprint-authoring-with-a-structured-wp-mcp-surface`
blueprint. Keeping a separate parked placeholder would imply there is still a
local executable lane here when the remaining work, if any, should instead be
scoped as a fresh follow-on blueprint with new evidence.

## Why this placeholder was retired

- The structured authoring outcome already shipped locally via
  `wp_blueprint_put` and `wp_blueprint_transition`.
- This file never developed executable tasks beyond preserving the historical
  split from the CI/tail/secret lane.
- The old cross-references still pointed at outdated lifecycle paths
  (`planned/secret-aware-worker-tail-mcp`, sibling `planned/...` roadmap paths),
  which is a sign this record is historical context rather than a live plan.

## Replacement implementation

Use the completed structured authoring blueprint as the authoritative record:

- `blueprints/completed/replace-markdown-first-blueprint-authoring-with-a-structured-wp-mcp-surface/_overview.md`

If new blueprint-authoring work appears later (for example scaffold variants,
repair UX, or additional validation flows), create a new blueprint with fresh
fact-checked scope instead of reviving this retired placeholder.

## Historical scope that was split out

The retired placeholder had preserved these potential areas:

- `src/blueprint/scaffold.ts`
- `src/blueprint/repair.ts`
- `src/blueprint/index.ts`
- `src/blueprint/scaffold-variants.ts`
- related validation and MCP surfaces

## Cross-plan references

| Blueprint                                                                               | Relationship                                                           |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `completed/secret-aware-worker-tail-mcp`                                                | Historical scope donor; no longer owns blueprint-authoring tasks.      |
| `parked/mcp-first-secret-surface-hard-cut-roadmap`                                      | Historical sibling roadmap only; this placeholder is not a child lane. |
| `completed/replace-markdown-first-blueprint-authoring-with-a-structured-wp-mcp-surface` | Replacement authoritative implementation record.                       |

## Archived tasks

- [x] Retire the non-executable parked placeholder.
- [x] Point operators to the completed structured authoring control-plane lane.
- [x] Require any future blueprint-authoring work to start as a new evidence-backed blueprint.
