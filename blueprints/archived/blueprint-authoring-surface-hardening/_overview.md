---
type: blueprint
title: Blueprint authoring surface hardening
status: parked
owner: agent-kit
complexity: M
created: '2026-05-26'
last_updated: '2026-05-29'
progress: 'parked on 2026-05-29: placeholder split-scope draft with no executable tasks; structured authoring control-plane work already landed in the completed wp MCP surface blueprint'
depends_on: []
tags:
  - blueprint-authoring
  - validation
  - scaffold
  - repair
---

# Blueprint authoring surface hardening

## Product wedge anchor

- **Stage outcome:** keep the old split-scope placeholder from reappearing as
  active work now that structured blueprint authoring shipped elsewhere.
- **Consuming surface:** none directly; this parked placeholder only preserves
  the historical split and points readers to the completed structured
  authoring control-plane blueprint.
- **New user-visible capability:** none; the user-visible authoring outcome now
  lives in the completed `wp_blueprint_put` / `wp_blueprint_transition` work.

## Summary

This draft holds the blueprint-authoring scope that was previously bundled into
`planned/secret-aware-worker-tail-mcp`:

- scaffold variants,
- repair flows,
- index/search helpers,
- and validator/fix-hint hardening.

It remains intentionally separate from the MCP-first CI/tail/secret roadmap so
that execution lanes touching public CI and secret contracts stay narrow and
auditable.

## Current scope candidates

- `src/blueprint/scaffold.ts`
- `src/blueprint/repair.ts`
- `src/blueprint/index.ts`
- `src/blueprint/scaffold-variants.ts`
- related validation and MCP surfaces

## Cross-plan references

| Blueprint | Relationship |
| --- | --- |
| `planned/secret-aware-worker-tail-mcp` | Scope donor; no longer owns the blueprint-authoring tasks. |
| `planned/mcp-first-secret-surface-hard-cut-roadmap` | Sibling reference only; not a child lane of that roadmap. |

## Tasks

#### Task 1.1: Keep this placeholder parked and point operators at the completed structured authoring lane

**Status:** todo

**Wave:** 0

**Files:**
- `blueprints/completed/replace-markdown-first-blueprint-authoring-with-a-structured-wp-mcp-surface/_overview.md`

**Acceptance:**
- [ ] This placeholder remains non-executable and clearly superseded by the completed structured authoring blueprint.
