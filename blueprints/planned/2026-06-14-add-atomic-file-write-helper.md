---
type: blueprint
title: Add atomic file write helper
owner: ozby
status: planned
complexity: S
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/4 tasks done, 0 blocked)'
depends_on:
  - 2026-06-14-shared-filesystem-io-utilities
cross_repo_depends_on: []
tags:
  - reliability
  - filesystem
  - crash-safety
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Add atomic file write helper

**Goal:** Replace direct `writeFileSync`/`writeJsonFile` calls in code paths that may be interrupted with an atomic `write-tmp → fsync → rename` pattern so a crash never leaves a half-written file at the canonical path.

## Quick Reference

| What | Count | Risk |
|------|-------|------|
| Total `writeFileSync` in non-test `.ts` files | 144 | Scoping — not all are state-bearing |
| Non-atomic state-bearing writes (no `renameSync` in file) | ~28 across 12 modules | Crash can corrupt sidecar, metadata, blueprint content |
| Already-atomic tmp+rename writes | 8 modules | Noise in grep — verified, not in scope |
| `src/blueprint/freshness.ts` | 1 direct write (line 131) | **HIGH** — sidecar corruption breaks freshness checks |
| `src/mcp/blueprint-server.ts` | 4 direct writes (lines 372, 400, 1244, 2472) | **HIGH** — blueprint state corrupted on crash |
| `src/cli/commands/blueprint/db-commands.ts` | 1 direct metadata write (line 242) | MEDIUM — stale metadata on crash |
| `src/hooks/guard-switch/state.ts` | 1 direct write (line 29) | LOW — small payload, recoverable |
| `src/cli/commands/config.ts` | 1 direct write (line 143, 0o600) | LOW — config is user-editable |

## Parallel Metrics Snapshot

| Module | writeFileSync calls | renameSync calls | Atomic? | Risk |
|--------|--------------------:|-----------------:|---------|------|
| `src/blueprint/freshness.ts` | 1 | 0 | **No** | HIGH |
| `src/mcp/blueprint-server.ts` | 6 | 2 | **Partial** | HIGH |
| `src/cli/commands/blueprint/db-commands.ts` | 1 | 0 | **No** | MEDIUM |
| `src/blueprint/utils/decision-trace-artifacts.ts` | 1 | 0 | **No** | LOW |
| `src/cli/commands/blueprint/mutations.ts` | 1 | 4 | Yes | — |
| `src/worktrees/registry.ts` | 1 | 2 | Yes | — |
| `src/cli/commands/quality-log-store.ts` | 3 | 2 | Yes | — |
| `src/build/package-manifest.ts` | 2 | 5 | Yes | — |
| `src/compiler/manifests/*.ts` (3 files) | 3 | 6 | Yes | — |
| `src/symlinker/unified-sync.ts` | 1 | 2 | Yes | — |
| `src/build/normalize-tsconfig-json-exports.ts` | 1 | 2 | Yes | — |
| `src/cli/commands/compile.ts` | 5 | 2 | **Partial** | MEDIUM |

## Refinement Summary

| Aspect | Original | Refined |
|--------|----------|---------|
| F1 claim | Confirmed | Unchanged: freshness.ts:131 writes directly |
| F2 claim | Claimed `registry.ts` lacks rename | **CORRECTED**: `writeWorktreeRegistry` at `src/worktrees/registry.ts:71-79` already uses `writeFileSync(tmpPath) → renameSync(tmpPath, path)`. The claim was wrong. |
| F3 claim | "registry + sidecar at risk of corruption" | **NARROWED**: sidecar is at risk; registry is already atomic. |
| New finding | — | `blueprint-server.ts` has 4 non-atomic writes (writeVt, blueprint markdown, transition overview) that were not in the original plan. Added to Task 1.2 file list. |
| Task count | 3 | 4 (split lint rule into separate task, added startup cleanup) |
| Parallel Metrics | Missing | Added table showing per-module writeFileSync/renameSync counts and atomic status |

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | HIGH | Many `writeFileSync` calls write to the canonical path directly. | Confirmed across `src/mcp/blueprint-server.ts` (4 sites), `src/blueprint/freshness.ts:131` (`writeFileSync(sidecarPath(...), JSON.stringify(...))`), `src/blueprint/db/commands.ts:242`, `src/hooks/guard-switch/state.ts:29`, etc. |
| F2 | LOW | Some writes use a `.tmp` suffix but no rename. | **CORRECTED**: `src/worktrees/registry.ts:71-79` already uses `writeFileSync(tmpPath) → renameSync(tmpPath, path)` — it is atomic. The claim was wrong. Genuine variants with tmp but without rename are limited: `src/cli/commands/blueprint/router-dispatch.ts:120` writes to OS tmpdir (ephemeral, safely discarded). |
| F3 | HIGH | Crash during write can corrupt projection sidecar or blueprint content. | Confirmed: `freshness.ts:131` writes sidecar directly → crash mid-write yields unreadable sidecar. `blueprint-server.ts:400` writes blueprint markdown directly → crash yields partial blueprint. |
| F4 | — | (New) `blueprint-server.ts` already imports `renameSync` in one place but does not use it consistently. | Confirmed: line 2465 dynamically imports `renameSync` for directory-level renames, but writes at lines 372, 400, 1244, 2472 are direct. Refactoring to a shared helper would consolidate the pattern. |

## Tasks

### [reliability] Task 1.1: Create atomic write helper
**Status:** todo | **Depends:** Task from `2026-06-14-shared-filesystem-io-utilities`
**Files:** — Create: `src/utils/atomic-write.ts` — Create: `src/utils/atomic-write.test.ts`
**Steps (TDD):**
1. Test → `./bin/wp test --file src/utils/atomic-write.test.ts` verify FAIL
2. Implement → verify PASS
3. `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] `writeFileAtomic(path, content, options?)` writes to `path.tmp-<pid>-<id>`, `fs.fdatasync` on fd, `renameSync(tmp, path)`
- [ ] `writeFileAtomic` cleans up temp file on write failure OR rename failure
- [ ] `writeJsonFileAtomic(path, data, options?)` is a JSON convenience wrapper
- [ ] Cross-device rename fallback: copy + unlink with a logged warning
- [ ] JSDoc documents the contract (crash-safety, cross-device fallback, cleanup guarantee)

### [reliability] Task 1.2: Replace direct writes in high-risk modules
**Status:** todo | **Depends:** Task 1.1
**Files:**
- Modify: `src/blueprint/freshness.ts` (sidecar write, line 131)
- Modify: `src/mcp/blueprint-server.ts` (writeVt at line 372, blueprint write at line 400, transition overview at line 2472)
- Modify: `src/cli/commands/blueprint/db-commands.ts` (metadata write, line 242)
**Steps (TDD):**
1. For each module: run existing tests, note baseline
2. Replace direct `writeFileSync` with `writeFileAtomic` / `writeJsonFileAtomic`
3. Verify all existing tests still pass
4. `./bin/wp lint` + `./bin/wp typecheck` on modified files
**Acceptance:**
- [ ] `src/blueprint/freshness.ts` sidecar uses atomic write
- [ ] `src/mcp/blueprint-server.ts` all 4 direct writes replaced
- [ ] `src/cli/commands/blueprint/db-commands.ts` metadata write replaced
- [ ] All existing tests for these modules pass

### [fs] Task 1.3: Audit and replace direct writes in remaining state-bearing modules
**Status:** todo | **Depends:** Task 1.1
**Files:**
- Modify: `src/hooks/guard-switch/state.ts` (guard state)
- Modify: `src/blueprint/utils/decision-trace-artifacts.ts` (artifact write)
- Modify: `src/cli/commands/config.ts` (secrets config, line 143)
- Modify: `src/cli/auto-update/installer.ts` (config lines 122, 248)
**Steps (TDD):**
1. Run existing tests per module
2. Replace direct writes with atomic helper
3. Verify tests pass; lint + typecheck
**Acceptance:**
- [ ] Each listed module uses `writeFileAtomic` or `writeJsonFileAtomic`
- [ ] `src/cli/commands/config.ts` preserves `{ mode: 0o600 }` via options passthrough
- [ ] Module-specific tests pass

### [qa] Task 1.4: Add lint rule + startup orphan cleanup
**Status:** todo | **Depends:** Task 1.2
**Files:**
- Modify: add entry in `src/config/oxlint/code-safety.ts` or a custom audit under `src/audit/`
- Modify: add startup cleanup pass (reuse or neighbor `writeFileAtomic`)
**Steps (TDD):**
1. Implement lint/audit rule that flags bare `writeFileSync` in the modules listed in Task 1.2/1.3
2. Run the rule; fix any new hits
3. Implement orphan temp file cleanup: scan for `*.tmp-*-*` pattern in known state dirs, remove files older than 1 hour on startup
4. Test: simulate crash (kill process mid-write), verify cleanup removes orphan
**Acceptance:**
- [ ] Audit rule flags non-atomic writes in the target modules
- [ ] `./bin/wp audit ai-contracts` passes
- [ ] Orphan `*.tmp-*-*` files older than 1 hour are cleaned on next process start
- [ ] Cleanup is scoped to state-bearing directories only (not a recursive `/` scan)

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Tests (helper) | `./bin/wp test --file src/utils/atomic-write.test.ts` | All tests pass. |
| Tests (affected modules) | `./bin/wp test --suite unit` | No regressions in freshness, blueprint-server, db-commands, guard-switch, config. |
| Lint | `./bin/wp lint` on modified files | Zero violations. |
| Audit gate | `./bin/wp audit ai-contracts` | Passes (no bare writeFileSync in state-bearing modules). |

## Non-goals

- Converting every `writeFileSync` in the repo (test fixtures, build temp files, compiler flatten output are out of scope).
- Changing read semantics.
- Adding fsync to already-atomic tmp+rename flows (mutations.ts, registry.ts, quality-log-store.ts, package-manifest.ts, manifest writers).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| `renameSync` across filesystems fails | Detect `EXDEV` (`errno: -18` on Linux, `EPERM/-1` on macOS) and fall back to copy + unlink with a logged warning. |
| Orphan temp files accumulate | Task 1.4 implements startup cleanup for `*.tmp-*-*` older than 1 hour. |
| Atomic helper signature differs from `writeFileSync` | Mirror `fs.writeFileSync` signature (`path, data, options?`) so replacements are drop-in. |
| `blueprint-server.ts` rename at line 2466 is directory-level not file-level | Do not touch directory renames; only replace the 4 direct `writeFileSync` calls. |
