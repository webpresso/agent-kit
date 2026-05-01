---
type: blueprint
status: completed
complexity: XS
created: 2026-04-26
last_updated: 2026-05-01
progress: '100% (2 of 2 tasks completed)'
depends_on: []
superseded_by:
  - coordinated-pre-tool-hook-unified-hook-process-for-context-mode-agent-kit
tags:
  - plugin
  - hooks
  - infra
---

# Harden Plugin Hooks: suppress-stderr and MCP Readiness Sentinel

> **2026-04-28 update:** Task 1.1 (stderr suppression) is absorbed into the coordinated blueprint's [Task 1.2](../coordinated-pre-tool-hook-unified-hook-process-for-context-mode-agent-kit/_overview.md#infra-task-12-shared-stderr-suppression-and-hook-entry-bootstrapping) which provides a shared `hook-bootstrap.ts` used by all hook entry points. Task 1.2 (MCP readiness sentinel) remains here.

Foundational hardening for all agent-kit hook entry points. Two issues cause silent plugin failures today: (1) native module initialization writes to fd2 directly, which Claude Code interprets as hook errors, and (2) when the MCP server hasn't started, routing decisions in PreToolUse have no liveness check. This blueprint fixes both.

**Research source:** `docs/research/2026-04-26-context-mode-plugin-architecture.md` — Priority 1 and Priority 2.

## Planning Summary

Both tasks are independent and can be applied in any order. Neither changes observable hook behavior for consumers — they are purely defensive.

## Quick Reference (Execution Waves)

| Wave | Tasks | Parallelizable |
|------|-------|---------------|
| **Wave 0** | 1.1 (suppress-stderr), 1.2 (MCP sentinel) | 2 agents |

## Parallel Metrics

- RW0=2 (2 tasks in Wave 0)
- CPR=2/1=2.0 (2 tasks, 1 wave)
- DD=0/2=0.0 (0 dependency edges among 2 tasks)
- CP=0 (no blocking chain)

## Fact-Check Findings

| # | Claim | Status |
|---|-------|--------|
| F1 | ESM imports are evaluated depth-first, so first declared import runs first | Verified |
| F2 | `process.ppid` is unreliable on Windows — different ppid per hook invocation | Verified — affects isMcpReady() |
| F3 | `ESRCH` error from `process.kill(pid, 0)` means process not found | Verified — must return false, not throw |
| F4 | `os.devNull` is cross-platform (`/dev/null` on Unix, `nul` on Windows) | Verified |

## Phases

### Phase 1: Suppress-stderr and MCP sentinel [Complexity: XS]

#### [hooks] Task 1.1: Add suppress-stderr as first import in all hook entry points

- [ ] **Status:** todo
- **Depends on:** —
- **Files:**
  - Create: `src/hooks/shared/suppress-stderr.ts`
  - Modify: `src/hooks/pretool-guard/index.ts`
  - Modify: `src/hooks/post-tool/lint-after-edit.ts`
  - Modify: `src/hooks/guard-switch/index.ts`
  - Modify: `src/hooks/stop/qa-changed-files.ts`
  - Modify: `src/hooks/sessionstart/index.ts`
  - Modify: `src/hooks/test-quality-check.ts`
- **Change:** Create `src/hooks/shared/suppress-stderr.ts` that closes fd2 and reopens it to `os.devNull` (cross-platform). Import it as the very first side-effect import in every hook entry point. ESM evaluates imports depth-first so the first declared import runs first. Pattern: `import '#hooks/shared/suppress-stderr'` as line 2 (after shebang).
- **Steps (TDD):**
  1. Write failing test: spawn a hook entry point with an empty stdin and assert stderr is empty
  2. Create `src/hooks/shared/suppress-stderr.ts` — make test green
  3. Add `import '#hooks/shared/suppress-stderr'` to all 6 entry points
  4. `pnpm run typecheck` — no errors
  5. `pnpm test` — green
  6. Manual verify: `echo '{}' | node dist/esm/hooks/pretool-guard/index.js` exits 0 with no stderr
- **Verify:** `echo '{}' | node dist/esm/hooks/pretool-guard/index.js` exits 0 with no stderr output even when native modules are present.
- **Acceptance:** all of the following:
  - [ ] `src/hooks/shared/suppress-stderr.ts` closes fd2 and reopens to `devNull`
  - [ ] All 6 hook entry points have `import '#hooks/shared/suppress-stderr'` as first import
  - [ ] `pnpm test` green
  - [ ] Hook bins exit 0 with no stderr on empty stdin

#### [hooks] Task 1.2: MCP readiness sentinel — write on server start, check before routing

- [x] **Status:** done
- **Depends on:** —
- **Files:**
  - Create: `src/hooks/shared/mcp-sentinel.ts`
  - Modify: `src/mcp/cli.ts`
- **Change:** `mcp-sentinel.ts` exports `sentinelPath()` → `${tmpdir()}/ak-mcp-ready-${process.ppid}` and `isMcpReady()` → reads PID + `process.kill(pid, 0)` probe (returns false if sentinel absent or PID dead). `isMcpReady()` returns false on Windows (`process.platform === 'win32'`) because `process.ppid` is unreliable there. `process.kill(pid, 0)` may throw `ESRCH` if the process is not found — catch `ESRCH` and return false (do not rethrow). `src/mcp/cli.ts` writes sentinel (own PID) after `server.connect()` and deletes on SIGTERM/exit.

  Note: `src/hooks/pretool-guard/runner.ts` wiring is done by the downstream `pretooluse-dev-command-routing` blueprint Task 1.3, not here.
- **Steps (TDD):**
  1. Write failing tests: `isMcpReady()` returns false when no sentinel file, returns false for dead PID, returns false on Windows platform, handles ESRCH without throwing
  2. Create `src/hooks/shared/mcp-sentinel.ts` — make tests green
  3. Update `src/mcp/cli.ts` to write/delete sentinel
  4. `pnpm run typecheck` — no errors
  5. `pnpm test` — green
  6. Manual verify: `echo '{}' | node dist/esm/hooks/pretool-guard/index.js` with and without MCP server
- **Verify:** Run pretool-guard without MCP server active — all tool calls pass through (no false blocks). Run with MCP server — sentinel present, routing decisions work.
- **Acceptance:** all of the following:
  - [x] `mcp-sentinel.ts` exports `sentinelPath` and `isMcpReady`
  - [x] `isMcpReady()` returns false on `process.platform === 'win32'`
  - [x] `isMcpReady()` catches ESRCH and returns false (not throw)
  - [x] `src/mcp/cli.ts` writes/deletes sentinel on connect/exit
  - [x] `pnpm test` green

## Non-goals

- Does not change hook behavior visible to the consumer
- Does not introduce routing or redirection (that is `pretooluse-dev-command-routing`)
- Does not add new runtime dependencies
- Does not wire `isMcpReady()` into `pretool-guard/runner.ts` (that is `pretooluse-dev-command-routing` Task 1.3)

## Risks

- **Windows ppid unreliability:** On Windows, each hook invocation spawns in a new process with a different ppid. `sentinelPath()` based on ppid will never match across invocations. `isMcpReady()` explicitly returns false on Windows to avoid false positives — routing simply falls through on Windows until a cross-platform session-id strategy is added.
- **Sentinel stale after SIGKILL:** If the MCP server is killed with SIGKILL (no cleanup), the sentinel file remains. The PID probe (`process.kill(pid, 0)`) handles this: if the PID has been recycled to a different process, it will return true (false positive). Mitigation: sentinel content should be checked for process name or start time if this becomes a real issue.
- **tmpdir PID wrap on multi-user systems:** On shared hosts where PIDs wrap rapidly (e.g. containerized CI), two different MCP server processes from different users could share the same ppid value, causing a stale-hit false positive. The sentinel file is in tmpdir which is typically per-user, so this is only a risk if tmpdir itself is shared.
