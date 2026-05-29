---
type: parent-roadmap
title: AI reliability contract roadmap
status: parked
owner: agent-kit
complexity: M
created: '2026-05-27'
last_updated: '2026-05-29'
progress: 'Local Webpresso enforcement is complete; remaining adoption work is downstream in IngestLens, so this roadmap is parked locally pending external execution'
depends_on: []
tags:
  - ai
  - audit
  - mcp
  - reliability
---

# AI reliability contract roadmap

## Product wedge anchor

- **Stage outcome:** Webpresso keeps the AI reliability contract explicit and
  stable locally while downstream consumer adoption is tracked without
  pretending the remaining work lives in this repo.
- **Consuming surface:** canonical `wp_*` MCP tools, audit docs, and the
  downstream IngestLens adoption blueprints referenced below.
- **New user-visible capability:** none locally; this parked roadmap now
  serves as a truthful tracker that says local enforcement is complete and the
  remaining rollout is external.

## Summary

Webpresso already ships the summary-first `wp_*` MCP tool family and a broad
audit surface. This roadmap turns those pieces into an explicit AI reliability
contract and tracks adoption in the reference consumer repo.

## Quick Reference (Execution Waves)

| Wave | Blueprints | Dependencies |
| --- | --- | --- |
| Wave 0 | `completed/ai-reliability-contract-enforcement` | None |

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Contract owner | `agent-kit` / Webpresso | The reusable audit + MCP contract belongs in the framework/tooling layer. |
| Reference consumer | IngestLens | Existing mapping/eval/replay surfaces make it the best proof repo. |
| Enforcement style | Audit + docs + MCP tests | Keeps the contract explicit, testable, and reviewable. |

## Cross-Plan References

| Blueprint | Relationship | Required alignment |
| --- | --- | --- |
| `completed/ai-reliability-contract-enforcement` | Local executable child | Owns the concrete Webpresso audit/doc/test work and is now complete. |
| [`ozby/ingest-lens: public-ci-surface-adoption`](https://github.com/ozby/ingest-lens/blob/main/blueprints/planned/public-ci-surface-adoption/_overview.md) | Documentary downstream sibling | Should stay aligned with canonical `wp_*` surfaces while the AI contract lands. |
| [`ozby/ingest-lens: adopt-ai-reliability-contract`](https://github.com/ozby/ingest-lens/tree/main/blueprints/planned) | Documentary downstream child | Will own provenance/confidence/replay adoption once the Webpresso contract is stable. |

## Tasks

#### Task 1.1: Track downstream IngestLens adoption

**Status:** todo
**Wave:** 0

**Files:**
- docs/markdown-fact-check.md
- src/mcp/tools/test.ts

**Acceptance:**
- [ ] Downstream IngestLens adoption blueprint exists and remains aligned with canonical `wp_*` MCP surfaces.
