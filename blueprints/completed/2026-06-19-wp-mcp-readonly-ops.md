---
type: blueprint
title: "Read-only WP MCP operations tools"
owner: ozby
status: completed
complexity: L
created: "2026-06-19"
last_updated: "2026-06-20"
progress: "completed (implementation verified and merged)"
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

#### [adapter] Task 1.1: Shared read-only command adapter

- [x] **Status:** done
- **Depends:** None
- **Files:** `src/mcp/tools/_readonly-ops.ts`, `src/mcp/tools/readonly-ops.test.ts`
- **Steps:** Added shared bounded command normalization over the existing MCP `runCommand`, redaction, truncation, JSON parsing, cwd resolution, missing-binary warnings, and aggregate counts.
- **Acceptance:** New tools call existing CLI surfaces without unbounded output or throws; covered by `readonly-ops.test.ts`.

#### [ops] Task 1.2: PR status and release readiness tools

- [x] **Status:** done
- **Depends:** Task 1
- **Files:** `src/mcp/tools/pr-status.ts`, `src/mcp/tools/release-readiness.ts`, registry, server tests
- **Steps:** Implemented `wp_pr_status` over bounded `gh pr view`/`gh pr checks` and `wp_release_readiness` over existing package-surface, reference-parity, changeset, and public-readiness gates.
- **Acceptance:** Agents get structured read-only status objects for PR/check/release decisions; missing binaries degrade with warnings.

#### [bench] Task 1.3: Bench and gain tools

- [x] **Status:** done
- **Depends:** Task 1
- **Files:** `src/mcp/tools/bench.ts`, `src/mcp/tools/gain.ts`, registry, tests
- **Steps:** Wrapped `wp bench session-memory` with dry-run default unless `mode: live` is explicit, and wrapped Webpresso/RTK gain reporting with bounded summary-first output.
- **Acceptance:** Agents can collect benchmark and gain evidence without ad hoc shell parsing.

#### [routing] Task 1.4: Routing and docs

- [x] **Status:** done
- **Depends:** Tasks 2, 3
- **Files:** `src/hooks/shared/routing-block.ts`, `src/hooks/pretool-guard/dev-routing.ts`, generated-surface tests, server integration tests
- **Steps:** Advertised `wp_pr_status`, `wp_bench`, `wp_gain`, and `wp_release_readiness`; routed raw `gh pr`, `rtk gain`, and release status scripts to structured MCP surfaces while leaving implementation commands as direct CLI fallbacks.
- **Acceptance:** Tool routing is explicit and does not overclaim mutating coverage.

## Test Plan

- Unit tests per MCP tool.
- Server integration test for tool advertisement and structured output.
- Routing/native-tool surface tests.
- `vp run blueprints:check`.
- Final implementation PR: `vp run typecheck`, `vp run lint`, affected tests.

## PR Acceptance Criteria

- [x] All new tools are read-only or explicit about dry-run/live behavior.
- [x] Missing external CLIs degrade with warnings, not crashes.
- [x] Outputs are bounded and summary-first.
- [x] Existing CLI behavior remains unchanged.

## Implementation Evidence

- Added `wp_pr_status`, `wp_bench`, `wp_gain`, and `wp_release_readiness` MCP tools plus the shared bounded `_readonly-ops` helper.
- Registered all four tools in the compiled registry and server advertisement tests.
- Updated routing guidance and pretool routing for PR status, RTK gain, and release-readiness commands.
- Verification on 2026-06-20:
  - `./bin/wp test --file src/mcp/tools/readonly-ops.test.ts --file src/mcp/tools/_registry.test.ts --file src/mcp/server.integration.test.ts --file src/hooks/pretool-guard/dev-routing.test.ts --file src/hooks/shared/routing-block.test.ts --file src/cli/commands/init/scaffold-agent-rules.test.ts --file src/cli/commands/init/scaffold-agents-md.test.ts --file src/cli/commands/init/scaffolders/opencode-plugin/index.test.ts`
  - `vp run typecheck`
  - `vp run lint`
  - `./bin/wp audit tph`
  - `./bin/wp audit blueprint-readme-drift`
  - `./bin/wp audit blueprint-pr-coverage --base origin/main`

### G011 final-review follow-up (2026-06-20)

- `wp_pr_status` now parses `details` only from redacted, bounded stdout so structured JSON cannot bypass the raw-output redaction/truncation budget. Oversized JSON details fail closed with a parse warning instead of returning unbounded parsed payloads.
- `wp_release_readiness` no longer runs `vp run public:readiness` from the read-only MCP tool. `includePublicReadiness: true` is acknowledged with `public_readiness_skipped_not_read_only` so side-effectful readiness remains an explicit shell/CI gate, not a read-only MCP default.
- Regression coverage: `src/mcp/tools/readonly-ops.test.ts`.
