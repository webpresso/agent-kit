---
type: parent-roadmap
title: AI reliability contract roadmap
status: planned
owner: agent-kit
complexity: M
created: '2026-05-27'
last_updated: '2026-05-27'
progress: '0/2 child blueprints completed (0%) - created to track Webpresso enforcement and IngestLens adoption'
depends_on: []
tags:
  - ai
  - audit
  - mcp
  - reliability
---

# AI reliability contract roadmap

## Summary

Webpresso already ships the summary-first `wp_*` MCP tool family and a broad
audit surface. This roadmap turns those pieces into an explicit AI reliability
contract and tracks adoption in the reference consumer repo.

## Quick Reference (Execution Waves)

| Wave | Blueprints | Dependencies |
| --- | --- | --- |
| Wave 0 | `planned/ai-reliability-contract-enforcement` | None |

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Contract owner | `agent-kit` / Webpresso | The reusable audit + MCP contract belongs in the framework/tooling layer. |
| Reference consumer | IngestLens | Existing mapping/eval/replay surfaces make it the best proof repo. |
| Enforcement style | Audit + docs + MCP tests | Keeps the contract explicit, testable, and reviewable. |

## Cross-Plan References

| Blueprint | Relationship | Required alignment |
| --- | --- | --- |
| `planned/ai-reliability-contract-enforcement` | Local executable child | Owns the concrete Webpresso audit/doc/test work. |
| [`ozby/ingest-lens: public-ci-surface-adoption`](https://github.com/ozby/ingest-lens/blob/main/blueprints/planned/public-ci-surface-adoption/_overview.md) | Documentary downstream sibling | Should stay aligned with canonical `wp_*` surfaces while the AI contract lands. |
| [`ozby/ingest-lens: adopt-ai-reliability-contract`](https://github.com/ozby/ingest-lens/tree/main/blueprints/planned) | Documentary downstream child | Will own provenance/confidence/replay adoption once the Webpresso contract is stable. |
