---
type: blueprint
title: "Session elision exact retrieval"
status: completed
complexity: M
owner: "agent-kit"
created: '2026-06-20'
last_updated: '2026-06-20'
progress: '100% (completed)'
---

## Product wedge anchor

- **Stage outcome:** Agent-facing context-window safety for summary-first
  `wp_*` tool use during local coding workflows.
- **Consuming surface:** MCP session-memory tools and CLI quality output:
  `wp_session_retrieve`, `wp_session_execute_file`,
  `wp_session_execute`, `wp_session_batch_execute`, and shared check-tool
  formatting.
- **New user-visible capability:** Agents can follow an `elisions[]` handle to
  retrieve exact bounded content that was omitted from compact outputs.

## Summary

Add exact-id retrieval for bounded/elided agent-kit outputs so compact MCP and
CLI responses can return deterministic handles without adding a proxy layer or a
new storage backend.

## Tasks

#### Task 1.1: Exact retrieval core and producer wiring

**Status:** done
**Wave:** 0
**Files:**
- `src/session-memory/store.ts`
- `src/mcp/tools/session-retrieve.ts`
- `src/mcp/tools/_session-elision.ts`
- `src/mcp/tools/session-execute-file.ts`
- `src/mcp/tools/_session-command.ts`
- `src/mcp/tools/_session-execute.ts`
- `src/mcp/tools/_session-batch-execute.ts`
- `src/mcp/tools/_shared/full-output.ts`
- `src/output-transforms/*`
- `src/cli/commands/quality-runner.ts`
- `docs/guides/session-memory.md`
- `README.md`

**Acceptance:**
- [x] `wp_session_retrieve` retrieves exact indexed chunks by id with bounded
      `maxBytes` output and no public database path input.
- [x] Truncated file, command, batch, check-tool, and CLI quality outputs emit
      retrievable elision metadata or visible retrieval handles.
- [x] Denied/secret file paths create no elision records.
- [x] Existing compact-output fields remain backward compatible.
- [x] Targeted tests, typecheck, lint, audits, and full workspace tests pass.

## Verification evidence

Fresh verification on 2026-06-20:

- Targeted MCP `wp_test` passed for 19 files covering session retrieval,
  elision producers, output transforms, routing, scaffolded AGENTS, and the
  MCP test-budget contract.
- `wp_typecheck` passed with 0 errors.
- `wp_lint --full` passed with 0 issues across 1,244 files.
- `wp_audit(kind="tph")` passed: 13,553 checked.
- `wp_audit(kind="agents")` passed: 3 checked.
- `wp_audit(kind="session-memory-hardcut")` passed: 1,230 checked.
- Full workspace `wp test` passed through the repo CLI after the live MCP tool
  schema rejected the intended 300,000 ms budget with a stale 110,000 ms cap.
