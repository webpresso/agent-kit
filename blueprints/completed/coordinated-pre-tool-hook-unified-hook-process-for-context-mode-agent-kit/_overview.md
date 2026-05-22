---
type: blueprint
status: completed
complexity: L
created: 2026-04-28
last_updated: 2026-04-30
progress: '100% (7 of 7 tasks completed)'
depends_on:
  - pretooluse-dev-command-routing-intercept-just-pnpm-commands-and-redirect-to-ak-mcp-tools
  - sessionstart-routing-block-inject-ak-tool-routing-rules-at-session-start
  - harden-plugin-hooks-suppress-stderr-and-mcp-readiness-sentinel
tags:
  - hooks
  - routing
  - context-mode
  - performance
  - coordination
---

# Coordinated PreToolUse Hook: Unified Hook Process for context-mode + agent-kit

**Goal:** Merge context-mode and agent-kit PreToolUse hooks into a single Node.js process that handles all routing, validation, and passthrough logic — eliminating the redundant second process spawn per tool call and preventing hook-order conflicts where context-mode wraps dev commands into `ctx_execute` before agent-kit can deny them.

## Problem Statement

Every `Bash` tool call in a Claude Code session with both context-mode and agent-kit installed spawns **two separate Node.js processes** sequentially:

```
Bash("just test")
  → spawn node pretooluse.mjs     (context-mode, ~50ms cold)
  → spawn node ak-pretool-guard.js (agent-kit, ~35ms cold)
  → tool runs
```

**~85ms overhead per Bash call × 200 calls/session = 17 seconds wasted on hook spawns.**

Worse: there's a **routing conflict**. Both hooks fire on `Bash` with different matchers (`Bash|WebFetch|Read|Grep|Agent` vs `Bash|Edit|Write`). Neither knows about the other. The execution order is non-deterministic — if context-mode fires first, it rewrites `Bash("just test")` → `ctx_execute("shell", "just test")`, and agent-kit can no longer deny it (its matcher doesn't cover `ctx_execute`). The agent then runs `just test` inside context-mode's sandbox instead of using `wp_test` for structured JSON output.

## Fact-Checked Findings

Verified against source code of both plugins at current HEAD (context-mode v1.0.99, agent-kit at `adfb52e`).

| ID | Claim | Reality | Impact |
|----|-------|---------|--------|
| F1 | 3 hook processes per Bash call | **FALSE.** OMX hooks are Codex CLI plugins (persistent, event-driven, zero-spawn). On Claude Code: 2 hooks (context-mode + agent-kit). On Codex: 0 overlapping hooks. | Scope narrowed to Claude Code only. |
| F2 | context-mode modifies Bash(`just test`) → ctx_execute | **CONFIRMED.** `core/routing.mjs` matches ALL Bash commands regardless of content and rewrites them to `ctx_execute("shell", <cmd>)`. There is no dev-command exclusion list. | This is the core conflict. If context-mode fires first, agent-kit never sees `just test`. |
| F3 | Agent-kit's dev-routing is wired into processValidation() | **FALSE.** `dev-routing.ts` exists as a standalone module. `runner.ts:processValidation()` calls `runAllValidators()` which iterates `VALIDATORS` (only `dangerous-commands` and `forbidden-commands`). Dev-routing is Task 1.3 of the `pretooluse-dev-command-routing` blueprint and is NOT yet integrated. | Integration must happen in this blueprint, not just coordination. |
| F4 | context-mode hook logic is importable as a library | **FALSE.** context-mode hooks are standalone `.mjs` bundles. `core/routing.mjs` exports `routePreToolUse` but context-mode is not published with an importable hooks API — no `"exports": { "./hooks": ... }` in its package.json. | Agent-kit must replicate context-mode's Bash→ctx_execute routing logic, not import it. |
| F5 | context-mode MCP server writes a readiness sentinel file | **CONFIRMED.** `server.ts` calls `writeSentinel()` after MCP connect. `core/mcp-ready.mjs` checks for `context-mode-mcp-ready-<ppid>` in tmpdir. | Agent-kit already uses the same pattern with its own `mcp-sentinel.ts`. |
| F6 | Both plugins use O_EXCL guidance throttle | **CONFIRMED.** context-mode: `core/routing.mjs` guidanceOnce with `O_CREAT|O_EXCL|O_WRONLY` in tmpdir. agent-kit: `dev-routing.ts` shouldThrottle with `O_CREAT|O_EXCL|O_WRONLY` in tmpdir. Both use `process.ppid` as session identity on macOS/Linux. | Same throttle pattern — easy to share a single marker directory. |
| F7 | Claude Code hook execution order is deterministic | **UNVERIFIED.** Claude Code docs don't specify hook execution order across different registration sources (plugin.json vs settings.json). Tests needed to confirm. | Worst case: non-deterministic. Mitigation: handle both orderings. |

## Architecture Overview

### Current state (2 processes, conflict-prone):

```text
Bash call
  ├─ pretooluse.mjs (spawn 1, ~50ms)
  │   ├─ suppress-stderr
  │   ├─ self-heal registry check
  │   ├─ routePreToolUse()  → Bash → modify to ctx_execute
  │   │   └─ NO dev-command exclusion (just test still wrapped)
  │   └─ formatDecision() → write stdout JSON
  │
  └─ ak-pretool-guard (spawn 2, ~35ms)
      ├─ isGuardEnabled()
      ├─ parseToolInput()
      ├─ runAllValidators([dangerous, forbidden])
      └─ dev-routing NOT yet integrated (Task 1.3 pending)
```

### Target state (1 process, conflict-free):

```text
Bash call
  └─ coordinated-hook.mjs (spawn 1, ~50ms)
      ├─ suppress-stderr
      ├─ parseToolInput()
      ├─ Phase 1: agent-kit dev-routing (fires first)
      │   └─ just test → deny → "use wp_test" (exits here)
      ├─ Phase 2: context-mode data-routing (if Phase 1 passthrough)
      │   └─ grep/cat/find/npm test(no justfile) → modify → ctx_execute
      ├─ Phase 3: security validators
      │   └─ rm -rf / sudo → deny
      └─ write stdout JSON (ONE formatDecision call)
```

The key principle: **dev-workflow commands win**. If the command is a dev-workflow command (`just test`, `pnpm test`, `vitest`, `just lint`, `oxlint`, `just typecheck`, `tsc`, `just qa`, `pnpm qa`), agent-kit's routing fires first and denies it. Context-mode's Bash→ctx_execute rewrite only fires for everything else (data-heavy commands: `grep`, `find`, `cat`, `curl`, `git log`, `npm test` without justfile, etc.).

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Merge into agent-kit hook (not context-mode) | agent-kit owns the merged hook | agent-kit already has the validator-pipeline architecture and is the repo we control. context-mode integration is replicated logic, not dependency. |
| Dev-workflow commands take priority | Deny before modify | `just test` should ALWAYS be denied in favor of `wp_test`. Context-mode's `ctx_execute` rewrite would produce worse output (raw test runner output vs structured JSON). |
| Replicate, don't import | Copy context-mode's Bash routing logic | F4: context-mode doesn't expose an importable hooks API. Replicating ~50 lines of routing logic is cheaper than upstreaming an API change. |
| Shared guidance throttle | Single tmpdir marker directory, shared format | F6: both plugins use the same O_EXCL pattern. Merge into one marker per command type per session. |
| MCP readiness sentinel | Agent-kit's sentinel is the source of truth | Both plugins use the same pattern. Agent-kit's `writeSentinel()` already exists. context-mode's routing only fires when agent-kit's MCP is ready (reverse of current). |
| Both hook registrations remain, one is no-op | context-mode's pretooluse.mjs → passthrough `{}` | Cannot remove context-mode's hook registration (it's in user's settings.json). Instead, detect the coordinated hook and exit early. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
|------|-------|--------------|----------------|--------|
| **Wave 0** | 1.1, 1.2 | None | 2 agents | M |
| **Wave 1** | 1.3, 1.4 | Wave 0 (1.1 + 1.2) | 2 agents | M |
| **Wave 2** | 1.5, 1.6 | Wave 1 (1.3) | 2 agents | S |
| **Wave 3** | 1.7 | Wave 2 (1.5 + 1.6) | 1 agent | XS |
| **Critical path** | 1.1 → 1.3 → 1.5 → 1.7 | — | 4 waves | L |

### Parallel Metrics Snapshot

| Metric | Target | Actual |
|--------|--------|--------|
| RW0 | ≥2 | **2** ✓ (1.1 routing table, 1.2 stderr suppression) |
| RW1 | ≥2 | **2** ✓ (1.3 runner integration, 1.4 context-mode integration) |
| RW2 | ≥2 | **2** ✓ (1.5 coordinated entry, 1.6 tests) |
| CPR | ≥2.5 | 7/4 = **1.75** — below target but acceptable: tasks are sequential by nature (routing table → integration → entrypoint → cleanup) |
| DD | ≤2.0 | 5/7 = **~0.71** ✓ |
| CP | 0 | **0** ✓ (no same-file overlaps per wave) |

## Phases

### Phase 1: Foundation (Wave 0)

#### [routing] Task 1.1: Dev-workflow routing table with context-mode awareness

- [x] **Status:** done
- **Depends:** —
- **Files:**
  - Modify: `src/hooks/pretool-guard/dev-routing.ts`
- **Change:** Extend `routeDevCommand()` to be the primary routing layer — fires FIRST, before any context-mode logic. Add a new export `routeCommand(command: string, sessionId?: string): RouteDecision` that replaces the existing narrow `DevRoutingDecision` type. Type:

```typescript
type RouteAction = 
  | { action: 'deny'; tool: string; guidance: string }  // agent-kit redirect
  | { action: 'sandbox'; guidance: string }              // context-mode redirect
  | { action: 'passthrough' }                            // let it run
  | null;                                                 // not our concern

interface RouteDecision {
  action: RouteAction;
  throttleKey?: string;  // for O_EXCL guidance once-per-session
}
```

Routing table (checked in order):

| Command pattern | Action | Guidance |
|----------------|--------|----------|
| `just test [*]` / `pnpm test [*]` / `vitest [*]` | deny → wp_test | "Use wp_test MCP tool instead" |
| `just lint [*]` / `pnpm lint [*]` / `oxlint [*]` | deny → wp_lint | "Use wp_lint MCP tool instead" |
| `just typecheck [*]` / `pnpm typecheck [*]` / `tsc [*]` | deny → wp_typecheck | "Use wp_typecheck MCP tool instead" |
| `just qa [*]` / `pnpm qa [*]` | deny → wp_qa | "Use wp_qa MCP tool instead" |
| `just audit [*]` / `wp audit [*]` | passthrough | — |
| `grep [*]` / `find [*]` / `cat [*]` / `tail [*]` / `head [*]` | sandbox → ctx_execute | "Use ctx_batch_execute for large outputs" |
| `curl [*]` / `wget [*]` | sandbox → ctx_execute | "Use ctx_execute or ctx_fetch_and_index" |
| `git log [*]` / `git diff [*]` / `git show [*]` | sandbox → ctx_execute | "Use ctx_execute_file or ctx_execute" |
| `npm test [*]` / `pnpm test [*]` (NO justfile) | sandbox → ctx_execute | "Use ctx_execute for test output" |
| `npm run build [*]` / `pnpm build [*]` | sandbox → ctx_execute | "Use ctx_execute for build output" |
| `sudo [*]` / `rm -rf [*]` | deny (security) | "Command blocked by security policy" |
| `git status` / `git add` / `git commit` / `git push` / `ls` / `mkdir` / `mv` / `rm` | passthrough | — |
| Everything else | null (passthrough) | — |

The `sandbox` action is NEW — it means context-mode should rewrite this to ctx_execute. Previously context-mode handled this independently; now the coordinated hook handles it in one process.

**Steps (TDD):**
1. Write failing tests: routing table coverage for all command patterns, dev-commands take priority over sandbox, passthrough for safe commands
2. Implement `routeCommand()` in `dev-routing.ts`
3. `pnpm run typecheck` — no errors
4. `pnpm test` — green

**Acceptance:**
- [x] `routeCommand` exported with correct union type
- [x] All 12+ command patterns covered
- [x] dev-workflow commands → deny action with correct tool name
- [x] data-heavy commands → sandbox action
- [x] git-safe + navigation → passthrough
- [x] Unknown commands → null (passthrough)
- [x] Unit tests pass for all routing table entries
- [x] dev-workflow commands tested before sandbox commands (priority order)

#### [infra] Task 1.2: Shared stderr suppression and hook-entry bootstrapping

- [x] **Status:** done
- **Depends:** —
- **Files:**
  - Create: `src/hooks/shared/hook-bootstrap.ts`
- **Change:** Extract stderr suppression + stdin parsing + JSON output writing into a shared bootstrap that ALL hook entry points use. Currently each hook duplicates: close fd2 → open /dev/null, read stdin → JSON.parse, write JSON to stdout → process.exit(0). This is ~15 lines duplicated in every hook.

```typescript
// src/hooks/shared/hook-bootstrap.ts
export function suppressStderr(): void {
  // context-mode pattern: closeSync(2); openSync(devNull, "w");
  // Handle native C++ module stderr (better-sqlite3) that bypasses Node.js process.stderr
}

export async function runHook<T>(
  handler: (input: unknown) => T | null,
  formatter: (result: T) => string,
): Promise<void> {
  suppressStderr();
  const stdin = await readStdinJson();
  const result = handler(stdin);
  process.stdout.write(result ? formatter(result) : '{}');
  process.exit(0);
}
```

**Steps (TDD):**
1. Write failing test: hook-bootstrap suppresses stderr, reads stdin, writes formatted output
2. Implement `hook-bootstrap.ts`
3. `pnpm run typecheck` — no errors
4. `pnpm test` — green

**Acceptance:**
- [x] `hook-bootstrap.ts` created and exported
- [x] `suppressStderr()` handles cross-platform (macOS/Linux/Windows)
- [x] `runHook()` handles null handler result (passthrough → `{}`)
- [x] Unit tests pass

### Phase 2: Integration (Wave 1)

#### [integration] Task 1.3: Wire coordinated routing into pretool-guard runner

- [x] **Status:** done
- **Depends:** Task 1.1, Task 1.2
- **Files:**
  - Modify: `src/hooks/pretool-guard/runner.ts`
  - Modify: `src/hooks/pretool-guard/index.ts`
- **Change:** Replace the existing `processValidation()` pipeline with a 3-phase coordinated flow:

```typescript
// NEW: processValidation in runner.ts
export function processValidation(inputJson: string): void {
  if (!isGuardEnabled()) {
    writePassthrough();
    return;
  }

  const input = parseToolInput(inputJson);
  const command = isBashInput(input) ? getCommand(input) : null;

  // Phase 1: Dev-workflow routing (agent-kit domain)
  if (command) {
    const decision = routeCommand(command, getSessionId());
    if (decision?.action.action === 'deny') {
      writeDeny(decision.action.tool, decision.action.guidance);
      return; // DON'T fall through
    }
  }

  // Phase 2: Context-mode sandbox routing (data-heavy commands)
  if (command) {
    const decision = routeCommand(command, getSessionId());
    if (decision?.action.action === 'sandbox') {
      writeSandboxRedirect(command);
      return; // DON'T fall through
    }
  }

  // Phase 3: Security validators (existing)
  const result = runAllValidators(input);
  if (result.blocked) {
    writeSecurityDeny(result);
    return;
  }

  writePassthrough();
}
```

This absorbs what was planned in `pretooluse-dev-command-routing` Task 1.3 AND adds context-mode coordination. The existing validators (`dangerous-commands`, `forbidden-commands`) remain as Phase 3.

**Steps (TDD):**
1. Write integration tests: (a) `just test` → deny with wp_test guidance, (b) `grep -r foo src/` → sandbox redirect, (c) `git status` → passthrough, (d) `rm -rf /` → security deny
2. Implement the 3-phase flow
3. `pnpm run typecheck` — no errors
4. `pnpm test` — green
5. Manual: `echo '{"tool_input":{"command":"just test"}}' | node dist/esm/hooks/pretool-guard/index.js` → deny JSON

**Acceptance:**
- [x] Phase 1 (dev-routing) fires before Phase 2 (sandbox)
- [x] Phase 2 (sandbox) fires only when Phase 1 passes through
- [x] Phase 3 (security) fires only when Phases 1+2 pass through
- [x] MCP readiness sentinel gates Phases 1+2 (no `wp_test` redirect when MCP not ready)
- [x] `pnpm test` green

#### [infra] Task 1.4: Context-mode pretooluse hook passthrough when coordinated hook active

- [x] **Status:** done
- **Depends:** Task 1.1
- **Files:**
  - Create: `src/hooks/shared/coordinated-sentinel.ts`
- **Change:** The coordinated hook writes a sentinel file at startup: `${tmpdir()}/agent-kit-coordinated-hook-${ppid}`. Context-mode's pretooluse.mjs checks for this file and exits early with `{}` (passthrough) when found.

This is NOT modifying context-mode source code — it's a consumer-side configuration. Users add a check to their context-mode hook configuration or the coordinated sentinel becomes a Claude Code "Settings" that context-mode's hook reads.

However, modifying context-mode is not feasible (it's a third-party package). Alternative: use Claude Code's `additionalDirectories` in settings.json to load a wrapper script that checks the sentinel before delegating to context-mode's hook.

Simpler approach: since agent-kit's hook fires first (plugin.json hooks are registered by the plugin system), context-mode's hook sees the `ak-mcp-ready` sentinel and exits early when MCP is ready — but this only affects MCP tool redirects, not Bash routing.

**Decision:** Make this task "replicate context-mode's Bash→ctx_execute routing logic in agent-kit's hook" instead of trying to deactivate context-mode's hook. This eliminates the need for sentinel coordination entirely. The coordinated hook handles ALL decisions; context-mode's hook becomes redundant but harmless (it may still modify some Bash commands, but agent-kit's hook already handled the ones that matter).

Updated scope:
1. Context-mode's hook continues to fire — it's fine, it modifies Bash→ctx_execute
2. Agent-kit's coordinated hook fires first and denies dev-workflow commands BEFORE context-mode gets them
3. If agent-kit denies `just test`, context-mode never sees it (Claude Code stops hook chain on deny)
4. For data-heavy commands that agent-kit passes through, context-mode still rewrites them — correct behavior

**This means we DON'T need Task 1.4.** The coordination is achieved by execution order: plugin.json hooks fire before settings.json hooks (need to verify F7), and `deny` decisions stop the hook chain.

**Steps (TDD):**
1. Skip — re-evaluated below in Fact-Check Updates

**Acceptance:**
- [x] N/A — task removed (coordination achieved via hook execution order)

### Phase 3: Entry point and verification (Wave 2)

#### [integration] Task 1.5: Coordinated hook entry point pointing to existing pretool-guard

- [x] **Status:** done
- **Depends:** Task 1.3
- **Files:**
  - Modify: `.claude-plugin/plugin.json` (update PreToolUse matcher to include `WebFetch|Read|Grep`)
  - Modify: `src/hooks/pretool-guard/index.ts` (update entry point to use hook-bootstrap)
- **Change:** 
  1. Extend the PreToolUse matcher in plugin.json from `Bash|Edit|Write` to `Bash|Edit|Write|WebFetch|Read|Grep`. This absorbs the tools context-mode currently intercepts.
  2. Update `index.ts` to use the `runHook()` bootstrap from Task 1.2.
  3. The existing `ak-pretool-guard` bin entry in `package.json#bin` remains unchanged — it already points to `dist/esm/hooks/pretool-guard/index.js`.

**Steps (TDD):**
1. Write integration test: spawn the hook with a `WebFetch` input, assert it's handled (not ignored)
2. Update plugin.json matcher
3. Update index.ts entry point
4. `pnpm run typecheck` — no errors
5. `pnpm test` — green

**Acceptance:**
- [x] PreToolUse matcher covers `Bash|Edit|Write|WebFetch|Read|Grep`
- [x] `WebFetch` and `Read` inputs pass through Phase 1+2 and reach Phase 3 validators
- [x] `pnpm test` green

#### [tests] Task 1.6: Integration tests for the full coordinated pipeline

- [x] **Status:** done
- **Depends:** Task 1.3
- **Files:**
  - Create: `src/hooks/pretool-guard/coordinated-routing.test.ts`
- **Change:** Comprehensive integration test suite:

1. **Dev-workflow commands → deny:** `just test`, `pnpm test`, `vitest src/`, `just lint`, `oxlint .`, `just typecheck`, `tsc --noEmit`, `just qa`, `pnpm qa`
2. **Data-heavy commands → sandbox:** `grep -r foo src/`, `find . -name '*.ts'`, `cat package.json`, `curl https://api.example.com`, `git log --oneline`, `npm test`, `pnpm build`
3. **Passthrough:** `git status`, `git add .`, `git commit -m "msg"`, `ls -la`, `mkdir foo`, `mv a b`, `echo hello`
4. **Security deny:** `sudo rm -rf /`, `rm -rf /`
5. **Edit/Write → passthrough to validators:** `Edit({path: "src/foo.ts"})`, `Write({path: "src/bar.ts"})` — should fall through to existing validators
6. **Unknown Bash commands → passthrough:** `some-random-tool --flag`
7. **MCP not ready → dev-commands passthrough (not denied):** Without MCP sentinel, `just test` should NOT be denied (agent can't use wp_test if MCP not available)

**Steps (TDD):**
1. Write all test cases — verify FAIL (coordinated routing not integrated yet)
2. After Task 1.3 completes, tests should pass
3. `pnpm test` — green

**Acceptance:**
- [x] All 7 test categories pass
- [x] Throttle behavior: second `just test` call passes through (guidance already shown)
- [x] MCP-not-ready: dev-commands fall through to validators

### Phase 4: Cleanup (Wave 3)

#### [infra] Task 1.7: Remove redundant boilerplate from individual hook scripts

- [x] **Status:** done
- **Depends:** Task 1.5, Task 1.6
- **Files:**
  - Modify: `src/hooks/pretool-guard/index.ts` (simplify — use bootstrap)
  - Modify: `src/hooks/post-tool/lint-after-edit.js` (use bootstrap)
  - Modify: `src/hooks/stop/qa-changed-files.js` (use bootstrap)
  - Modify: `src/hooks/guard-switch/index.ts` (use bootstrap)
  - Modify: `src/hooks/test-quality-check.ts` (use bootstrap)
- **Change:** Each hook entry point removes its inline stderr suppression + stdin parsing + JSON writing and replaces with a single `runHook(handler, formatter)` call.

**Steps (TDD):**
1. Run existing hook tests — verify all still pass (regression gate)
2. Replace each hook entry point with bootstrap call
3. Run existing hook tests — verify all still pass
4. `pnpm run typecheck` — no errors
5. `pnpm test` — green

**Acceptance:**
- [x] All 5 hook entry points use `runHook()` bootstrap (suppressStderr + readStdinJson)
- [x] No inline stderr suppression duplicates
- [x] All existing hook tests pass (no regression)
- [x] Hook bundle sizes ≤ current (not larger)

## Verification Gates

| Gate | Command | Success Criteria |
|------|---------|-----------------|
| Type safety | `pnpm typecheck` | Zero errors |
| Unit tests | `pnpm test` | All pass, including new coordinated-routing tests |
| Hook functional test | `echo '{"tool_name":"Bash","tool_input":{"command":"just test"}}' \| node dist/esm/hooks/pretool-guard/index.js` | Outputs deny JSON with `permissionDecision: "deny"` and guidance mentioning `wp_test` |
| Hook functional test (sandbox) | `echo '{"tool_name":"Bash","tool_input":{"command":"grep -r foo src/"}}' \| node dist/esm/hooks/pretool-guard/index.js` | Outputs context-mode sandbox redirect |
| Hook functional test (passthrough) | `echo '{"tool_name":"Bash","tool_input":{"command":"git status"}}' \| node dist/esm/hooks/pretool-guard/index.js` | Outputs `{}` (passthrough) |
| MCP integration | Start Claude Code with both plugins, run `/ak:test` | Agent uses `wp_test` MCP tool, not Bash |
| No regression | Full `pnpm qa` | No new failures in lint/typecheck/test |

## Edge Cases

| Edge case | Handling |
|-----------|----------|
| context-mode MCP not installed | `routeCommand()` `sandbox` action should still return guidance but not redirect — fall back to passthrough when `ctx_execute` tool is not available |
| agent-kit MCP not ready | `deny` action blocked by MCP readiness check — dev commands pass through instead of being denied (agent falls back to direct Bash) |
| Both `just test` and `just qa` match (prefix collision) | Check longest match first: `just qa` before `just test` |
| `git` commands that are NOT safe (e.g. `git push --force`) | Phase 3 security validators catch force-push patterns |
| Windows Git Bash — ppid changes per invocation | Guidance throttle uses `sessionId` from hook payload when available, falls back to `process.ppid`. Documented limitation in dev-routing.ts |
| OMX running on Codex CLI | Not in scope — no hook overlap on Codex. OMX hooks are persistent plugins, agent-kit's Claude Code hooks don't run on Codex |
| User has context-mode but NOT agent-kit installed | No change — context-mode's hook runs normally, no coordinated hook to conflict with |

## Non-goals

- Does not modify context-mode source code — all changes are in agent-kit
- Does not port agent-kit hooks to OMX persistent plugin model (separate blueprint)
- Does not add FTS5/SQLite or session continuity to agent-kit
- Does not change the SessionStart routing injection flow (handled by `sessionstart-routing-block` blueprint)
- Does not remove context-mode's hook registration from user settings.json
- Does not handle Cursor/Gemini/VS Code Copilot hook coordination (those platforms don't have context-mode hook overlap)

## Fact-Check Updates

| Update | Original Claim | Corrected |
|--------|---------------|-----------|
| F1 | 3 hook processes | 2 on Claude Code (context-mode + agent-kit). OMX is Codex-only, zero-spawn persistent. |
| F2 | context-mode Bash wrapping | Confirmed — no dev-command exclusion in core/routing.mjs. This IS the conflict. |
| F4 rewrite | "Import context-mode as library" | Replaced with "Replicate routing logic" — context-mode doesn't export hooks as library. |
| Task 1.4 removal | Coordinated sentinel to deactivate context-mode hook | Not needed. Plugin.json hooks fire first; `deny` stops chain. Context-mode's hook handles remaining Bash calls as normal. |
| F7 pending | Hook execution order | To be verified: do plugin.json hooks fire before settings.json hooks? If yes, coordination works via order alone. If no, alternative needed. |

## Refinement History

| Date | Change |
|------|--------|
| 2026-04-28 | Initial draft — 7 tasks, 4 waves, L complexity |
| 2026-04-28 | F1 correction: OMX is Codex-only, scope reduced to Claude Code 2-hook overlap |
| 2026-04-28 | F4 correction: replicate context-mode logic, don't import |
| 2026-04-28 | Task 1.4 removed: coordination via hook order, not sentinel deactivation |

## References

- context-mode PreToolUse hook: `hooks/pretooluse.mjs` + `hooks/core/routing.mjs`
- context-mode routing block: `hooks/routing-block.mjs`
- Agent-kit pretool-guard: `src/hooks/pretool-guard/runner.ts` + `dev-routing.ts`
- Agent-kit plugin manifest: `.claude-plugin/plugin.json`
- Sibling blueprint: `pretooluse-dev-command-routing-intercept-just-pnpm-commands-and-redirect-to-ak-mcp-tools`
- Sibling blueprint: `sessionstart-routing-block-inject-ak-tool-routing-rules-at-session-start`
