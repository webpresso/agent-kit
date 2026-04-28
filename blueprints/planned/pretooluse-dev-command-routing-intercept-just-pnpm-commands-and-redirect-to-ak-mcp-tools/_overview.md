---
type: blueprint
status: planned
complexity: M
created: 2026-04-26
last_updated: 2026-04-28
progress: '0% (0 of 4 tasks completed)'
depends_on:
  - harden-plugin-hooks-suppress-stderr-and-mcp-readiness-sentinel
  - sessionstart-routing-block-inject-ak-tool-routing-rules-at-session-start
superseded_by:
  - coordinated-pre-tool-hook-unified-hook-process-for-context-mode-agent-kit
tags:
  - plugin
  - hooks
  - routing
  - mcp
---

# PreToolUse Dev-Command Routing: Intercept just/pnpm Commands → ak MCP Tools

> **2026-04-28 update:** Tasks 1.1 (routing table), 1.2 (formatter), and 1.3 (runner integration) are absorbed into [`coordinated-pre-tool-hook`](../coordinated-pre-tool-hook-unified-hook-process-for-context-mode-agent-kit/_overview.md) which merges context-mode + agent-kit routing into one hook process. Task 1.4 (integration tests) remains here as verification. See the coordinated blueprint for the merged routing table including context-mode sandbox rules.

When Claude runs `just test`, `pnpm test`, `just lint`, `just qa`, etc., the PreToolUse hook intercepts and either denies with one-time guidance pointing to `ak_test`/`ak_qa`, or passes through. The result: Claude gets structured `{passed, summary}` JSON with no build log in context, instead of thousands of lines of raw output.

**Research source:** `docs/research/2026-04-26-context-mode-plugin-architecture.md` — Priority 4. Pattern mirrors context-mode's `routing.mjs` + `formatters.mjs` architecture: normalized decision → platform-specific JSON, with O_EXCL guidance throttle per session.

**CRITICAL:** `updatedInput` in PreToolUse only modifies the input to the SAME tool — it cannot redirect a Bash tool call to a different MCP tool. The only viable action is `deny` + `permissionDecisionReason`. There is no `modify` variant.

## Planning Summary

Four tasks in three waves. Wave 0 (parallel): routing logic + formatter. Wave 1 (sequential): integrate into pretool-guard runner. Wave 2: integration tests.

## Quick Reference (Execution Waves)

| Wave | Tasks | Parallelizable |
|------|-------|---------------|
| **Wave 0** | 1.1 (routing rules), 1.2 (formatter) | 2 agents |
| **Wave 1** | 1.3 (integration) | sequential — depends on 1.1 + 1.2 |
| **Wave 2** | 1.4 (tests) | sequential — depends on 1.3 |

## Parallel Metrics

- RW0=2 (2 tasks in Wave 0)
- CPR=4/3=1.33 (4 tasks, 3 waves)
- DD=3/4=0.75 (3 dependency edges among 4 tasks)
- CP=0 (no blocking chain beyond sequential waves)

## Fact-Check Findings

| # | Claim | Status |
|---|-------|--------|
| F1 | `updatedInput` in PreToolUse can redirect Bash to a different MCP tool | **CRITICAL — FALSE.** `updatedInput` modifies input to the same tool only. Cannot redirect tool types. The `modify` action is removed entirely. |
| F2 | `deny` with `permissionDecisionReason` is the correct channel for surfacing guidance to Claude | Verified — Claude reads `permissionDecisionReason` from deny decisions |
| F3 | O_EXCL file creation is atomic on APFS (macOS) | Verified — not atomic on NFS; NFS fallback added |

## Phases

### Phase 1: Routing layer [Complexity: M]

#### [routing] Task 1.1: Dev-command routing rules and guidance throttle

- [ ] **Status:** todo
- **Depends on:** —
- **Files:**
  - Create: `src/hooks/pretool-guard/dev-routing.ts`
- **Change:** Export `routeDevCommand(command: string, sessionId?: string): DevRoutingDecision | null`. Decision type: `{action: 'deny', guidance: string}` | `null` (passthrough). There is NO `modify` variant — `updatedInput` cannot redirect tool types in PreToolUse. Routing fires BEFORE validators (between `parseToolInput` and `runAllValidators` in `processValidation()`). When routing exits, validators never run.

  Routing table (all entries use `{action: 'deny', guidance: ...}` — NO modify action):
  - `just test [*]` / `pnpm test [*]` / `vitest [*]` → `{action: 'deny', guidance: 'Use ak_test MCP tool instead'}`
  - `just lint [*]` / `pnpm lint [*]` / `oxlint [*]` → deny → `ak_lint`
  - `just typecheck [*]` / `pnpm typecheck [*]` / `tsc [*]` → deny → `ak_typecheck`
  - `just qa [*]` / `pnpm qa [*]` → deny → `ak_qa`
  - `just audit [*]` / `ak audit [*]` → passthrough (audit commands are fine to run directly)
  - Everything else → null (passthrough)

  Guidance throttle: use O_EXCL file marker at `${tmpdir()}/ak-routing-guidance-${sessionId ?? process.ppid}-${guidanceType}` — emit guidance only on first intercept per type per session. Subsequent intercepts return `null` (passthrough after warning shown). Non-EEXIST errors from O_EXCL (e.g. NFS does not support O_EXCL) → always-deny (never silent suppression). Never silently swallow non-EEXIST errors.
- **Steps (TDD):**
  1. Write failing tests: routing table coverage, throttle behavior, edge cases (empty command, unknown command, NFS fallback)
  2. Create `src/hooks/pretool-guard/dev-routing.ts` — make tests green
  3. `pnpm run typecheck` — no errors
  4. `pnpm test` — green
  5. Manual: `pnpm run build && echo '{"tool_input":{"command":"just test"}}' | node dist/esm/hooks/pretool-guard/index.js`
- **Verify:** Unit tests cover routing table, throttle behavior, and edge cases (empty command, unknown command).
- **Acceptance:** all of the following:
  - [ ] `routeDevCommand` exported with correct type — NO `modify` variant
  - [ ] All 4 dev command categories covered with `deny` action only
  - [ ] Guidance shown at most once per session per type (O_EXCL throttle)
  - [ ] Non-EEXIST O_EXCL errors → always-deny (NFS fallback)
  - [ ] Unknown commands return `null`
  - [ ] Unit tests pass for routing table and throttle

#### [routing] Task 1.2: Platform formatter for routing decisions

- [ ] **Status:** todo
- **Depends on:** —
- **Files:**
  - Create: `src/hooks/pretool-guard/routing-formatter.ts`
- **Change:** Export `formatRoutingDecision(decision: DevRoutingDecision | null): string` — converts normalized decision to Claude Code's `hookSpecificOutput` JSON string written to stdout. Shape:
  - `deny` → `{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: guidance } }`
  - `null` decision → write `{}` (passthrough)

  There is NO `modify` case — the formatter only handles `{action: 'deny'}` and null. The `modify`/`updatedInput` action is removed entirely as it cannot redirect tool types.
- **Steps (TDD):**
  1. Write failing tests: deny output shape, null passthrough shape
  2. Create `src/hooks/pretool-guard/routing-formatter.ts` — make tests green
  3. `pnpm run typecheck` — no errors
  4. `pnpm test` — green
- **Verify:** Output is valid JSON parseable by `JSON.parse`.
- **Acceptance:** all of the following:
  - [ ] `formatRoutingDecision` exported and typed
  - [ ] Deny output has correct `permissionDecision: 'deny'` shape
  - [ ] No `modify`/`updatedInput` handling — removed entirely
  - [ ] Unit tests for deny and null decision types

#### [integration] Task 1.3: Integrate routing into pretool-guard runner

- [ ] **Status:** todo
- **Depends on:** Task 1.1, Task 1.2
- **Files:**
  - Modify: `src/hooks/pretool-guard/runner.ts`
- **Change:** In `processValidation()`, insert routing after the `if (!isGuardEnabled())` check and BEFORE the `runAllValidators()` call. If `isBashInput(input)` and `isMcpReady()`, call `routeDevCommand(command, sessionId)`. If decision is non-null, write `formatRoutingDecision(decision)` to stdout and `process.exit(0)` — do not run validators. If MCP not ready or decision is null, fall through to existing validator pipeline unchanged.
- **Steps (TDD):**
  1. Write failing integration tests: (a) `just test` with MCP sentinel present → deny JSON, (b) `just test` without MCP sentinel → falls through to validators, (c) `git status` → falls through (passthrough)
  2. Update `src/hooks/pretool-guard/runner.ts` — make tests green
  3. `pnpm run typecheck` — no errors
  4. `pnpm test` — green
  5. Manual: `pnpm run build && echo '{"tool_input":{"command":"just test"}}' | node dist/esm/hooks/pretool-guard/index.js`
- **Verify:** Run `echo '{"tool_input":{"command":"just test"}}' | node dist/esm/hooks/pretool-guard/index.js` with MCP sentinel present — should output deny JSON. Without sentinel — should pass through to validators.
- **Acceptance:** all of the following:
  - [ ] Routing inserted after `if (!isGuardEnabled())`, before `runAllValidators()`
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

- Does not implement `updatedInput` MCP tool rewriting — this approach is architecturally impossible (updatedInput cannot redirect tool types)
- Does not intercept Read/WebFetch/Grep (those are context-mode's domain, not dev tools)
- Does not add FTS5 or output sandboxing
- Does not change existing forbidden-commands or dangerous-commands validators

## Edge Cases

- **No `just` binary needed in tests:** Routing checks the command string pattern, not whether the binary exists. Tests can pass any string without `just` installed.
- **tmpdir marker accumulation:** O_EXCL markers in tmpdir are never cleaned up. On long-running systems, `ak-routing-guidance-*` files accumulate. This is acceptable — they are tiny and tmpdir is cleaned on reboot. A future cleanup pass on session end is out of scope for this blueprint.

## Risks

- O_EXCL guidance throttle relies on `process.ppid` as session identity on macOS/Linux. On Windows Git Bash each hook invocation may have a different ppid — fall back to no throttle (always show guidance) on Windows rather than never showing it.
- NFS volumes do not support O_EXCL atomicity. Non-EEXIST errors from O_EXCL must always-deny (never silent suppression) to avoid routing bypass on NFS.
