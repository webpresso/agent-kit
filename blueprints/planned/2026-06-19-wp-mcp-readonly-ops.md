---
type: blueprint
title: "Read-only WP MCP operations tools"
owner: ozby
status: planned
complexity: L
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "0% (planned; blueprint-only PR)"
tags:
  - mcp
  - devex
  - ci
  - benchmarks
  - release
---

# Read-only WP MCP operations tools

## Planning Summary

This conversation repeatedly needed repo operations that are available through CLI commands but not first-class MCP tools: PR/CI status, benchmark execution, gain reporting, and release-readiness checks. Agents can run shell commands, but MCP gives typed input, summary-first output, bounded logs, and consistent routing.

Claude review warned that MCP tools cost context budget and should not wrap CLI commands without a clear reason. This lane is limited to read-only operations where structured output materially improves agent efficiency and verification.

## Scope

### In scope
- `wp_pr_status`: summarize current branch PR, checks, review state, and base.
- `wp_bench`: run/list bounded benchmark flows already present in repo scripts.
- `wp_gain`: expose existing session-memory/gain report data in structured form.
- `wp_release_readiness`: aggregate existing readiness checks without publishing or mutating release state.
- Routing/native tool docs so agents know when to use these tools.

### Out of scope
- Creating, merging, closing, or editing PRs.
- Publishing packages or changing release state.
- Inventing new benchmark methodology.
- Worktree creation/removal; that belongs to the separate `wp_worktree` lane.

## Public MCP Contracts

All tools return summary-first structured results using existing MCP helper patterns.

```ts
type ReadonlyOpsBase = {
  cwd?: string
  directory?: string
  maxOutputBytes?: number
}

type WpPrStatusInput = ReadonlyOpsBase & {
  branch?: string
  includeChecks?: boolean
  includeReviews?: boolean
}

type WpBenchInput = ReadonlyOpsBase & {
  suite: 'session-memory'
  mode?: 'dry-run' | 'live'
  scenario?: string
}

type WpGainInput = ReadonlyOpsBase & {
  source?: 'session-memory' | 'rtk'
  format?: 'summary' | 'json'
}

type WpReleaseReadinessInput = ReadonlyOpsBase & {
  includePublicReadiness?: boolean
  includeChangesetStatus?: boolean
  includeReferenceParity?: boolean
}
```

`wp_bench` defaults to dry-run unless live execution is explicit.

## Side-effect Classification

| Tool | Side effects | Safety rule |
| ---- | ------------ | ----------- |
| `wp_pr_status` | Read-only remote/local query | No PR mutation; tolerate missing `gh` |
| `wp_bench` | May write benchmark output artifacts/caches | Default dry-run; live mode explicit |
| `wp_gain` | Read-only report generation | No hidden persistence beyond existing CLI behavior |
| `wp_release_readiness` | Read-only checks | Must not publish, tag, version, or merge |

## Tasks

### Task 1: Shared read-only command adapter

- [ ] **Status:** todo
- **Depends:** None
- **Files:** MCP tool helpers and tests
- **Steps:** Add bounded command execution with structured stdout/stderr, reuse result helpers/redaction, and test truncation, command failure, missing binary, and cwd handling.
- **Acceptance:** New tools can call existing CLI surfaces without unbounded output or throws.

### Task 2: PR status and release readiness tools

- [ ] **Status:** todo
- **Depends:** Task 1
- **Files:** `src/mcp/tools/*`, registry, server tests
- **Steps:** Implement `wp_pr_status`, refactor/import public readiness checks where practical, and implement `wp_release_readiness` as read-only aggregation.
- **Acceptance:** Agents get one structured status object for PR/check/release decisions.

### Task 3: Bench and gain tools

- [ ] **Status:** todo
- **Depends:** Task 1
- **Files:** bench/gain MCP tools, registry, tests
- **Steps:** Wrap `wp bench session-memory` with dry-run default and wrap existing gain reporting with summary output.
- **Acceptance:** Agents can collect benchmark and gain evidence without ad hoc shell parsing.

### Task 4: Routing and docs

- [ ] **Status:** todo
- **Depends:** Tasks 2, 3
- **Files:** routing block, generated tool names, docs/tests
- **Steps:** Advertise new read-only MCP tools, test tool listing, and document when shell remains appropriate.
- **Acceptance:** Tool routing is explicit and does not overclaim MCP coverage.

## Test Plan

- Unit tests per MCP tool.
- Server integration test for tool advertisement and structured output.
- Routing/native-tool surface tests.
- `vp run blueprints:check`.
- Final implementation PR: `vp run typecheck`, `vp run lint`, affected tests.

## PR Acceptance Criteria

- [ ] All new tools are read-only or explicit about dry-run/live behavior.
- [ ] Missing external CLIs degrade with warnings, not crashes.
- [ ] Outputs are bounded and summary-first.
- [ ] Existing CLI behavior remains unchanged.
