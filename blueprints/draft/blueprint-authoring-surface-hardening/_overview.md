---
type: blueprint
title: Blueprint authoring surface hardening
status: draft
owner: agent-kit
complexity: M
created: '2026-05-26'
last_updated: '2026-05-26'
progress: 'draft split from secret-aware-worker-tail-mcp on 2026-05-26'
depends_on: []
tags:
  - blueprint-authoring
  - validation
  - scaffold
  - repair
---

# Blueprint authoring surface hardening

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
