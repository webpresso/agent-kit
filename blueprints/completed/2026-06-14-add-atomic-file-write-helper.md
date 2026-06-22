---
type: blueprint
title: Add atomic file write helper
owner: ozby
status: completed
complexity: S
created: '2026-06-14'
last_updated: '2026-06-22'
progress: '100% (4/4 tasks done, 0 blocked, updated 2026-06-22)'
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

**Goal:** Add an atomic `write-tmp → fsync → rename` capability to the shared `writeJsonFile` helper created by the `2026-06-14-shared-filesystem-io-utilities` dependency blueprint, so that state-bearing writes (blueprint MCP state, projection sidecars, metadata) never leave a half-written file at the canonical path on crash — and so each call site is migrated exactly once, by the dependency blueprint, not twice.

## Product wedge anchor

- **Stage outcome:** Reliability hardening of the blueprint MCP runtime (`catalog/agent/rules/blueprint-scoping.md`) — the `wp_blueprint_*` tool surface must not corrupt persisted blueprint/projection state when a session is killed mid-write. This unblocks trustworthy multi-session blueprint execution where a crash during one session does not poison the next session's read.
- **Consuming surface:** The `wp_blueprint_put` / `wp_blueprint_transition` / `wp_blueprint_finalize` MCP verbs (and the `wp blueprint` CLI) that persist blueprint markdown and projection sidecars via `src/mcp/blueprint-server.ts` and `src/blueprint/freshness.ts`.
- **New user-visible capability:** An agent (or human) can hard-kill a blueprint MCP session mid-write and the next `wp_blueprint_get` / freshness check still reads a complete, valid blueprint and sidecar — never a truncated one that errors or silently reports stale state.

## Relationship to `shared-filesystem-io-utilities` (collision resolution)

This blueprint **does not** introduce a second migration of the same call sites. The dependency blueprint `2026-06-14-shared-filesystem-io-utilities` already migrates `freshness.ts`, `blueprint-server.ts`, `config.ts`, `guard-switch/state.ts`, and `installer.ts` from raw `writeFileSync` to its `writeJsonFile` helper. Re-migrating those same lines from `writeJsonFile` to a separate `writeFileAtomic` would be churn and a guaranteed same-file conflict.

Instead, the atomicity concern is **folded into the dependency blueprint's helper**: this blueprint adds an `atomic` option (and a `writeJsonFileAtomic` convenience variant) to that helper module, and the call-site migration is done **once, by the dependency blueprint**, simply passing the atomic flag for state-bearing writes. The work here is the helper capability + the audit/lint gate, not a fresh sweep over every call site.

## Quick Reference

### Execution Waves

| Wave | Tasks | Dependencies | Parallelizable |
|------|-------|--------------|----------------|
| Wave 0 | Task 1.1 (extend helper with atomic option) | `2026-06-14-shared-filesystem-io-utilities` Task 1.1 (helper exists) | 1 agent |
| Wave 1 | Task 1.2, Task 1.3 (flag state-bearing sites as atomic — coordinated with dep blueprint's migration) | Task 1.1 | 2 agents |
| Wave 2 | Task 1.4 (audit/lint gate) | Task 1.2 | 1 agent |

| What | Count | Risk |
|------|-------|------|
| Total `writeFileSync` in non-test `.ts` files | 144 | Scoping — not all are state-bearing |
| Non-atomic state-bearing writes (no `renameSync` in file) | ~28 across 12 modules | Crash can corrupt sidecar, metadata, blueprint content |
| Already-atomic tmp+rename writes | 8 modules | Noise in grep — verified, not in scope |
| `src/blueprint/freshness.ts` | 1 direct write (line 131) | **HIGH** — sidecar corruption breaks freshness checks |
| `src/mcp/blueprint-server.ts` | 5 direct writes (lines 372, 400, 1106, 1244, 2472) | **HIGH** — blueprint state corrupted on crash |
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
| Dep collision | Not addressed | **RESOLVED**: atomicity is folded into the dep blueprint's `writeJsonFile` helper (new `atomic` option + `writeJsonFileAtomic` variant); call sites are migrated once by the dep blueprint, not re-migrated here. |
| `blueprint-server.ts` write list | Listed 3 (372/400/2472), claimed "4" (dropped 1244) | **CORRECTED**: five state-bearing direct writes — 372, 400, 1106, 1244, 2472 — now all listed. |
| Audit gate | `wp audit ai-contracts` asserted to check writes | **CORRECTED**: `ai-contracts.ts` does not flag bare writes; Task 1.4 now actually adds the rule (to `code-safety.ts`) and the gate references the new rule, not a pre-existing one. |
| Task 1.4 scope | Lint rule + startup orphan cleanup + crash-sim test | **NARROWED**: startup-orphan-cleanup + crash-simulation half deleted (YAGNI — Task 1.1's finally-block cleanup covers the normal path). Task 1.4 is now lint/audit rule only. |
| Quick Reference | Missing Execution Waves | **ADDED**: Execution Waves table. |
| New finding | — | `blueprint-server.ts` non-atomic writes (writeVt, blueprint markdown, transition overview) added to Task 1.2 file list. |
| Task count | 3 | 4 |
| Parallel Metrics | Present | Retained (per-module writeFileSync/renameSync counts and atomic status) |

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | HIGH | Many `writeFileSync` calls write to the canonical path directly. | Confirmed across `src/mcp/blueprint-server.ts` (5 sites), `src/blueprint/freshness.ts:131` (`writeFileSync(sidecarPath(...), JSON.stringify(...))`), `src/blueprint/db/commands.ts:242`, `src/hooks/guard-switch/state.ts:29`, etc. |
| F2 | LOW | Some writes use a `.tmp` suffix but no rename. | **CORRECTED**: `src/worktrees/registry.ts:71-79` already uses `writeFileSync(tmpPath) → renameSync(tmpPath, path)` — it is atomic. The claim was wrong. Genuine variants with tmp but without rename are limited: `src/cli/commands/blueprint/router-dispatch.ts:120` writes to OS tmpdir (ephemeral, safely discarded). |
| F3 | HIGH | Crash during write can corrupt projection sidecar or blueprint content. | Confirmed: `freshness.ts:131` writes sidecar directly → crash mid-write yields unreadable sidecar. `blueprint-server.ts:400` writes blueprint markdown directly → crash yields partial blueprint. |
| F4 | — | (New) `blueprint-server.ts` already imports `renameSync` in one place but does not use it consistently. | Confirmed: line 2465 dynamically imports `renameSync` for directory-level renames, but writes at lines 372, 400, 1106, 1244, 2472 are direct. Folding into the shared helper would consolidate the pattern. |
| F5 | HIGH | (New) `depends_on` blueprint and this one migrate the same call sites. | Confirmed: `2026-06-14-shared-filesystem-io-utilities` Task 1.3 migrates freshness.ts, blueprint-server.ts, config.ts, guard-switch/state.ts, installer.ts to `writeJsonFile`. Re-migrating to a separate `writeFileAtomic` is churn + same-file conflict. **Resolution:** fold atomicity into that helper; migrate once. |
| F6 | HIGH | (New) Task 1.4 gate `wp audit ai-contracts` proves atomic-write coverage. | **FALSE**: `src/audit/ai-contracts.ts` contains zero write/rename logic and was never designed to flag bare writes. Gate rescoped — Task 1.4 now adds the rule itself and references it. |

## Tasks

#### Task 1.1: Add atomic option to the shared write-json helper
**Status:** done
**Depends:** `2026-06-14-shared-filesystem-io-utilities` Task 1.1 (helper `writeJsonFile` exists)
Extend the dependency blueprint's `writeJsonFile` helper module with an opt-in atomic write path, rather than creating a competing helper. Atomicity is a flag on the existing helper so the dependency blueprint's single migration sweep can mark state-bearing sites atomic without a second rewrite.
**Files:**
- Modify: the helper module created by `2026-06-14-shared-filesystem-io-utilities` (e.g. `src/utils/write-json-file.ts`) — add `atomic` option + `writeJsonFileAtomic` variant
- Modify: the helper's colocated test file (e.g. `src/utils/write-json-file.test.ts`)
**Steps (TDD):**
1. Test → `./bin/wp test --file <helper>.test.ts` verify FAIL on the new atomic cases
2. Implement the atomic path → verify PASS
3. `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [x] `writeJsonFile(path, data, { atomic: true })` writes to `path.tmp-<pid>-<id>`, `fs.fdatasync` on fd, `renameSync(tmp, path)`
- [x] `writeJsonFileAtomic(path, data, options?)` is a convenience wrapper equivalent to `{ atomic: true }`
- [x] A raw-content variant (`writeFileAtomic(path, content, options?)`) exists for non-JSON state-bearing writes (e.g. blueprint markdown)
- [x] Atomic path cleans up the temp file on write failure OR rename failure (try/finally)
- [x] Cross-device rename fallback: copy + unlink with a logged warning
- [x] JSDoc documents the contract (crash-safety, cross-device fallback, cleanup guarantee)

#### Task 1.2: Mark high-risk state-bearing writes as atomic
**Status:** done
**Depends:** Task 1.1
Coordinate with the dependency blueprint's migration of these files so each site is touched once: where the dep blueprint converts these writes to `writeJsonFile`/`writeFileAtomic`, pass the atomic flag. List the full set of state-bearing writes so none is missed.
**Files:**
- Modify: `src/blueprint/freshness.ts` (sidecar write, line 131)
- Modify: `src/mcp/blueprint-server.ts` (all 5 state-bearing direct writes: writeVt at 372, blueprint markdown at 400, write at 1106, write at 1244, transition overview at 2472)
- Modify: `src/cli/commands/blueprint/db-commands.ts` (metadata write, line 242)
**Steps (TDD):**
1. For each module: run existing tests, note baseline
2. Ensure the write goes through the helper with `{ atomic: true }` (or `writeJsonFileAtomic` / `writeFileAtomic`)
3. Verify all existing tests still pass
4. `./bin/wp lint` + `./bin/wp typecheck` on modified files
**Acceptance:**
- [x] `src/blueprint/freshness.ts` sidecar uses the atomic write path
- [x] `src/mcp/blueprint-server.ts` all 5 state-bearing direct writes (372, 400, 1106, 1244, 2472) use the atomic write path
- [x] `src/cli/commands/blueprint/db-commands.ts` metadata write uses the atomic write path
- [x] Directory-level rename at line 2465 is left untouched (not a file write)
- [x] All existing tests for these modules pass

#### Task 1.3: Mark remaining state-bearing writes as atomic
**Status:** done
**Depends:** Task 1.1
**Files:**
- Modify: `src/hooks/guard-switch/state.ts` (guard state)
- Modify: `src/blueprint/utils/decision-trace-artifacts.ts` (artifact write)
- Modify: `src/cli/commands/config.ts` (secrets config, line 143)
- Modify: `src/cli/auto-update/installer.ts` (config lines 122, 248)
**Steps (TDD):**
1. Run existing tests per module
2. Route the write through the helper with `{ atomic: true }`
3. Verify tests pass; lint + typecheck
**Acceptance:**
- [x] Each listed module uses the atomic write path
- [x] `src/cli/commands/config.ts` preserves `{ mode: 0o600 }` via options passthrough
- [x] Module-specific tests pass

#### Task 1.4: Add lint/audit rule for non-atomic state-bearing writes
**Status:** done
**Depends:** Task 1.2
Add a real rule that flags bare `writeFileSync` in the state-bearing modules. The existing `src/audit/ai-contracts.ts` does **not** check writes and must not be cited as a gate; this task creates the check.
**Files:**
- Modify: add the rule to `src/config/oxlint/code-safety.ts` (or a dedicated audit under `src/audit/`); do **not** assume `ai-contracts.ts` covers it
**Steps (TDD):**
1. Implement the lint/audit rule that flags bare `writeFileSync` in the modules listed in Task 1.2/1.3
2. Run the rule; fix any new hits
3. Add a test asserting the rule fires on a bare `writeFileSync` and is silent when the atomic helper is used
**Acceptance:**
- [x] The new rule flags non-atomic `writeFileSync` in the target state-bearing modules
- [x] Running the new rule (e.g. `./bin/wp lint` with the rule active, or `./bin/wp audit <new-kind>`) passes after Tasks 1.2/1.3
- [x] The rule's own test verifies it fires on a bare write and is silent on the atomic helper

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Tests (helper) | `./bin/wp test --file <helper>.test.ts` | All atomic-path tests pass. |
| Tests (affected modules) | `./bin/wp test --suite unit` | No regressions in freshness, blueprint-server, db-commands, guard-switch, config. |
| Lint | `./bin/wp lint` on modified files | Zero violations, including the new non-atomic-write rule. |
| Audit gate | The new rule added in Task 1.4 (lint rule active, or `./bin/wp audit <new-kind>`) | Passes — no bare `writeFileSync` in state-bearing modules. (Do **not** use `ai-contracts`; it does not check writes.) |

## Non-goals

- Converting every `writeFileSync` in the repo (test fixtures, build temp files, compiler flatten output are out of scope).
- Re-migrating call sites the dependency blueprint already migrates — atomicity is folded into that helper so each site is touched once.
- Changing read semantics.
- Adding fsync to already-atomic tmp+rename flows (mutations.ts, registry.ts, quality-log-store.ts, package-manifest.ts, manifest writers).
- Startup orphan-temp-file cleanup / background filesystem scanners — the helper's finally-block cleanup covers the normal path; a background age-based scanner is speculative infra (YAGNI).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| `renameSync` across filesystems fails | Detect `EXDEV` (`errno: -18` on Linux, `EPERM/-1` on macOS) and fall back to copy + unlink with a logged warning. |
| Helper signature differs from `writeFileSync` | Mirror `fs.writeFileSync` signature (`path, data, options?`) and add `atomic` to options so replacements are drop-in. |
| Orphan temp files on abnormal exit | The atomic path's try/finally removes the temp file on write/rename failure; partial temp files left by a hard kill are inert (canonical path is never touched until rename succeeds) and overwritten on the next write. No background scanner needed. |
| Same-file conflict with the dependency blueprint | Atomicity is folded into the dep blueprint's helper; call sites are migrated once (Task 1.2/1.3 only pass the atomic flag, coordinated with that migration). |
| `blueprint-server.ts` rename at line 2465 is directory-level not file-level | Do not touch directory renames; only route the 5 file `writeFileSync` calls through the atomic helper. |


## Completion Evidence

Completed on 2026-06-22.

Implemented:
- Extended `src/utils/write-json-file.ts` with `writeFileAtomic`, `writeJsonFile(..., { atomic: true })`, and `writeJsonFileAtomic`.
- Migrated state-bearing blueprint/config writes to atomic helper paths.
- Added `wp audit atomic-state-writes` and MCP audit coverage to prevent regressions.
- Fixed inherited slow git-backed test fixtures without increasing timeouts so the full suite can pass.

Verification:
- `./bin/wp test --file src/utils/write-json-file.test.ts --file src/audit/atomic-state-writes.test.ts --file src/blueprint/freshness.test.ts --file src/hooks/guard-switch/state.test.ts --file src/cli/auto-update/installer.test.ts --file src/cli/commands/config.test.ts --file src/cli/commands/blueprint/db-commands.test.ts --file src/mcp/blueprint-server.test.ts`
- `./bin/wp test --file scripts/release.test.ts --file src/blueprint/db/paths.test.ts`
- `./bin/wp test`
- `./bin/wp typecheck`
- `./bin/wp lint`
- `./bin/wp audit atomic-state-writes --json`
- `./bin/wp audit package-surface --json`
- `./bin/wp audit blueprint-readme-drift --json`
- `./bin/wp audit blueprint-lifecycle --base origin/main --json`
- `git diff --check`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/in-progress/2026-06-14-add-atomic-file-write-helper.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
