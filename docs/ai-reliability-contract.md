---
type: guide
title: AI Reliability Contract
description: Canonical rules for schema-backed, auditable AI tool and workflow surfaces.
last_updated: "2026-05-27"
---

# AI Reliability Contract

Webpresso treats AI reliability as an **application contract**, not a prompt wish.
Models can propose, rank, summarize, and adapt. Repositories must enforce the
deterministic parts in schemas, tools, validators, tests, and audits.

## Contract Rules

1. **Schema-backed outputs first**
   - AI-facing tool surfaces must expose machine-readable structured output.
   - MCP tools should publish `outputSchema` where the result shape is stable.

2. **Protocol failure must be explicit**
   - Use `structuredContent` for normal machine-readable payloads.
   - Use `isError: true` only when the tool could not complete its protocol
     contract reliably: spawn failure, parse failure, composition failure, or
     missing required runtime.

3. **Prompt guidance is not enforcement**
   - Hard safety rules belong in validators, hooks, permissions, or tool logic.
   - Prompts may describe the policy, but must not be the only enforcement layer.

4. **Compact summary-first results**
   - Return a short human summary plus structured details.
   - Clip raw output and persist overflow logs when needed.

5. **Verification belongs in the product surface**
   - Critical claims need tests, audits, or both.
   - Docs should point to the canonical audit or test gate instead of relying on
     narrative guarantees.

## Current Webpresso Enforcement

- `wp audit ai-contracts` checks the canonical contract doc plus the core MCP
  result/tool surfaces that back `wp_test`, `wp_lint`, `wp_typecheck`, `wp_qa`,
  and `wp_audit`.
- MCP discovery advertises `structuredContent`, `isError`, and optional
  `outputSchema` through `ToolHandlerResult` and `ToolDescriptor`.
- `src/mcp/server.integration.test.ts` verifies `tools/list` and
  `structuredContent` passthrough.

## Reference Consumer Direction

IngestLens is the reference consumer for the next layer of this contract, but
it remains a `wp`-first thin consumer: provenance-bearing mapping suggestions,
calibrated confidence buckets, structured replay/delivery failures, and
traceability-backed AI claims should layer on top of the already-shipped
`wp_*`, `wp ci act`, and `wp secrets run --sink <sink> --profile <profile> -- <cmd>` surfaces rather
than a bespoke CI or deploy stack.
