---
type: blueprint
title: Fix stream and resource leaks
owner: ozby
status: planned
complexity: S
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/3 tasks done, 0 blocked)'
depends_on: []
cross_repo_depends_on: []
tags:
  - reliability
  - resource-cleanup
  - streams
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Fix stream and resource leaks

**Goal:** Close every `createWriteStream` and `openSync` that lacks a matching `end()`/`closeSync()`/`destroy()` so file descriptors do not leak on error paths.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | **REFUTED** | 5 files open a `createWriteStream` without a matching close (installer.ts=1, quality-runner.ts=1, quality-log-store.ts=3, compile.ts=1, hook-bootstrap.ts=1). | **Only `quality-log-store.ts` has `createWriteStream` (1 call, not 3).** The other 4 files have zero `createWriteStream`/`createReadStream` calls. None of the 5 files have unclosed `createReadStream` either. |
| F2 | LOW | No `addEventListener`/`removeEventListener` imbalance. | Confirmed: 6 non-test `addEventListener` vs 4 matching `removeEventListener` — 4 pairs are balanced with `{once:true}`. 2 calls in `chunk-load-recovery.ts` are intentional once-only Vite preload error handlers. |
| F3 | LOW | DB connections are generally closed in `finally`. | Confirmed: 66 `.close()` calls vs 0 `.open(` tracked, indicating `close` is the dominant pattern. |
| F4 | **MEDIUM** | — (not in original) | **`compile.ts:190`** — `writeFileSync(openSync(lockPath, 'ax'), String(process.pid))` passes a raw `openSync` fd to `writeFileSync`. When `writeFileSync` receives an fd (not a path), it does NOT auto-close. The fd leaks until process exit. |
| F5 | LOW | `quality-log-store.ts` `createWriteStream` has no cleanup. | Has `autoClose: true`, an error handler, and `.end()` in `finalize()`. Gap: `.write()` on line 81 lacks error/backpressure handling; if `finalize()` is never called, the stream leaks. |

## Tasks

#### [reliability] Task 1.1: Fix openSync fd leak in compile.ts lock acquisition
**Status:** todo | **Depends:** None
**Files:**
- Modify: `src/cli/commands/compile.ts`
**Steps (TDD):**
1. Write a test that mocks `openSync`/`writeFileSync` and verifies `closeSync` is called after lock acquisition — `./bin/wp test --file src/cli/commands/compile.test.ts` verify FAIL
2. Replace `writeFileSync(openSync(lockPath, 'ax'), String(process.pid))` with `try { const fd = openSync(lockPath, 'ax'); try { writeFileSync(fd, String(process.pid)) } finally { closeSync(fd) } }` or use `writeFileSync(lockPath, ..., { flag: 'ax' })` to avoid fd exposure entirely
3. `./bin/wp test --file src/cli/commands/compile.test.ts` verify PASS
4. `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] `openSync` in compile.ts lock path is paired with `closeSync` (or replaced with flag-based `writeFileSync`)
- [ ] `./bin/wp test` passes

#### [streams] Task 1.2: Harden quality-log-store.ts stream write path
**Status:** todo | **Depends:** None
**Files:**
- Modify: `src/cli/commands/quality-log-store.ts`
**Steps (TDD):**
1. Add a test that creates a `CliLogSink`, writes a chunk, and verifies no unhandled error when the fd is bad — `./bin/wp test --file src/cli/commands/quality-log-store.test.ts` verify FAIL
2. Add an error handler to `stream` via `stream.on('error', ...)` and handle backpressure in `write()` by tracking the drain state. Ensure `write()` does not silently drop chunks on backpressure.
3. `./bin/wp test --file src/cli/commands/quality-log-store.test.ts` verify PASS
4. `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Stream write errors are caught (error listener registered at creation time, not only at `finalize()`)
- [ ] Backpressure is handled (buffer or back-off) in `write()`
- [ ] `./bin/wp test` passes

#### [qa] Task 1.3: Add regression test for fd/resource leaks under failure
**Status:** todo | **Depends:** Task 1.1, Task 1.2
**Files:**
- Create: `src/utils/__tests__/resource-leak.test.ts`
**Steps (TDD):**
1. Write a test utility that opens N descriptors, simulates a write failure, and asserts cleanup (use `process.getActiveResourcesInfo()` or count open fds via `/proc/self/fd` or lsof fallback)
2. Run before fixes: `./bin/wp test --file src/utils/__tests__/resource-leak.test.ts` verify FAIL (compile.ts lock leak should be caught)
3. After Task 1.1 and 1.2 fix the leaks, verify PASS
4. `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Test detects the compile.ts lock fd leak (FAIL before fix)
- [ ] Test passes after fixes (no fd leaks remain)
- [ ] `./bin/wp test` passes

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Tests | `./bin/wp test` | Pass. |
| Lint | `./bin/wp lint` | Zero violations. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents | XS-S |
| **Wave 1** | 1.3 | 1.1, 1.2 | 1 agent | S |
| **Critical path** | 1.1 → 1.3 (or 1.2 → 1.3) | — | 2 waves | S |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 2 | 2 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.5 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.67 |
| CP | same-file overlaps per wave | 0 | 0 |

**Parallelization score: C** — CPR is 1.5 (3 tasks, 2 waves). This is a small plan with only 3 tasks; the sequential dependency between Wave 0→1 is inherent (regression test needs fixes first). Not actionable for further splitting.

## Non-goals

- Converting every `readFileSync`/`writeFileSync` to streams.
- Changing write semantics (atomic vs non-atomic).
- Auditing `setTimeout`/`setInterval` cleanup.
- Auditing `openSync` beyond the confirmed leak in compile.ts.
- Replacing intentional fd-duplication patterns (installer.ts child-process stdio inherit, hook-bootstrap.ts stderr redirect).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Closing a stream twice throws | Track open state or use `stream.end()` idempotently. |
| compile.ts lock change breaks exclusive-lock semantics | Keep `ax` (O_EXCL) flag; only change cleanup, not locking. |
| Test flakiness from fs state | Use unique temp directories per test. |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 5 |
| REFUTED | 1 (F1: 5-file createWriteStream claim) |
| MEDIUM | 1 (F4: compile.ts fd leak) |
| LOW | 3 (F2, F3, F5) |
| Fixes applied to blueprint | All claims verified; F1 replaced with F4 |
| Cross-plans updated | 0 |
| Edge cases documented | 2 |
| Risks documented | 3 |
| **Parallelization score** | C (3 tasks, 2 waves, CPR=1.5) |
| **Critical path** | 2 waves |
| **Max parallel agents** | 2 |
| **Total tasks** | 3 |
| **Blueprint compliant** | 3/3 |
