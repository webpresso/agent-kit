---
type: blueprint
title: "WP audit batching MCP surface"
owner: ozby
status: planned
complexity: M
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "0% (planned; blueprint-only PR)"
tags:
  - mcp
  - audit
  - agents
  - devex
---

# WP audit batching MCP surface

## Planning Summary

Agents currently call `wp_audit` repeatedly when a task needs several repo audits. That wastes turns, produces fragmented evidence, and hides aggregate failure state. This blueprint adds a batch audit surface with a clear contract while preserving existing single-audit behavior.

Claude review found that the original combined MCP productivity plan was too broad and that `wp_audits` needed a precise partial-failure and preset contract before implementation. This lane is intentionally limited to audit batching and routing.

## Scope

### In scope
- Add a batch audit MCP contract for multiple audit kinds and guardrail presets.
- Extract or centralize shared audit dispatch so CLI, `wp_audit`, and batch MCP behavior do not diverge.
- Define deterministic output ordering, partial-failure semantics, and preset membership.
- Update routing/pretool guidance so chained audit intent uses the batch surface.
- Add tests for dispatch, aggregate results, routing, and MCP advertisement.

### Out of scope
- Implement unrelated MCP tools.
- Make audits run in parallel before audit safety is proven.
- Add mutating audit options such as `--fix` to the batch MCP surface.
- Replace deterministic audit implementations.

## Public MCP Contract

Preferred implementation is to evolve the existing `wp_audit` contract to accept one-or-many audit kinds if that can be done without breaking current callers. If that would create compatibility risk, add `wp_audits` as a separate batch tool and keep `wp_audit` as a single-kind wrapper.

Batch input:

```ts
type AuditBatchInput = {
  cwd?: string
  directory?: string
  kinds?: MCPAuditKind[]
  preset?: 'all' | 'guardrails'
  baseRef?: string
  strict?: boolean
}
```

Validation rules:
- Exactly one of `kinds` or `preset` is required.
- `kinds` must be non-empty and de-duplicated while preserving first occurrence.
- `preset: 'guardrails'` resolves to the same repo-audit set used by CLI `wp audit guardrails` for the target repo.
- `preset: 'all'` resolves only to MCP-safe read-only audit kinds. Slow or external-command audits must be excluded unless they already have bounded, deterministic MCP handlers.
- Batch MCP input excludes `fix`, write, and mutation options.

Batch output:

```ts
type AuditBatchOutput = {
  passed: boolean
  summary: string
  total: number
  passedCount: number
  failedCount: number
  failedKinds: string[]
  results: Array<{
    kind: string
    passed: boolean
    summary: string
    details: unknown
    isError?: boolean
  }>
}
```

Partial-failure contract:
- The batch call always attempts every requested audit unless input validation fails before dispatch.
- `passed` is `true` only when every requested audit passes.
- An audit crash becomes one failed `results[]` entry with `isError: true`.
- Result order is deterministic and equals resolved kind order, independent of future execution strategy.

## Side-effect Classification

| Surface | Side effects | Safety rule |
| ------- | ------------ | ----------- |
| Single audit MCP | Read-only unless existing audit kind already has side effects | Preserve existing behavior |
| Batch audit MCP | Read-only | Reject mutating options and continue through failures |
| Routing/pretool guidance | Read-only | Only changes agent guidance and command redirects |

## Tasks

### Task 1: Shared audit dispatch contract

- [ ] **Status:** todo
- **Depends:** None
- **Files:** `src/mcp/tools/audit.ts`, `src/cli/commands/audit-core.ts`, shared audit dispatch module if needed
- **Steps:** Add regression tests for current `wp_audit`, extract shared dispatch without changing output, and run targeted audit/MCP tests.
- **Acceptance:** Existing `wp_audit` callers keep working and CLI/MCP dispatch use one source of truth where practical.

### Task 2: Batch audit MCP behavior

- [ ] **Status:** todo
- **Depends:** Task 1
- **Files:** `src/mcp/tools/audit*.ts`, `src/mcp/tools/_registry.ts`, MCP server tests
- **Steps:** Implement one-or-many input or `wp_audits`, add output schema, and cover pass, partial failure, crash, invalid input, explicit kinds, presets, and ordering.
- **Acceptance:** Agents can run multiple audits in one MCP call and receive complete aggregate evidence.

### Task 3: Agent routing and pretool redirects

- [ ] **Status:** todo
- **Depends:** Task 2
- **Files:** routing block, pretool guard validators/tests, wrapped `wp` hints
- **Steps:** Route chained audit commands and `wp audit guardrails` to the batch surface while keeping single audit commands on single-audit usage.
- **Acceptance:** Repeated `wp_audit` calls are no longer the recommended path for multi-audit work.

## Test Plan

- `vp run test src/mcp/tools/audit.test.ts`
- MCP server advertisement/structuredContent integration test.
- Pretool guard tests for single audit, chained audits, and guardrails.
- `vp run blueprints:check`
- Final implementation PR: `vp run typecheck`, `vp run lint`, affected tests.

## PR Acceptance Criteria

- [ ] Blueprint remains current with the implemented API choice.
- [ ] Batch audit behavior is deterministic and summary-first.
- [ ] Partial failures and crashes are represented in structured results.
- [ ] Routing guidance reduces repeated single-audit MCP calls.
