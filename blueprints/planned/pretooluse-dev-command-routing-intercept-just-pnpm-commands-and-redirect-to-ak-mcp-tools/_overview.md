---
type: blueprint
status: planned
complexity: M
created: 2026-04-26
last_updated: 2026-04-26
progress: '0% (0 of 4 tasks completed)'
depends_on:
  - harden-plugin-hooks-suppress-stderr-and-mcp-readiness-sentinel
  - sessionstart-routing-block-inject-ak-tool-routing-rules-at-session-start
tags:
  - plugin
  - hooks
  - routing
  - mcp
---

# PreToolUse Dev-Command Routing: Intercept just/pnpm Commands → ak MCP Tools

When Claude runs `just test`, `pnpm test`, `just lint`, `just qa`, etc., the PreToolUse hook intercepts, checks MCP liveness, and either redirects (via `updatedInput` rewrite to MCP tool call) or denies with one-time guidance pointing to `ak_test`/`ak_qa`. The result: Claude gets structured `{passed, summary}` JSON with no build log in context, instead of thousands of lines of raw output.

**Research source:** `docs/research/2026-04-26-context-mode-plugin-architecture.md` — Priority 4. Pattern mirrors context-mode's `routing.mjs` + `formatters.mjs` architecture: normalized decision → platform-specific JSON, with O_EXCL guidance throttle per session.

## Planning Summary

Four tasks in two waves. Wave 1 (parallel): routing logic + formatter. Wave 2 (sequential): integrate into pretool-guard + tests.

## Quick Reference (Execution Waves)

| Wave | Tasks | Parallelizable |
|------|-------|---------------|
| **Wave 1** | 1.1 (routing rules), 1.2 (formatter) | 2 agents |
| **Wave 2** | 1.3 (integration), 1.4 (tests) | sequential |

## Phases

### Phase 1: Routing layer [Complexity: M]

#### [routing] Task 1.1: Dev-command routing rules and guidance throttle

- [ ] **Status:** todo
- **Depends on:** —
- **Files:**
  - Create: `src/hooks/pretool-guard/dev-routing.ts`
- **Change:** Export `routeDevCommand(command: string, sessionId?: string): DevRoutingDecision | null`. Decision types: `{action: 'deny', guidance: string}` | `{action: 'modify', updatedInput: Record<string, unknown>}` | `null` (passthrough). Routing table:
  - `just test [*]` / `pnpm test [*]` / `vitest [*]` → `{action: 'deny', guidance: 'Use ak_test MCP tool instead'}`
  - `just lint [*]` / `pnpm lint [*]` / `oxlint [*]` → deny → `ak_lint`
  - `just typecheck [*]` / `pnpm typecheck [*]` / `tsc [*]` → deny → `ak_typecheck`
  - `just qa [*]` / `pnpm qa [*]` → deny → `ak_qa`
  - `just audit [*]` / `ak audit [*]` → passthrough (audit commands are fine to run directly)
  - Everything else → null (passthrough)
  - Guidance throttle: use O_EXCL file marker at `${tmpdir()}/ak-routing-guidance-${sessionId ?? process.ppid}-${guidanceType}` — emit guidance only on first intercept per type per session. Subsequent intercepts return `null` (passthrough after warning shown).
- **Verify:** Unit tests cover routing table, throttle behavior, and edge cases (empty command, unknown command).
- **Acceptance:** all of the following:
  - [ ] `routeDevCommand` exported with correct type
  - [ ] All 4 dev command categories covered
  - [ ] Guidance shown at most once per session per type (O_EXCL throttle)
  - [ ] Unknown commands return `null`
  - [ ] Unit tests pass for routing table and throttle

#### [routing] Task 1.2: Platform formatter for routing decisions

- [ ] **Status:** todo
- **Depends on:** —
- **Files:**
  - Create: `src/hooks/pretool-guard/routing-formatter.ts`
- **Change:** Export `formatRoutingDecision(decision: DevRoutingDecision): string` — converts normalized decision to Claude Code's `hookSpecificOutput` JSON string written to stdout. Shape:
  - `deny` → `{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: guidance } }`
  - `modify` → `{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'Routed to ak MCP tool', updatedInput } }`
  - Null decision → write `{}` (passthrough)
- **Verify:** Output is valid JSON parseable by `JSON.parse`.
- **Acceptance:** all of the following:
  - [ ] `formatRoutingDecision` exported and typed
  - [ ] Deny output has correct `permissionDecision: 'deny'` shape
  - [ ] Modify output has `updatedInput` and `permissionDecision: 'allow'`
  - [ ] Unit tests for each decision type

#### [integration] Task 1.3: Integrate routing into pretool-guard runner

- [ ] **Status:** todo
- **Depends on:** Task 1.1, Task 1.2
- **Files:**
  - Modify: `src/hooks/pretool-guard/runner.ts`
- **Change:** In `processValidation()`, before running validators: if `isBashInput(input)` and `isMcpReady()`, call `routeDevCommand(command, sessionId)`. If decision is non-null, write `formatRoutingDecision(decision)` to stdout and `process.exit(0)` — do not run validators. If MCP not ready or decision is null, fall through to existing validator pipeline unchanged.
- **Verify:** Run `echo '{"tool_input":{"command":"just test"}}' | node dist/esm/hooks/pretool-guard/index.js` with MCP sentinel present — should output deny JSON. Without sentinel — should pass through to validators.
- **Acceptance:** all of the following:
  - [ ] Routing fires before validators when MCP ready and command matches
  - [ ] Falls through to validators when MCP not ready
  - [ ] Falls through to validators for non-matching commands
  - [ ] `pnpm test` green
  - [ ] Integration test covering both code paths

#### [tests] Task 1.4: Integration tests for full routing pipeline

- [ ] **Status:** todo
- **Depends on:** Task 1.3
- **Files:**
  - Create: `src/hooks/pretool-guard/dev-routing.test.ts`
  - Modify: `src/hooks/pretool-guard/runner.test.ts`
- **Change:** Add test cases: (a) `just test` with MCP ready → deny output, (b) `just test` without MCP ready → validator output, (c) `git status` → validator output (passthrough), (d) guidance throttle — second `just test` call passes through after first showed guidance.
- **Verify:** `pnpm test` green across all new cases.
- **Acceptance:** all of the following:
  - [ ] 4 test cases above implemented and passing
  - [ ] Throttle behavior verified in tests (not just smoke-tested)
  - [ ] `pnpm test` green

## Non-goals

- Does not implement `updatedInput` MCP tool rewriting in Phase 1 — deny + guidance is sufficient; rewriting is future optimization
- Does not intercept Read/WebFetch/Grep (those are context-mode's domain, not dev tools)
- Does not add FTS5 or output sandboxing
- Does not change existing forbidden-commands or dangerous-commands validators

## Risks

- O_EXCL guidance throttle relies on `process.ppid` as session identity on macOS/Linux. On Windows Git Bash each hook invocation may have a different ppid — fall back to no throttle (always show guidance) on Windows rather than never showing it.
