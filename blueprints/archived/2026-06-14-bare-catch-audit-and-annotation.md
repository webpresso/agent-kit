---
type: blueprint
title: Bare catch audit and annotation
owner: ozby
status: archived
complexity: M
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/5 tasks done, 0 blocked)'
depends_on: []
cross_repo_depends_on: []
tags:
  - code-smell
  - error-handling
  - reliability
  - lint
  - qa
worktree_owner_id: ''
worktree_owner_branch: ''
---

> **Archived 2026-06-14 (plan-refine fact-check).** The "298 bare catch blocks" premise is false: `grep "catch\\s*{"` counts catch-block opening braces, not empty/swallowing catches. The real empty-catch count is 1. Executing this would rewrite ~298 already-correct error handlers (a net regression). Fix the single empty catch directly instead.

# Bare catch audit and annotation

**Goal:** Remove or explicitly annotate the 298 bare `catch {` blocks in source so errors are never silently swallowed without a recorded reason.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality | Fix |
| -- | -------- | ----- | ---------------- | --- |
| F1 | HIGH | 298 bare `catch {` occurrences exist. | CONFIRMED — `grep -R "catch\s*{" src --include="*.ts" \| wc -l` returns 298. | — |
| F2 | MEDIUM | 139 source files contain at least one bare catch. | CORRECTED — actual sweep returns **153** files (not 139). | Updated count to 153; WP sweep recalculates the reduction target proportionally. |
| F3 | MEDIUM | Hotspots in `target-resolver.ts`, `workspace-config.ts`, `freshness.ts`. | CONFIRMED — all three files exist with 6, 6, and 3 bare catches respectively. Top-20 file list shows 13-test, 10-compile, 10-blueprint-server, 9-doctor as the heaviest. | Adjusted high-concentration file list to match actual top offenders. |
| F4 | MEDIUM | `src/utils/` directory assumed to exist. | DOES NOT EXIST — `ls src/utils/` returns empty. | Task 1.1 must create the directory before placing `try-or-log.ts`. |
| F5 | LOW | `./bin/wp test` as test runner command. | Package.json runs `vitest run` directly; `./bin/wp test` delegates via the CLI surface. Both work. | Use `./bin/wp test` (the repo façade) for consistency with `./bin/wp lint` and `./bin/wp typecheck`. |
| F6 | LOW | `./bin/wp audit ai-contracts` is the gate command. | CONFIRMED — returns "passed" on current HEAD. | — |
| F7 | CRITICAL | Existing `no-swallowed-errors` lint rule in `src/config/oxlint/code-safety.ts` covers empty catches. | DOES NOT COVER — line 76 of code-safety.ts explicitly returns early (`if (body.body.length === 0) return`) for empty catch bodies. The rule only flags `console.error`-only catches that have at least one statement. | Task 1.3 must add a **new companion rule** (`no-bare-catch`) targeting zero-statement catch blocks, not extend the existing rule. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| **Wave 0** | 1.1, 1.3 | None | 2 agents | S, M |
| **Wave 1** | 1.2 | 1.1 | 1 agent | M |
| **Wave 2** | 1.4 | 1.1, 1.2, 1.3 | 1 agent | L |
| **Wave 3** | 1.5 | 1.4 | 1 agent | S |
| **Critical path** | 1.1 → 1.2 → 1.4 → 1.5 (4 waves) | — | 4 waves | — |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual | Notes |
| ------ | ----------------- | ------ | ------ | ----- |
| RW0 | Ready tasks in Wave 0 | ≥ 2 | 2 | 1.1 (helper) + 1.3 (lint rule) run in parallel |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.25 | Sequential plan by nature — lint rule gates the cleanup, helper gates the fix |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.8 | 4 edges / 5 tasks = 0.80 |
| CP | same-file overlaps per wave | 0 | 0 | No two tasks modify the same file in the same wave |

**Parallelization score: C** — CPR is low because the plan is inherently sequential (helper → fix files → massive cleanup → verification). This is acceptable for an audit-and-fix pipeline where each phase validates the previous one. Tasks 1.1 and 1.3 can run in parallel in Wave 0.

## Tasks

### [code-smell] Task 1.1: Introduce `tryOrIgnore` safe-bypass helper

**Status:** todo

**Depends:** None

Create a lightweight helper for intentional error suppression with a required reason string. The codebase has no `src/utils/` directory yet, so create it. Follow existing project conventions: TypeScript strict, Vitest tests, `#` import aliases.

**Files:**

- Create: `src/utils/try-or-log.ts`
- Create: `src/utils/try-or-log.test.ts`

**Steps (TDD):**

1. Write failing test for `tryOrIgnore<T>(reason: string, fn: () => T): T | undefined`:
   - Returns `fn()` result on success.
   - Returns `undefined` on thrown error.
   - Logs the `reason` + error message at debug level (use `console.debug` for no external dependency).
   - Never throws.
2. Run: `vitest run src/utils/try-or-log.test.ts` → verify FAIL (file not found / no export)
3. Implement `tryOrIgnore` with `try { return fn() } catch (err) { console.debug(reason, err); return undefined }`
4. Run: `vitest run src/utils/try-or-log.test.ts` → verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck` → verify PASS

**Acceptance:**

- [ ] `tryOrIgnore` exported from `src/utils/try-or-log.ts` with JSDoc
- [ ] Test covers: success path, error path with `undefined` return, debug log emitted on error
- [ ] `./bin/wp lint` passes
- [ ] `./bin/wp typecheck` passes

### [error-handling] Task 1.2: Audit and fix high-concentration files

**Status:** todo

**Depends:** Task 1.1

Replace bare `catch { }` blocks with `tryOrIgnore(reason, fn)` or proper error handling in the files with the highest bare-catch counts. For each bare catch, decide: proper handling (re-throw / return sentinel), `tryOrIgnore` with a reason, or explicit comment for intentional silence.

Target files (ranked by bare-catch count from top-20 sweep, excluding test files):

1. `src/mcp/blueprint-server.ts` (10 bare catches)
2. `src/cli/commands/compile.ts` (10 bare catches)
3. `src/hooks/doctor.ts` (9 bare catches)
4. `src/blueprint/projects.ts` (8 bare catches)
5. `src/cli/commands/init/detect-consumer.ts` (7 bare catches)
6. `src/quality-engine/target-resolver.ts` (6 bare catches)
7. `src/blueprint/db/workspace-config.ts` (6 bare catches)
8. `src/symlinker/unified-sync.ts` (5 bare catches)

**Files:**

- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/cli/commands/compile.ts`
- Modify: `src/hooks/doctor.ts`
- Modify: `src/blueprint/projects.ts`
- Modify: `src/cli/commands/init/detect-consumer.ts`
- Modify: `src/quality-engine/target-resolver.ts`
- Modify: `src/blueprint/db/workspace-config.ts`
- Modify: `src/symlinker/unified-sync.ts`

**Steps (TDD):**

1. For each file, read all bare `catch { }` blocks (`grep -n "catch\s*{" <file>`)
2. Classify each: (a) must-propagate → add `throw`, (b) intentional ignore → wrap in `tryOrIgnore("reason", () => ...)`, (c) cleanup-only → `tryOrIgnore("cleanup", () => ...)`
3. Apply changes file-by-file
4. Run: `./bin/wp test` after each file change → verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck` → verify PASS after all files done

**Acceptance:**

- [ ] All 8 files have zero bare `catch { }` blocks (verify with `grep -c "catch\s*{"` per file)
- [ ] No behavior change — existing tests pass
- [ ] `./bin/wp lint` passes
- [ ] `./bin/wp typecheck` passes

### [lint] Task 1.3: Add `no-bare-catch` lint rule to CI

**Status:** todo

**Depends:** None

The existing `no-swallowed-errors` rule in `src/config/oxlint/code-safety.ts` explicitly skips empty catch blocks at line 76 (`if (body.body.length === 0) return`). Add a **new companion rule** `no-bare-catch` that targets zero-statement catch bodies. Both rules live in the same plugin file.

**Files:**

- Modify: `src/config/oxlint/code-safety.ts`
- Modify: `src/config/oxlint/code-safety.ts` test suite (if one exists — check `src/config/oxlint/oxlintrc.test.ts`)

**Steps (TDD):**

1. Write a test case in the oxlint test suite that verifies `catch {}` (empty body) triggers a violation and `catch { console.error(e) }` does not (already covered by `no-swallowed-errors`).
2. Run: `vitest run src/config/oxlint/` → verify FAIL on the new test case
3. Add `no-bare-catch` rule to the plugin's `rules` map in `code-safety.ts`:
   - AST visitor: `CatchClause(node)` → if body is `BlockStatement` with 0 statements, report
   - Message: `"Bare catch block with empty body — errors are silently swallowed. Add a reason comment, handle the error, or use tryOrIgnore()."`
4. Run: `vitest run src/config/oxlint/` → verify PASS
5. Run: `./bin/wp lint` → verify the new rule flags remaining bare catches in files not touched by Task 1.2
6. Run: `./bin/wp typecheck` → verify PASS

**Acceptance:**

- [ ] `no-bare-catch` rule rejects `catch {}` and `catch (_) {}` with zero body statements
- [ ] Rule is registered in the `webpresso-safety` plugin alongside `no-swallowed-errors`
- [ ] Oxlint test suite passes
- [ ] `./bin/wp lint` correctly flags remaining bare catches
- [ ] `./bin/wp typecheck` passes

### [qa] Task 1.4: Repository-wide cleanup pass

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3

Systematically replace remaining bare catches across all 153 affected files. The lint rule from Task 1.3 now flags every violation, and the helper from Task 1.1 provides the replacement pattern. Target: 80%+ reduction.

**Files:**

- Modify: all remaining source files with bare `catch { }` blocks (gated by Task 1.3 lint)

**Steps (TDD):**

1. Run `./bin/wp lint` to get the full list of remaining bare-catch violations
2. Process files in descending order of bare-catch count (use the full sweep from Fact-Check)
3. For each file: classify, replace, run `./bin/wp test` after each batch of ~10 files
4. Run: `./bin/wp test` after all replacements → verify PASS
5. Run: `./bin/wp lint` → verify zero `no-bare-catch` violations
6. Run: `grep -R "catch\s*{" src --include="*.ts" | wc -l` → target ≤ 60

**Acceptance:**

- [ ] Bare catch count reduced from 298 to ≤ 60
- [ ] All remaining bare catches have either an explicit comment or `tryOrIgnore("reason", ...)`
- [ ] `./bin/wp test` passes (no regressions)
- [ ] `./bin/wp lint` passes (zero `no-bare-catch` violations)
- [ ] `./bin/wp typecheck` passes

### [qa] Task 1.5: Verification gate

**Status:** todo

**Depends:** Task 1.4

Final audit sweep to confirm the cleanup meets all acceptance criteria and no regressions were introduced.

**Files:**

- None (read-only verification)

**Steps:**

1. Run: `grep -R "catch\s*{" src --include="*.ts" | wc -l` → confirm ≤ 60
2. Run: `./bin/wp test` → confirm PASS
3. Run: `./bin/wp lint` → confirm PASS (zero violations)
4. Run: `./bin/wp typecheck` → confirm PASS
5. Run: `./bin/wp audit ai-contracts` → confirm PASS

**Acceptance:**

- [ ] Bare catch count ≤ 60
- [ ] All three quality gates (`test`, `lint`, `typecheck`) pass
- [ ] AI contracts audit passes

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Bare catch count | `grep -R "catch\s*{" src --include="*.ts" \| wc -l` | ≤ 60 (from 298 baseline) |
| Tests | `./bin/wp test` | Pass — zero failures |
| Lint | `./bin/wp lint` | Zero `no-bare-catch` violations |
| Typecheck | `./bin/wp typecheck` | Pass |
| Audit | `./bin/wp audit ai-contracts` | Pass |

## Non-goals

- Converting every try/catch to Result/Either types.
- Logging at levels above debug for expected failures.
- Changing error handling semantics of business logic.
- Adding an external logging library — use `console.debug` (no deps).

## Risks

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Adding debug logs floods output | LOW | Log at `console.debug` level only; keep messages concise. |
| Some catches are intentionally silent | MEDIUM | Require an explicit `tryOrIgnore("reason", ...)` — no anonymous ignores. |
| Lint rule false positives on test files | LOW | Consider skipping `*.test.ts` files in the rule or scoping the cleanup to source files only. |
| Replacing bare catches changes runtime behavior | HIGH | Run `./bin/wp test` after every batch; git-bisect if regression found. |

## Architecture Decisions

| Decision | Rationale |
| -------- | --------- |
| `tryOrIgnore` over `tryOrNull` only | One helper covers both use cases; `undefined` is idiomatic for "no value" in TypeScript. `null` adds a second sentinel without benefit. |
| `console.debug` over a logging library | Keeps zero dependencies; debug level is invisible by default in production. |
| New lint rule alongside existing `no-swallowed-errors` | Existing rule skips empty catch bodies by design (line 76 early return). Adding the check to the existing rule risks breaking its existing test coverage. A companion rule is cleaner and independently testable. |
| Top-N file fix before mass cleanup | Reduces blast radius — high-count files likely have systemic patterns; fixing them first informs the approach for the long tail. |
| Test files excluded from lint rule scope | Test files contain intentional bare catches for negative testing. Scoping to `src/` non-test files avoids false positives without adding `// eslint-disable` noise. |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 7 |
| Critical | 1 (F7 — existing lint rule skips empty catches) |
| High | 1 (F1 — confirmed 298 bare catches) |
| Medium | 4 (F2, F3, F4, F5) |
| Low | 1 (F6) |
| Fixes applied | 7/7 |
| Cross-plans updated | 0 (no dependent blueprints found) |
| Edge cases documented | 3 (empty catch skip, test file scope, intentional silence) |
| Risks documented | 4 |
| **Parallelization score** | C (CPR 1.25 — inherently sequential audit pipeline) |
| **Critical path** | 4 waves (1.1 → 1.2 → 1.4 → 1.5) |
| **Max parallel agents** | 2 (Wave 0: 1.1 + 1.3) |
| **Total tasks** | 5 (up from 4 — split lint-rule creation from CI integration) |
| **Blueprint compliant** | 5/5 tasks have Depends, Files, Steps (TDD), Acceptance |

**Refinement delta:** The original 4-task plan was split into 5 by separating the lint rule implementation (1.3) from the verification gate (1.5). The high-concentration file list was updated from the blueprint's original guess (target-resolver, workspace-config, freshness, memory-rotation, BlueprintService, sync/client) to the actual top-N by bare-catch count from the codebase sweep. File count corrected from 139 to 153.
