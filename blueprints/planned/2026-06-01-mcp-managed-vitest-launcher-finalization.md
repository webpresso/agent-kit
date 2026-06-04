---
type: blueprint
title: MCP managed Vitest launcher finalization
owner: ozby
status: planned
complexity: M
created: '2026-06-01'
last_updated: '2026-06-01'
progress: '0% (fact-checked; code changes already present in working tree before this blueprint)'
depends_on: []
tags:
  - mcp
  - vitest
  - managed-runner
  - wrapper-seam
---

# MCP managed Vitest launcher finalization

## Planning Summary

The original investigation found the MCP/wrapper Vitest failure at the launcher seam: direct Vitest entrypoint execution worked in the downstream monorepo, while `wp test` failed by looking for `node_modules/.bin/vitest`. Fresh inspection now shows `src/mcp/runners/test.ts` no longer contains `node_modules/.bin/vitest` or `vitest.mjs` hardcoding; the implementation appears to have already been started in the working tree. This blueprint records the remaining verification and finalization plan without starting new implementation.

## Fact Check Findings

| ID | Severity | Claim | Verified reality | Blueprint fix |
| --- | --- | --- | --- | --- |
| F1 | HIGH | `src/mcp/runners/test.ts` still has four hardcoded Vitest launch sites. | Fresh inspection on 2026-06-01 found zero `node_modules/.bin/vitest` and zero `vitest.mjs` references in `src/mcp/runners/test.ts`. | Treat root cause as already addressed in the working tree; focus on review, tests, and failure-scope acceptance. |
| F2 | HIGH | Test files are the aligned regression surface. | `src/mcp/runners/test.test.ts` and `src/mcp/tools/test.test.ts` contain new Vitest entrypoint expectations and failure-scope coverage. | Use these files as the primary targeted test set. |
| F3 | MEDIUM | The launcher seam should remain command+args capable. | Current runner source uses command/args-oriented execution counts and no `.bin` lookup strings. | Verify MCP runner plumbing accepts structured command+args runs rather than vp+args-only assumptions. |
| F4 | MEDIUM | Blueprint state was already updated. | Git status showed no blueprint changes before this blueprint creation; only MCP test/runner files were modified. | Add this durable blueprint before any further code work. |

## Key Decisions

| Decision | Rationale |
| --- | --- |
| Do not make additional code changes until this blueprint is reviewed. | User explicitly requested blueprint creation and no implementation yet. |
| Keep the intended behavior as managed structured Vitest resolution. | It matches the verified downstream root cause and avoids package-manager `.bin` assumptions. |
| Preserve failure-scope semantics. | Callers need deterministic `failureScope` values for setup, test, timeout, and runner failures. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| Wave 0 | 1.1, 1.2 | None | 2 agents | S |
| Wave 1 | 2.1 | Wave 0 | 1 agent | S |
| Wave 2 | 3.1 | Wave 1 | 1 agent | XS |
| Critical path | 1.1 → 2.1 → 3.1 | — | 3 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ 2 | 2 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.33 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.75 |
| CP | same-file overlaps per wave | 0 | 0 |

Refinement delta: this is a narrow finalization blueprint over an already-started change, so parallelism is intentionally limited.

## Phase 1: review and regression lock [Complexity: S]

#### [runner] Task 1.1: Verify structured command+args runner plumbing

**Status:** todo

**Depends:** None

Review the current MCP test runner implementation and ensure it launches Vitest from managed structured resolution, not from `node_modules/.bin/vitest` or a hardcoded package-manager assumption.

**Files:**

- Modify: `src/mcp/runners/test.ts`
- Modify: `src/mcp/runners/test.test.ts`

**Steps (TDD):**

1. Confirm existing tests fail if command+args resolution is replaced with `.bin` lookup.
2. Run `wp_test` for `src/mcp/runners/test.test.ts`.
3. If coverage is missing, add only targeted regression tests.
4. Run `wp_test` again for the same file.
5. Run `wp_lint` and `wp_typecheck`.

**Acceptance:**

- [ ] Runner source contains no `node_modules/.bin/vitest` lookup.
- [ ] Tests assert command and args propagation for managed Vitest launch.
- [ ] No vp+args-only assumption remains in MCP runner execution path.

#### [tool] Task 1.2: Verify MCP tool-level failure-scope behavior

**Status:** todo

**Depends:** None

Validate that tool-level callers receive expected `failureScope` values and do not collapse launcher failures into test assertion failures.

**Files:**

- Modify: `src/mcp/tools/test.test.ts`

**Steps (TDD):**

1. Review current failure-scope test cases.
2. Run `wp_test` for `src/mcp/tools/test.test.ts`.
3. Add missing cases only if launcher/setup/test scopes are ambiguous.
4. Run `wp_test` again for the same file.
5. Run `wp_lint` and `wp_typecheck`.

**Acceptance:**

- [ ] Setup/launcher failures are reported separately from test failures.
- [ ] Timeout behavior remains deterministic.
- [ ] Tool response schema remains backward compatible except for corrected launcher behavior.

## Phase 2: downstream parity and narrow verification [Complexity: S]

#### [qa] Task 2.1: Re-run focused seam verification

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Re-run the narrow checks that prove the downstream monorepo failure is fixed by managed structured Vitest resolution rather than parity-test changes.

**Files:**

- Modify: no new files expected unless tests reveal a gap

**Steps (TDD):**

1. Run `wp_test` for `src/mcp/runners/test.test.ts` and `src/mcp/tools/test.test.ts`.
2. Run `wp_typecheck`.
3. Run `wp_lint` for changed MCP files.
4. If available, run the downstream `wp test` seam smoke through the repo-approved wrapper.
5. Record exact evidence in PR notes.

**Acceptance:**

- [ ] Focused MCP tests pass.
- [ ] Typecheck and lint pass.
- [ ] Downstream smoke no longer fails by looking for `node_modules/.bin/vitest`.

## Phase 3: lifecycle closure [Complexity: XS]

#### [docs] Task 3.1: Update blueprint and release notes only after verification

**Status:** todo

**Depends:** Task 2.1

Close the durable planning loop after verification. Do not add a changeset unless the implementation changes public package behavior.

**Files:**

- Modify: this blueprint
- Create: `.changeset/*.md` only if release policy requires it

**Steps (TDD):**

1. Update this blueprint progress with verification evidence.
2. Run `wp_audit(kind="blueprint-lifecycle")`.
3. Add a changeset only if the final implementation affects published package behavior.
4. Run `vp run changeset:status` only if a changeset is added.

**Acceptance:**

- [ ] Blueprint audit passes.
- [ ] Verification evidence is recorded.
- [ ] Release policy is followed if public behavior changed.
