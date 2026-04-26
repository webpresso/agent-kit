---
type: blueprint
status: planned
complexity: XS
created: 2026-04-26
last_updated: 2026-04-26
progress: '0% (0 of 2 tasks completed)'
tags:
  - plugin
  - hooks
  - infra
---

# Harden Plugin Hooks: suppress-stderr and MCP Readiness Sentinel

Foundational hardening for all agent-kit hook entry points. Two issues cause silent plugin failures today: (1) native module initialization writes to fd2 directly, which Claude Code interprets as hook errors, and (2) when the MCP server hasn't started, routing decisions in PreToolUse have no liveness check. This blueprint fixes both.

**Research source:** `docs/research/2026-04-26-context-mode-plugin-architecture.md` — Priority 1 and Priority 2.

## Planning Summary

Both tasks are independent and can be applied in any order. Neither changes observable hook behavior for consumers — they are purely defensive.

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
- **Change:** Create `src/hooks/shared/suppress-stderr.ts` that closes fd2 and reopens it to `os.devNull` (cross-platform). Import it as the very first side-effect import in every hook entry point. ESM evaluates imports depth-first so the first declared import runs first. Pattern: `import '#hooks/shared/suppress-stderr'` as line 2 (after shebang).
- **Verify:** `echo '{}' | node dist/esm/hooks/pretool-guard/index.js` exits 0 with no stderr output even when native modules are present.
- **Acceptance:** all of the following:
  - [ ] `src/hooks/shared/suppress-stderr.ts` closes fd2 and reopens to `devNull`
  - [ ] All 5 hook entry points have `import '#hooks/shared/suppress-stderr'` as first import
  - [ ] `pnpm test` green
  - [ ] Hook bins exit 0 with no stderr on empty stdin

#### [hooks] Task 1.2: MCP readiness sentinel — write on server start, check before routing

- [ ] **Status:** todo
- **Depends on:** —
- **Files:**
  - Create: `src/hooks/shared/mcp-sentinel.ts`
  - Modify: `src/mcp/cli.ts`
  - Modify: `src/hooks/pretool-guard/runner.ts`
- **Change:** `mcp-sentinel.ts` exports `sentinelPath()` → `${tmpdir()}/ak-mcp-ready-${process.ppid}` and `isMcpReady()` → reads PID + `process.kill(pid, 0)` probe (returns false if sentinel absent or PID dead). `src/mcp/cli.ts` writes sentinel (own PID) after `server.connect()` and deletes on SIGTERM/exit. `pretool-guard/runner.ts` calls `isMcpReady()` before any routing that depends on MCP tools being available.
- **Verify:** Run pretool-guard without MCP server active — all tool calls pass through (no false blocks). Run with MCP server — sentinel present, routing decisions work.
- **Acceptance:** all of the following:
  - [ ] `mcp-sentinel.ts` exports `sentinelPath` and `isMcpReady`
  - [ ] `src/mcp/cli.ts` writes/deletes sentinel on connect/exit
  - [ ] `pretool-guard/runner.ts` checks `isMcpReady()` before MCP-dependent routing
  - [ ] `pnpm test` green

## Non-goals

- Does not change hook behavior visible to the consumer
- Does not introduce routing or redirection (that is `pretooluse-dev-command-routing`)
- Does not add new runtime dependencies
