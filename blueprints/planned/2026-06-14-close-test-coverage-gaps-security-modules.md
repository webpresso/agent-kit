---
type: blueprint
title: Close test coverage gaps in security-critical modules
owner: ozby
status: planned
complexity: M
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/9 tasks done, 0 blocked)'
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

**Goal:** Add focused unit tests for the 9 security-critical source files that currently ship without a corresponding `.test.ts` and have genuinely-untested runtime logic.

## Product wedge anchor

- **Stage outcome:** webpresso public-extraction roadmap — agent-kit must be installable standalone by 3rd-party reference consumers (`ozby/ingest-lens`, `ozby/edge-matte`) with a trustworthy security surface. The secret-gate (`secret-managers.ts`), the `wp-pretool-guard` hook bin, and the MCP session-command tool are all consumer-facing entry points whose untested branches are a release-blocking risk.
- **Consuming surface:** the `wp-pretool-guard` hook bin (fires on every consumer Edit/Write), the `wp_session_execute` / session-command MCP verb consumed by Claude Code / Codex, and the `with-secrets` secret-provider gate backed by `src/runtime/secret-managers.ts`.
- **New user-visible capability:** after this lands, a 3rd-party consumer running `wp setup` gets a secret-gate and pretool-guard whose error-formatting and validation branches are regression-locked — failures surface as test diffs in agent-kit CI instead of as a leaked-secret or a silently-skipped guard in the consumer repo.

## Refinement Summary

| Original Claim | Verified Fact | Correction |
|---|---|---|
| 10 pretool-guard files untested | **8** untested (10 already tested) | F2 overstated by 2 |
| 6 MCP tools untested (claimed `search-files`, `read-file`, `write-file`, `list-files`, `format`, `cli`) | **3** MCP files untested: `_session-command`, `_tail-hints`, `cli`. `_session-execute` / `_session-batch-execute` are already covered via the `session-execute.test.ts` / `session-batch-execute.test.ts` direct `_`-prefixed imports; the four `search-files`/`read-file`/`write-file`/`list-files` claimed files **do not exist**; `format.ts` already has a test. | F3 file names were hallucinated **and** 2 of the 5 were already tested |
| 218/585 (37%) untested source files | **~227/590 (~38%)** untested by `.test.ts` sibling (194 excluding `index.ts` barrels); ~479 of 590 source files have a sibling test | F4 — the original 218 was closer to truth than the prior "113" correction; recomputed against a reproducible command |
| **Total scope: 18 files / 14 tasks** | **Total scope: 9 files / 9 tasks** | Dropped 5 tasks: 2.7 (re-export), 2.8 (type-only) per Non-goals; 3.2 / 3.3 already tested |

## Quick Reference

| Wave | Lane | Files | Complexity |
|---|---|---|---|
| 1 | `[testing]` `[security]` | 1: `secret-managers.ts` | S |
| 2a | `[pretool-guard]` `[testing]` | 4: skip-result, command-file, complexity, file-conventions | M |
| 2b | `[pretool-guard]` `[testing]` | 2: logger, ux-quality | S |
| 3a | `[mcp]` `[testing]` | 1: `_session-command` | S |
| 3b | `[mcp]` `[testing]` | 2: `cli.ts`, `_tail-hints.ts` | S |

## Parallel Metrics Snapshot

> Counts recomputed from a reproducible command (see F4). Coverage is measured by `.test.ts` sibling presence over non-test, non-`.d.ts` source files.

| Metric | Before | After (target) |
|---|---|---|
| Source files (`src/**/*.ts`, excl. tests + `.d.ts`) | 590 | 590 |
| Test files (`src/**/*.test.ts`) | 479 | 488 |
| Untested by sibling (excl. `index.ts` barrels) | 194 | 185 |
| Coverage ratio (sibling-test) | ~62% | ~63% |
| pretool-guard validated | 10/18 (55.6%) | 16/18 (88.9%) |
| MCP tools tested (this blueprint's targets) | 22/25 (88%) | 25/25 (100%) |
| Security-critical untested (this blueprint's scope) | 9 | 0 |

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
|---|---|---|---|
| F1 | HIGH | `src/runtime/secret-managers.ts` is untested. | **Confirmed.** File exists at `src/runtime/secret-managers.ts:1`; no `.test.ts` sibling. It exports exactly ONE symbol — `fetchSecretsForConfig` (line 102). `formatFailure` (line 10), `parseJsonSecrets` (line 25), `fetchFromDoppler` (line 50), `fetchFromInfisical` (line 76) are module-private and can only be exercised through `fetchSecretsForConfig`. Handles Doppler/Infisical CLI invocation and error formatting. **Note:** current `formatFailure` (lines 16-17) builds `detail` as `[stderr, stdout].filter(Boolean).join('\n')` — stdout **is** embedded in the thrown error today. |
| F2 | HIGH | 10 files under `src/hooks/pretool-guard/` are untested. | **Corrected to 8.** Verified on 2026-06-14: `dev-routing`, `runner`, `test-quality`, `mcp-redirect`, `package-imports`, `plan-frontmatter`, `dangerous-commands`, `forbidden-commands`, `path-contract`, `blueprint` all have tests. Untested: `logger`, `skip-result`, `command-file`, `package-imports.types`, `docs-governance`, `complexity`, `ux-quality`, `file-conventions`. Of these, `package-imports.types` (type-only) and `docs-governance` (pure re-export) are excluded from scope per Non-goals — leaving **6** in-scope. |
| F3 | HIGH | 6 MCP tools untested (`search-files`, `read-file`, `write-file`, `list-files`, `_tail-hints`, `format`, `cli`). | **Corrected to 3.** `search-files`, `read-file`, `write-file`, `list-files` **do not exist** as files. `format.ts` already has a test. `_session-execute.ts` and `_session-batch-execute.ts` are **already tested** — `src/mcp/tools/session-execute.test.ts:7` imports `./_session-execute.js` directly and `src/mcp/tools/session-batch-execute.test.ts:7` imports `./_session-batch-execute.js` directly (the non-prefixed files are 48B/54B re-export shims). Genuinely untested MCP files: `src/mcp/tools/_session-command.ts`, `src/mcp/_tail-hints.ts`, `src/mcp/cli.ts`. |
| F4 | MEDIUM | 218 of 585 source files (37%) have no corresponding test. | **Recomputed to ~227/590 (~38%)**, or 194 untested excluding `index.ts` barrels. ~479 of 590 non-test/non-`.d.ts` source files have `.test.ts` siblings → ~62% sibling-coverage. The original 218 was closer to truth than an intermediate "113" estimate, which was undercounted. Reproducible command (paste output when running): `comm -23 <(rg --files src -g '*.ts' -g '!*.test.ts' -g '!*.d.ts' \| sort) <(rg --files src -g '*.test.ts' \| sed 's/\.test\.ts$/.ts/' \| sort) \| rg -v '/index\.ts$' \| wc -l`. |

## Tasks

### Wave 1 — Secret Managers

#### [testing/security] Task 1.1: Test `secret-managers.ts`
**Status:** todo
**Depends:** None
Drive coverage entirely through the single exported function `fetchSecretsForConfig` (mock `node:child_process` `spawnSync`); the four helper functions are module-private and exercised indirectly.
**Files:**
- Create: `src/runtime/secret-managers.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → `./bin/wp test --file src/runtime/secret-managers.test.ts` verify FAIL
2. Test `fetchSecretsForConfig` JSON-parse paths (via mocked `spawnSync` stdout): valid JSON object, empty response, invalid JSON, non-object payload, array payload
3. Test `fetchSecretsForConfig` Doppler path and Infisical path with mocked `spawnSync` returning success and failure shapes
4. Test the failure path **asserts current behavior** — the thrown error message DOES include stdout (`secret-managers.ts:16-17` joins `[stderr, stdout]`). Do not assert leak-prevention here; that would be a behavior change out of scope for a coverage blueprint (see Note).
5. Implement only if coverage reveals an unreachable branch → verify PASS
6. `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] The single exported function `fetchSecretsForConfig` is tested across Doppler / Infisical / json-parse / failure paths
- [ ] Failure-path test asserts the *current* error-message shape (stdout included), not a hypothetical redacted shape
- [ ] `./bin/wp test --file src/runtime/secret-managers.test.ts` passes
**Note:** Whether secret-provider stdout *should* appear in error text is a real concern but is a **behavior change**, not a coverage task. It belongs in a separate scoped blueprint (`harden-secret-manager-error-handling`). This task locks current behavior so that change is a visible diff later.

### Wave 2a — Pretool-Guard Validators (Core Logic)

#### [pretool-guard/testing] Task 2.1: Test `skip-result.ts`
**Status:** todo
**Depends:** None
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

#### [pretool-guard/testing] Task 2.2: Test `command-file.ts`
**Status:** todo
**Depends:** None
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

#### [pretool-guard/testing] Task 2.3: Test `complexity.ts`
**Status:** todo
**Depends:** None
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

#### [pretool-guard/testing] Task 2.4: Test `file-conventions.ts`
**Status:** todo
**Depends:** None
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

### Wave 2b — Pretool-Guard Validators (Infrastructure)

#### [pretool-guard/testing] Task 2.5: Test `logger.ts`
**Status:** todo
**Depends:** None
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

#### [pretool-guard/testing] Task 2.6: Test `ux-quality.ts`
**Status:** todo
**Depends:** None
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

### Wave 3a — MCP Tools (Session Infrastructure)

#### [mcp/testing] Task 3.1: Test `_session-command.ts`
**Status:** todo
**Depends:** None
This is the only genuinely-untested MCP session file. `_session-execute.ts` and `_session-batch-execute.ts` are already covered via the existing `session-execute.test.ts` / `session-batch-execute.test.ts` direct `_`-prefixed imports and are NOT in scope.
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

### Wave 3b — MCP Infrastructure

#### [mcp/testing] Task 3.2: Test `cli.ts`
**Status:** todo
**Depends:** None
Focus on this file's own logic (server startup, sentinel lifecycle, shutdown). Do not re-test the imported `isDirectEntrypoint`/sentinel utilities where they have their own coverage — assert that `cli.ts` *wires* them correctly, not their internal behavior.
**Files:**
- Create: `src/mcp/cli.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test `runStdioServer` creates server + stdio transport
3. Test the entrypoint guard prevents accidental import-side-effect execution (assert the guard is consulted; do not duplicate the guard helper's own unit tests)
4. Test sentinel write/delete lifecycle is invoked on startup/shutdown
5. Test shutdown flow (transport.close called, sentinel cleaned up)
6. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover server startup, sentinel lifecycle wiring, and shutdown
- [ ] `./bin/wp test --file src/mcp/cli.test.ts` passes

#### [mcp/testing] Task 3.3: Test `_tail-hints.ts`
**Status:** todo
**Depends:** None
**Files:**
- Create: `src/mcp/_tail-hints.test.ts`
**Steps (TDD):**
1. Write failing test skeleton → verify FAIL
2. Test `shouldShowHint` returns true for unseen hint, false after shown
3. Test 7-day TTL: hint re-shown after expiry
4. Test `recordHint` persists to JSONL file
5. Test the hint-selection export (`maybeHint` / `TAIL_HINTS`) returns the correct static string for each `TailHintId`
6. Test not-in-git-repo path returns gracefully
7. Verify PASS, `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Tests cover dedup, TTL expiry, persistence, and all `TAIL_HINTS` entries
- [ ] `./bin/wp test --file src/mcp/_tail-hints.test.ts` passes
**Note:** The blueprint previously referenced a non-existent `getTailHint`; the real surface is `maybeHint` / the `TAIL_HINTS` map. Confirm the exact export name before writing assertions.

## Verification Gates

| Gate | Command | Success Criteria |
|---|---|---|
| All new tests | `./bin/wp test` | All 9 new test files pass |
| Pretool-guard suite | `./bin/wp test --file src/hooks/pretool-guard/**/*.test.ts` | 16 test files pass (10 existing + 6 new) |
| MCP suite | `./bin/wp test --file src/mcp/**/*.test.ts` | All MCP test files pass |
| Secret managers | `./bin/wp test --file src/runtime/secret-managers.test.ts` | Tests pass |
| Type safety | `./bin/wp typecheck` | Zero errors |
| Lint | `./bin/wp lint` on all new files | Zero violations |

## Non-goals

- Reaching 100% line coverage.
- Converting already-tested modules into TDD-shaped work.
- Removing or renaming existing test file conventions.
- Testing auto-generated or purely declarative files (this is why `package-imports.types.ts` (type-only, 8 lines) and `docs-governance.ts` (single-line re-export) are **out of scope** — a `.test.ts` for a type contract or a re-export adds no runtime coverage; fold any re-export-integrity check into an existing export-isolation test if needed).
- Re-testing already-covered MCP session handlers (`_session-execute.ts`, `_session-batch-execute.ts`).
- Changing secret-handling error-formatting behavior (tracked separately).

## Risks

| Risk | Mitigation |
|---|---|
| Flaky tests from filesystem coupling | Use vitest with `tmpdir` per test; clean up in `afterEach`. |
| Mocking `spawnSync`/`spawn` is fragile | Prefer integration-shaped tests with real short-lived commands where fast; mock `node:child_process` only for long-running or destructive processes. |
| `_tail-hints.ts` persistence tests interfere with real state | Use temp directories; never touch `.agent/.tail-hint-history.jsonl` in the working tree. |
| Task 1.1 might be misread as a behavior-change task | Acceptance explicitly locks *current* error-message shape (stdout included); any redaction work is a separate blueprint. |
| `cli.ts` test could drift into re-testing imported utilities | Assert wiring/invocation only; defer guard/sentinel internals to their own tests. |
