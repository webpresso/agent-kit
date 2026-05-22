---
type: blueprint
status: completed
complexity: S
created: 2026-04-26
last_updated: 2026-04-30
progress: '100% (2 of 2 tasks completed)'
depends_on:
  - harden-plugin-hooks-suppress-stderr-and-mcp-readiness-sentinel
  - coordinated-pre-tool-hook-unified-hook-process-for-context-mode-agent-kit
tags:
  - plugin
  - hooks
  - routing
  - context-mode
---

> **2026-04-28 update:** Task 1.1 (routing-block.ts) must now include context-mode tool references in the `<wp_routing>` XML block — a coordinated decision table showing when to use `wp_*` vs `ctx_*` tools. The coordinated blueprint eliminates the PreToolUse conflict this blueprint relied on; the routing block should reflect the unified routing table from the coordinated blueprint.

# SessionStart Routing Block: Inject wp_* Tool Routing Rules at Session Start

Update the `ak-sessionstart-routing` hook to inject an `<wp_routing>` XML block alongside `.agent/routing.md` content at session start. This block tells Claude — before it tries anything — to use `wp_test`, `wp_lint`, `wp_qa`, `wp_typecheck`, `wp_audit` instead of raw shell commands. The model learns the routing rules once per session from `additionalContext`, keeping all subsequent tool calls clean.

**Research source:** `docs/research/2026-04-26-context-mode-plugin-architecture.md` — Priority 3. Context-mode does this via `createRoutingBlock()` in `routing-block.mjs`, injected at SessionStart.

## Planning Summary

Two tasks: (1) define the routing block content, (2) integrate it into the sessionstart hook output. The routing block uses XML (not markdown) to signal structural instruction vs prose context to the model.

## Quick Reference (Execution Waves)

| Wave | Tasks | Parallelizable |
|------|-------|---------------|
| **Wave 0** | 1.1 (routing block content) | 1 agent |
| **Wave 1** | 1.2 (hook integration) | 1 agent — depends on 1.1 |

## Parallel Metrics

- RW0=1 (1 task in Wave 0)
- CPR=2/2=1.0 (2 tasks, 2 waves)
- DD=0.5 (1 dependency edge among 2 tasks)
- CP=0 (no blocking chain beyond Wave 1 dependency)

## Fact-Check Findings

| # | Claim | Status |
|---|-------|--------|
| F1 | `additionalContext` shape is `{ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: string } }` | Verified |
| F2 | XML vs markdown for routing block — XML signals structural instruction vs prose to the model | Convention only — no published evidence; adopted as working assumption |
| F3 | `compact` is a valid SessionStart `source` value — routing block is lost after compaction | **CRITICAL gap** — plugin.json matcher must include `compact` |
| F4 | `process.exit(0)` required for Node.js hooks to signal clean completion | Verified |
| F5 | MCP tool names are `wp_test`, `wp_lint`, `wp_typecheck`, `wp_qa`, `wp_audit` | Verified |

## Phases

### Phase 1: Routing block content and hook integration [Complexity: S]

#### [hooks] Task 1.1: Define ak-routing XML block in shared module

- [x] **Status:** done
- **Depends on:** —
- **Files:**
  - Create: `src/hooks/shared/routing-block.ts`
- **Change:** Export `WP_ROUTING_BLOCK: string` — an XML string injected into every session. Content:
  - Which tools to prefer (`wp_test`, `wp_lint`, `wp_typecheck`, `wp_qa`, `wp_audit`)
  - Context-mode tools and when to use them (`ctx_execute` for data-heavy shell commands, `ctx_search` for indexed content, `ctx_fetch_and_index` for web, `ctx_batch_execute` for combined research)
  - Decision table: dev-workflow commands → `wp_*` MCP tools; data-processing commands → `ctx_*` sandbox tools
  - Which commands are forbidden as alternatives (`just test`, `pnpm test`, `just lint`, `just qa`, `vitest`, `oxlint`, `tsc`)
  - Response format guidance: return `{passed, summary}` shape, not raw output
  - Output constraint: keep responses under 200 words, cite file paths not logs; follow context-mode's caveman output style
  - Fallback: when MCP unavailable, use `just` recipes and expect output to be brief
- **Steps (TDD):**
  1. Write failing test: import `WP_ROUTING_BLOCK` and assert it is non-empty, contains `<wp_routing>`, and is parseable as XML
  2. Create `src/hooks/shared/routing-block.ts` — make test green
  3. `pnpm run typecheck` — no errors
  4. `pnpm test` — green
- **Verify:** Import the module and print the block — should be valid XML with no newlines breaking the structure.
- **Acceptance:** all of the following:
  - [x] `src/hooks/shared/routing-block.ts` exported and typed
  - [x] Block includes tool routing rules for all 5 `wp_*` MCP tools
  - [x] Block includes forbidden-alternatives list
  - [x] Block includes output format constraint

#### [hooks] Task 1.2: Inject routing block into sessionstart additionalContext

- [x] **Status:** done
- **Depends on:** Task 1.1
- **Files:**
  - Modify: `src/hooks/sessionstart/index.ts`
  - Modify: `.claude-plugin/plugin.json`
- **Change:** Prepend `WP_ROUTING_BLOCK` to the `additionalContext` output — before the `.agent/routing.md` content. The combined string is `WP_ROUTING_BLOCK + '\n\n' + routingMdContent`. `buildOutput()` must ALWAYS emit (never return null) — even when `.agent/routing.md` is absent, emit the routing block alone (do not return null). Output shape: `JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: combined } })` written to stdout, then `process.exit(0)`.

  Also update `.claude-plugin/plugin.json` to extend the SessionStart hook matcher from `startup|resume` to `startup|resume|compact` — the `compact` source is a valid SessionStart value and without this the routing block is silently dropped after every compaction.
- **Steps (TDD):**
  1. Write failing tests: (a) emits routing block when `.agent/routing.md` absent, (b) prepends block when `.agent/routing.md` present, (c) output is valid JSON with `additionalContext` field, (d) `source: 'compact'` triggers hook (via plugin.json change)
  2. Update `src/hooks/sessionstart/index.ts` — make tests green
  3. Update `.claude-plugin/plugin.json` matcher
  4. `pnpm run typecheck` — no errors
  5. `pnpm test` — green
  6. Manual: `echo '{"source":"startup"}' | node dist/esm/hooks/sessionstart/index.js | python3 -m json.tool` shows `additionalContext` containing `<wp_routing>`
- **Verify:** Run `echo '{"source":"startup"}' | node dist/esm/hooks/sessionstart/index.js` — stdout should contain the `<wp_routing>` XML block and exit 0.
- **Acceptance:** all of the following:
  - [x] SessionStart hook always emits `additionalContext` with `<wp_routing>` block
  - [x] Block appears even when `.agent/routing.md` is absent
  - [x] `.claude-plugin/plugin.json` matcher includes `compact` source
  - [x] `pnpm test` green (2055 passed)
  - [x] Manual: `echo '{"source":"startup"}' | node dist/esm/hooks/sessionstart/index.js | python3 -m json.tool` shows `additionalContext` containing `<wp_routing>`

## Non-goals

- Does not add PreToolUse interception (that is `pretooluse-dev-command-routing`)
- Does not use FTS5/SQLite
- Does not change `.agent/routing.md` content or format

## Risks

- **Routing block repeated per compaction (token cost):** With `compact` included in the matcher, every compaction re-injects the routing block. If compactions are frequent (e.g. large sessions with many tool calls), this adds ~200-400 tokens per compaction. Acceptable for now; can be optimized by tracking injection state if cost becomes material.
- **MCP tools not available when block fires:** The routing block fires at SessionStart, before the MCP server has connected. Claude receives the routing instructions but cannot immediately verify `wp_*` tools are available. This is intentional — the block sets expectations; actual MCP availability is enforced at PreToolUse time by the `pretooluse-dev-command-routing` blueprint.
