---
type: blueprint
status: planned
complexity: S
created: 2026-04-26
last_updated: 2026-04-26
progress: '0% (0 of 2 tasks completed)'
depends_on:
  - harden-plugin-hooks-suppress-stderr-and-mcp-readiness-sentinel
tags:
  - plugin
  - hooks
  - routing
---

# SessionStart Routing Block: Inject ak_* Tool Routing Rules at Session Start

Update the `ak-sessionstart-routing` hook to inject an `<ak_routing>` XML block alongside `.agent/routing.md` content at session start. This block tells Claude — before it tries anything — to use `ak_test`, `ak_lint`, `ak_qa`, `ak_typecheck`, `ak_audit` instead of raw shell commands. The model learns the routing rules once per session from `additionalContext`, keeping all subsequent tool calls clean.

**Research source:** `docs/research/2026-04-26-context-mode-plugin-architecture.md` — Priority 3. Context-mode does this via `createRoutingBlock()` in `routing-block.mjs`, injected at SessionStart.

## Planning Summary

Two tasks: (1) define the routing block content, (2) integrate it into the sessionstart hook output. The routing block uses XML (not markdown) to signal structural instruction vs prose context to the model.

## Phases

### Phase 1: Routing block content and hook integration [Complexity: S]

#### [hooks] Task 1.1: Define ak-routing XML block in shared module

- [ ] **Status:** todo
- **Depends on:** —
- **Files:**
  - Create: `src/hooks/shared/routing-block.ts`
- **Change:** Export `AK_ROUTING_BLOCK: string` — an XML string injected into every session. Content:
  - Which tools to prefer (`ak_test`, `ak_lint`, `ak_typecheck`, `ak_qa`, `ak_audit`)
  - Which commands are forbidden as alternatives (`just test`, `pnpm test`, `just lint`, `just qa`, `vitest`, `oxlint`, `tsc`)
  - Response format guidance: return `{passed, summary}` shape, not raw output
  - Output constraint: keep responses under 200 words, cite file paths not logs
  - Fallback: when MCP unavailable, use `just` recipes and expect output to be brief
- **Verify:** Import the module and print the block — should be valid XML with no newlines breaking the structure.
- **Acceptance:** all of the following:
  - [ ] `src/hooks/shared/routing-block.ts` exported and typed
  - [ ] Block includes tool routing rules for all 5 `ak_*` MCP tools
  - [ ] Block includes forbidden-alternatives list
  - [ ] Block includes output format constraint

#### [hooks] Task 1.2: Inject routing block into sessionstart additionalContext

- [ ] **Status:** todo
- **Depends on:** Task 1.1
- **Files:**
  - Modify: `src/hooks/sessionstart/index.ts`
- **Change:** Prepend `AK_ROUTING_BLOCK` to the `additionalContext` output — before the `.agent/routing.md` content. The combined string is `AK_ROUTING_BLOCK + '\n\n' + routingMdContent`. If `.agent/routing.md` is absent, emit the routing block alone (do not return null). Output shape: `JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: combined } })` written to stdout, then `process.exit(0)`.
- **Verify:** Run `echo '{"source":"startup"}' | node dist/esm/hooks/sessionstart/index.js` — stdout should contain the `<ak_routing>` XML block and exit 0.
- **Acceptance:** all of the following:
  - [ ] SessionStart hook always emits `additionalContext` with `<ak_routing>` block
  - [ ] Block appears even when `.agent/routing.md` is absent
  - [ ] `pnpm test` green
  - [ ] Manual: `echo '{"source":"startup"}' | node dist/esm/hooks/sessionstart/index.js | python3 -m json.tool` shows `additionalContext` containing `<ak_routing>`

## Non-goals

- Does not add PreToolUse interception (that is `pretooluse-dev-command-routing`)
- Does not use FTS5/SQLite
- Does not handle session continuity or resume (those are future scope)
- Does not change `.agent/routing.md` content or format
