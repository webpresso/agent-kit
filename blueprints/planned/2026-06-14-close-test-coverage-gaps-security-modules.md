---
type: blueprint
title: Close test coverage gaps in security-critical modules
owner: ozby
status: planned
complexity: L
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/14 tasks done, 0 blocked)'
depends_on: []
cross_repo_depends_on: []
tags:
  - testing
  - security
  - coverage
  - mcp
  - secret-gate
  - pretool-guard
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Close test coverage gaps in security-critical modules

**Goal:** Add focused unit tests for the 14 security-critical source files that currently ship without a corresponding `.test.ts`.

## Refinement Summary

| Original Claim | Verified Fact | Correction |
|---|---|---|
| 10 pretool-guard files untested | **8** untested (10 already tested) | F2 overstated by 2 |
| 6 MCP tools untested (claimed `search-files`, `read-file`, `write-file`, `list-files`, `format`, `cli`) | **5** MCP files untested: `_session-execute`, `_session-batch-execute`, `_session-command`, `_tail-hints`, `cli`. The first 4 claimed files **do not exist**; `format.ts` already has a test. | F3 file names were hallucinated |
| 218/585 (37%) untested source files | **113/591 (19%)** untested (478 of 591 have `.test.ts`) | F4 overstated by ~2x |
| **Total scope: 18 files** | **Total scope: 14 files** | Corrected across all lanes |

## Quick Reference

| Wave | Lane | Files | Complexity |
|---|---|---|---|
| 1 | `[testing]` `[security]` | 1: `secret-managers.ts` | S |
| 2a | `[pretool-guard]` `[testing]` | 4: skip-result, command-file, complexity, file-conventions | M |
| 2b | `[pretool-guard]` `[testing]` | 4: logger, ux-quality, docs-governance, package-imports.types | M |
| 3a | `[mcp]` `[testing]` | 3: `_session-command`, `_session-execute`, `_session-batch-execute` | M |
| 3b | `[mcp]` `[testing]` | 2: `cli.ts`, `_tail-hints.ts` | S |

## Parallel Metrics Snapshot

| Metric | Before | After (target) |
|---|---|---|
| Source files (`src/*.ts`, excl. tests) | 591 | 591 |
| Test files (`src/*.test.ts`) | 478 | 492 |
| Coverage ratio | 80.9% | 83.2% |
| pretool-guard validated | 10/18 (55.6%) | 18/18 (100%) |
| MCP tools tested | 22/25 (88%) | 25/25 (100%) |
| Security-critical untested | 14 | 0 |

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
|---|---|---|---|
| F1 | HIGH | `src/runtime/secret-managers.ts` is untested. | **Confirmed.** File exists at `src/runtime/secret-managers.ts:1`; no `.test.ts` sibling. Handles Doppler/Infisical CLI invocation and error formatting that can leak secret output. |
| F2 | HIGH | 10 files under `src/hooks/pretool-guard/` are untested. | **Corrected to 8.** Verified on 2026-06-14: `dev-routing`, `runner`, `test-quality`, `mcp-redirect`, `package-imports`, `plan-frontmatter`, `dangerous-commands`, `forbidden-commands`, `path-contract`, `blueprint` all have tests. Untested: `logger`, `skip-result`, `command-file`, `package-imports.types`, `docs-governance`, `complexity`, `ux-quality`, `file-conventions`. |
| F3 | HIGH | 6 MCP tools untested (`search-files`, `read-file`, `write-file`, `list-files`, `_tail-hints`, `format`, `cli`). | **Corrected to 5.** `search-files`, `read-file`, `write-file`, `list-files` **do not exist** as files. `format.ts` already has a test. Real untested MCP files: `src/mcp/tools/_session-execute.ts`, `_session-batch-execute.ts`, `_session-command.ts`, `src/mcp/_tail-hints.ts`, `src/mcp/cli.ts`. |
| F4 | MEDIUM | 218 of 585 source files (37%) have no corresponding test. | **Corrected to 113/591 (19%).** 478 of 591 source files have `.test.ts` siblings. The original 218 count was inflated by ~2x. |

## Tasks

### Wave 1 — Secret Managers

#### [testing] [security] Task 1.1: Test `secret-managers.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/runtime/secret-managers.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → `./bin/wp test --file src/runtime/secret-managers.test.ts` verify FAIL
2. Test `parseJsonSecrets` with valid JSON, empty response, invalid JSON, non-object payload, array payload
3. Test `formatFailure` to ensure stdout does not leak into the error message body when it could contain secret values
4. Test `fetchFromDoppler`/`fetchFromInfisical` with mocked `spawnSync` returning success and failure shapes
5. Implement if coverage reveals gaps → verify PASS
6. `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] All exported functions have at least one test
- [ ] `formatFailure` test verifies no stdout bytes appear in error message
- [ ] `./bin/wp test --file src/runtime/secret-managers.test.ts` passes

### Wave 2a — Pretool-Guard Validators (Core Logic)

#### [pretool-guard] [testing] Task 2.1: Test `skip-result.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/hooks/pretool-guard/validators/skip-result.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test `createSkipResult` returns correct `{ passed: true, skipped: true }` shape
3. Test custom skip reason is preserved
4. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover default and custom skip reasons
- [ ] `./bin/wp test --file src/hooks/pretool-guard/validators/skip-result.test.ts` passes

#### [pretool-guard] [testing] Task 2.2: Test `command-file.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/hooks/pretool-guard/validators/command-file.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test `validateCommandFile` blocks command files exceeding 600 lines
3. Test blocks skill files exceeding 400 lines
4. Test passes files under limits / outside `.claude/` paths
5. Test SKIP env var bypass
6. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover command-file and skill-file line-limit enforcement
- [ ] `./bin/wp test --file src/hooks/pretool-guard/validators/command-file.test.ts` passes

#### [pretool-guard] [testing] Task 2.3: Test `complexity.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/hooks/pretool-guard/validators/complexity.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test file exceeding `MAX_FILE_LINES` (500) produces a warning but still passes
3. Test file under limit passes silently
4. Test non-ts/js extensions skip validation
5. Test SKIP env var bypass
6. Test null content/filePath returns early
7. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover line-limit, extension filtering, skip, and null-input paths
- [ ] `./bin/wp test --file src/hooks/pretool-guard/validators/complexity.test.ts` passes

#### [pretool-guard] [testing] Task 2.4: Test `file-conventions.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/hooks/pretool-guard/validators/file-conventions.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test blocks writes to system paths (`/etc/`, `/usr/`, `/bin/`, `/sbin/`, `/var/`, `/sys/`, `/proc/`, `/dev/`)
3. Test passes writes to non-system paths
4. Test blueprint-path violations (via `getBlueprintPathViolation`)
5. Test non-canonical planning path violations
6. Test SKIP env var bypass, null filePath
7. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover system-path blocking and blueprint/path-contract delegation
- [ ] `./bin/wp test --file src/hooks/pretool-guard/validators/file-conventions.test.ts` passes

### Wave 2b — Pretool-Guard Validators (Infrastructure/Re-Exports)

#### [pretool-guard] [testing] Task 2.5: Test `logger.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/hooks/pretool-guard/logger.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test `logGuardResult` writes valid JSONL entries with correct `LogStatus`/`ToolType`
3. Test log rotation when exceeding `maxLines`
4. Test disabled logger skips writes
5. Test `parseLogFile` returns parsed entries or empty array on missing/invalid file
6. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover write, rotation, disabled, and parse paths
- [ ] `./bin/wp test --file src/hooks/pretool-guard/logger.test.ts` passes

#### [pretool-guard] [testing] Task 2.6: Test `ux-quality.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/hooks/pretool-guard/validators/ux-quality.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test detects `alert()` / `window.alert()` usage
3. Test detects `catch { console.error(...) }` pattern (swallowed errors)
4. Test detects `useQuery` destructure vs assignment anti-patterns
5. Test passes clean content
6. Test SKIP env var bypass
7. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover all four violation types (alert, catch-console-only, useQuery destructure, useQuery assignment)
- [ ] `./bin/wp test --file src/hooks/pretool-guard/validators/ux-quality.test.ts` passes

#### [pretool-guard] [testing] Task 2.7: Test `docs-governance.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/hooks/pretool-guard/validators/docs-governance.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test that `validateDocsGovernance` re-export matches the source implementation from `#hooks/shared/validators/docs-governance`
3. Test basic pass/fail behavior for docs file writes
4. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests verify the re-exported validator delegates correctly
- [ ] `./bin/wp test --file src/hooks/pretool-guard/validators/docs-governance.test.ts` passes
**Note:** This file is a re-export of `#hooks/shared/validators/docs-governance`. Tests should focus on import correctness and delegate behavior.

#### [pretool-guard] [testing] Task 2.8: Test `package-imports.types.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/hooks/pretool-guard/validators/package-imports.types.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test `DuplicateFunctionResult` interface shape compatibility with `ValidationResult`
3. Test exported types are importable and structurally correct
4. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Type-level tests verify interface contract
- [ ] `./bin/wp test --file src/hooks/pretool-guard/validators/package-imports.types.test.ts` passes
**Note:** Type-only file (9 lines). Tests are structural/type-compatibility checks.

### Wave 3a — MCP Tools (Session Infrastructure)

#### [mcp] [testing] Task 3.1: Test `_session-command.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/mcp/tools/_session-command.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test `runSessionCommand` spawns a process and returns exit code + output summary
3. Test output truncation at `MAX_CAPTURE_BYTES`
4. Test `searchSessionCommandOutput` returns BM25-ranked hits
5. Test timeout behavior (process killed after timeoutMs)
6. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover spawn, output capture, truncation, search, and timeout paths
- [ ] `./bin/wp test --file src/mcp/tools/_session-command.test.ts` passes

#### [mcp] [testing] Task 3.2: Test `_session-execute.ts`
**Status:** todo | **Depends:** Task 3.1
**Files:**
- Create: `src/mcp/tools/_session-execute.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test `inputSchema` validates/ rejects input shapes
3. Test handler calls `runSessionCommand` with correct params
4. Test handler returns structured `outputSchema`-conformant results
5. Test optional `query` param triggers `searchSessionCommandOutput`
6. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover handler input validation and result structure
- [ ] `./bin/wp test --file src/mcp/tools/_session-execute.test.ts` passes

#### [mcp] [testing] Task 3.3: Test `_session-batch-execute.ts`
**Status:** todo | **Depends:** Task 3.1
**Files:**
- Create: `src/mcp/tools/_session-batch-execute.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test `mapWithConcurrency` correctly parallelizes work up to concurrency limit
3. Test `inputSchema` validates batch command arrays
4. Test handler dispatches multiple `runSessionCommand` calls and aggregates results
5. Test optional `queries` param triggers search across combined output
6. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover batch dispatch, concurrency, and aggregated search results
- [ ] `./bin/wp test --file src/mcp/tools/_session-batch-execute.test.ts` passes

### Wave 3b — MCP Infrastructure

#### [mcp] [testing] Task 3.4: Test `cli.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/mcp/cli.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test `runStdioServer` creates server + stdio transport
3. Test `isDirectEntrypoint` guard prevents accidental import-side-effect execution
4. Test sentinel write/delete lifecycle (`writeSentinel`, `deleteSentinel`)
5. Test shutdown flow (transport.close called, sentinel cleaned up)
6. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover server startup, sentinel lifecycle, and shutdown
- [ ] `./bin/wp test --file src/mcp/cli.test.ts` passes

#### [mcp] [testing] Task 3.5: Test `_tail-hints.ts`
**Status:** todo | **Depends:** None
**Files:**
- Create: `src/mcp/_tail-hints.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test `shouldShowHint` returns true for unseen hint, false after shown
3. Test 7-day TTL: hint re-shown after expiry
4. Test `recordHint` persists to JSONL file
5. Test `getTailHint` returns correct static string for each `TailHintId`
6. Test not-in-git-repo path returns gracefully
7. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover dedup, TTL expiry, persistence, and all TAIL_HINTS entries
- [ ] `./bin/wp test --file src/mcp/_tail-hints.test.ts` passes

## Verification Gates

| Gate | Command | Success Criteria |
|---|---|---|
| All new tests | `./bin/wp test` | All 14 new test files pass |
| Pretool-guard suite | `./bin/wp test --file src/hooks/pretool-guard/**/*.test.ts` | 18 test files pass (10 existing + 8 new) |
| MCP suite | `./bin/wp test --file src/mcp/**/*.test.ts` | All MCP test files pass |
| Secret managers | `./bin/wp test --file src/runtime/secret-managers.test.ts` | Tests pass |
| Type safety | `./bin/wp typecheck` | Zero errors |
| Lint | `./bin/wp lint` on all new files | Zero violations |

## Non-goals

- Reaching 100% line coverage.
- Converting already-tested modules into TDD-shaped work.
- Removing or renaming existing test file conventions.
- Testing auto-generated or purely declarative files.

## Risks

| Risk | Mitigation |
|---|---|
| Flaky tests from filesystem coupling | Use `node:test` with `tmpdir` per test; clean up in `afterEach`. |
| Mocking `spawn`/`exec` is fragile | Prefer integration-shaped tests with real short-lived commands where fast; mock `child_process` only for long-running or destructive processes. |
| `_tail-hints.ts` persistence tests interfere with real state | Use temp directories; never touch `.agent/.tail-hint-history.jsonl` in the working tree. |
| `package-imports.types.ts` is type-only (9 lines) — low-value for runtime test | Accept structural import/type-compatibility test as sufficient; no need for exhaustive behavioral coverage. |
| `docs-governance.ts` is a pure re-export | Test import chain rather than duplicating coverage of the upstream implementation. |
