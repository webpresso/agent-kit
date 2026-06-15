---
type: blueprint
title: Fix stream and resource leaks
owner: ozby
status: parked
complexity: S
created: '2026-06-14'
last_updated: '2026-06-15'
progress: "Implemented in PR #139; parked for legal lifecycle transition from planned pending finalization"
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

## Implementation Update (2026-06-15)

Implemented in PR #139 on branch `work/ultragoal-9-blueprints-20260614221933`.
Task status and acceptance checkboxes below were reconciled from the landed code paths and focused verification evidence in this PR. The file is parked because CI enforces the legal first transition from `planned`; finalization can move parked/resumed work through the lifecycle after merge.


**Goal:** Keep the already-present fixes for the one confirmed leaked file
descriptor — the former raw `openSync` fd passed to `writeFileSync` in
`compile.ts` lock acquisition — and the `quality-log-store.ts` stream error
listener registered at creation time, with focused regression coverage so these
resource-cleanup behaviors do not regress.

## Product wedge anchor

- **Stage outcome:** Extraction roadmap "agent-kit works standalone for a 3rd
  party" (see `CLAUDE.md` § The open-sourcing goal) — the `wp` CLI must run
  long-lived/repeated invocations without leaking fds in `edge-matte`/`ingest-lens`
  toolchains.
- **Consuming surface:** `wp compile` (the blueprint-compile CLI verb that
  acquires the `.lock` file in `src/cli/commands/compile.ts`) and the
  `wp_qa`/`wp quality` log sink (`src/cli/commands/quality-log-store.ts`).
- **New user-visible capability:** Consumers can run `wp compile` repeatedly
  (and concurrent QA log writes) in a single process/CI session without
  exhausting file descriptors on the lock-acquisition path.

> **Refinement note (2026-06-14):** Repository inspection found both target
> source fixes already present: `src/cli/commands/compile.ts` uses
> `writeFileSync(lockPath, String(process.pid), { flag: 'ax' })`, and
> `src/cli/commands/quality-log-store.ts` registers `stream.on('error', ...)`
> immediately after `createWriteStream(...)`. Focused regression tests also
> already exist in `src/cli/commands/compile.test.ts` and
> `src/cli/commands/quality-log-store.test.ts`. Execution should therefore be
> verification/finalization, not duplicate implementation.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | **REFUTED** | 5 files open a `createWriteStream` without a matching close (installer.ts=1, quality-runner.ts=1, quality-log-store.ts=3, compile.ts=1, hook-bootstrap.ts=1). | **Only `quality-log-store.ts` has `createWriteStream` (1 call, not 3).** The other 4 files have zero `createWriteStream`/`createReadStream` calls. None of the 5 files have unclosed `createReadStream` either. |
| F2 | LOW | No `addEventListener`/`removeEventListener` imbalance. | Confirmed (conclusion unchanged): 9 non-test `addEventListener` vs 4 matching `removeEventListener`. The surplus `addEventListener` calls are intentional once-only handlers (e.g. `chunk-load-recovery.ts` Vite preload error handlers); no leak. |
| F3 | LOW | DB connections are generally closed in `finally`. | Confirmed: 66 `.close()` calls vs 0 `.open(` tracked, indicating `close` is the dominant pattern. |
| F4 | **LOW** (downgraded from MEDIUM) | — (not in original) | **Resolved in current code:** `compile.ts:189` uses `writeFileSync(lockPath, String(process.pid), { flag: 'ax' })`, preserving path-based exclusive create semantics without exposing a raw fd. Historical risk remains worth locking with the existing regression test. **Downgrade rationale:** the former fd would have been reclaimed at process exit of a short-lived CLI that already registers a `process.on('exit', cleanup)` path; this is a correctness guard, not a runtime-fatal leak. |
| F5 | LOW | `quality-log-store.ts` `createWriteStream` has no cleanup. | **Resolved in current code:** `quality-log-store.ts:68-79` has `autoClose: true`, stores `streamError`, rejects a pending/future `finalize()`, and registers `stream.on('error', ...)` at creation time. Backpressure is NOT a real defect here — see Task 1.2 note. |

## Tasks

#### [reliability] Task 1.1: Verify compile.ts path-based exclusive lock regression
**Status:** done
**Depends:** None
Verify and preserve the current path-based lock write in `runCompile()`. The
current implementation already uses `writeFileSync(lockPath, String(process.pid),
{ flag: 'ax' })`; this task is a regression-lock/finalization task, not a
duplicate source rewrite.
**Files:**
- Modify: `src/cli/commands/compile.ts` only if inspection shows the lock path regressed
- Modify: `src/cli/commands/compile.test.ts` only if the existing regression test is missing or weakened
**Steps (TDD):**
1. Inspect `src/cli/commands/compile.ts` and confirm the compile lock write is path-based with `{ flag: 'ax' }`, not `writeFileSync(openSync(...))`
2. Inspect `src/cli/commands/compile.test.ts` and confirm the regression test mocks `openSync`, runs `runCompile`, asserts `openSync` is not called, and verifies `.compile.lock` cleanup
3. Run: `./bin/wp test --file src/cli/commands/compile.test.ts` — verify PASS
4. If either inspection fails, restore the minimal path-based write/test and rerun the focused test
5. Run: `./bin/wp lint` and `./bin/wp typecheck` before finalizing the blueprint
**Acceptance:**
- [x] `compile.ts` lock write uses path-based `writeFileSync(lockPath, ..., { flag: 'ax' })`; no raw `openSync` fd is passed to `writeFileSync`
- [x] Exclusive-lock (`ax` / `O_EXCL`) semantics are preserved
- [x] `compile.test.ts` covers the no-`openSync` lock-acquisition regression
- [x] `./bin/wp test --file src/cli/commands/compile.test.ts` passes

#### [streams] Task 1.2: Verify quality-log-store stream error listener regression
**Status:** done
**Depends:** None
Verify and preserve the current `stream.on('error', ...)` registration at stream
creation time so a mid-run fd error is observed before `finalize()`. This task is
a regression-lock/finalization task, not a duplicate source rewrite. (Scope
deliberately excludes backpressure buffering — see note.)

> **YAGNI note:** `src/cli/commands/quality-log-store.ts:68-87` already sets
> `autoClose: true` and closes via `stream.end()` in `finalize()`. The sink is a
> fire-and-forget local CLI log writer (write-to-disk, sub-second). Backpressure
> buffering / drain tracking on a local file sink is speculative infra with no
> consumer pull (KISS/YAGNI). This task is the one-line error-listener relocation
> only; the F5 backpressure acceptance criterion is dropped.

**Files:**
- Modify: `src/cli/commands/quality-log-store.ts` only if inspection shows the listener moved back to `finalize()` or disappeared
- Modify: `src/cli/commands/quality-log-store.test.ts` only if the existing mid-run error regression test is missing or weakened
**Steps (TDD):**
1. Inspect `src/cli/commands/quality-log-store.ts` and confirm `stream.on('error', ...)` is registered immediately after `createWriteStream(...)`
2. Inspect `src/cli/commands/quality-log-store.test.ts` and confirm the regression test emits `error` before `finalize()` and expects `finalize()` to reject with that error without an unhandled throw
3. Run: `./bin/wp test --file src/cli/commands/quality-log-store.test.ts` — verify PASS
4. If either inspection fails, restore the minimal creation-time listener/test and rerun the focused test
5. Run: `./bin/wp lint` and `./bin/wp typecheck` before finalizing the blueprint
**Acceptance:**
- [x] Stream `error` listener is registered at creation time (mid-run fd errors are observed, not only at `finalize()`)
- [x] `quality-log-store.test.ts` covers the pre-`finalize()` stream error regression
- [x] `./bin/wp test --file src/cli/commands/quality-log-store.test.ts` passes

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Focused compile regression | `./bin/wp test --file src/cli/commands/compile.test.ts` | Passes; proves no raw `openSync` lock acquisition regression. |
| Focused stream regression | `./bin/wp test --file src/cli/commands/quality-log-store.test.ts` | Passes; proves pre-`finalize()` stream errors are observed. |
| Tests | `./bin/wp test` | Pass. |
| Lint | `./bin/wp lint` | Zero violations. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents | XS |
| **Critical path** | 1.1 (or 1.2) | — | 1 wave | XS |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 2 | 2 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 2.0 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.0 |
| CP | same-file overlaps per wave | 0 | 0 |

**Parallelization score: A** — both tasks are independent (no dependency edges,
no same-file overlap), so the entire plan executes in a single wave with 2
agents. This is a 2-task plan after removing the over-engineered regression task.

## Cross-plan conflicts / dependencies

- `blueprints/planned/2026-06-14-type-safe-sqlite-and-json-parsing.md` Task 3.2
  also touches `src/cli/commands/compile.ts` and `src/cli/commands/compile.test.ts`.
  If both blueprints execute concurrently, run this blueprint's Task 1.1 first or
  require that Task 3.2 preserve the existing no-`openSync` lock regression test.
  That other blueprint currently claims `compile.test.ts` does not exist; code
  inspection shows it does exist, so that plan needs its own refinement.
- `blueprints/planned/2026-06-14-shared-filesystem-io-utilities.md` Tasks 1.2
  and 1.3 also touch `src/cli/commands/compile.ts`; Task 1.3 also touches
  `src/cli/commands/quality-log-store.ts`. Serialize those edits after this
  blueprint's focused regression tests are green, or explicitly preserve these
  regression tests while applying shared utility changes.

## Edge Cases

| Edge Case | Impact | Handling | Finding |
| --------- | ------ | -------- | ------- |
| Current code already contains the intended fixes | Duplicate implementation could churn working code or weaken tests | Treat tasks as regression verification/finalization unless inspection shows regression | F4, F5 |
| Concurrent blueprint edits touch the same files | Parallel agents could overwrite or weaken resource-leak regression coverage | Serialize with the JSON/Zod and shared-filesystem blueprints, or require those plans to preserve these tests | F4, F5 |
| Stream emits `error` before `finalize()` | Without a creation-time listener, Node can surface an unhandled error | Existing listener stores `streamError`; test emits before `finalize()` and expects rejection | F5 |

## Non-goals

- Converting every `readFileSync`/`writeFileSync` to streams.
- Changing write semantics (atomic vs non-atomic).
- Auditing `setTimeout`/`setInterval` cleanup.
- Auditing `openSync` beyond the confirmed leak in compile.ts.
- Replacing intentional fd-duplication patterns (installer.ts child-process stdio inherit, hook-bootstrap.ts stderr redirect).
- Backpressure buffering on local fire-and-forget log sinks (YAGNI — see Task 1.2 note).
- A platform-specific fd-counting regression harness (the Task 1.1 unit test is sufficient regression evidence; a `/proc/self/fd`/`lsof` counter is non-portable over-engineering).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| compile.ts lock change breaks exclusive-lock semantics | Keep `ax` (O_EXCL) flag via the path-based `writeFileSync(lockPath, ..., { flag: 'ax' })`; only change how the bytes are written, not the locking flag. |
| Regression tests already exist but are weakened by neighboring blueprints | Treat `compile.test.ts` no-`openSync` coverage and `quality-log-store.test.ts` pre-`finalize()` error coverage as required invariants for any concurrent edit to those files. |
| Test flakiness from fs state | Use unique temp directories per test. |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 5 |
| REFUTED | 1 (F1: 5-file createWriteStream claim) |
| MEDIUM | 0 (F4 downgraded to LOW) |
| LOW | 4 (F2, F3, F4, F5) |
| Fixes applied to blueprint | F1 replaced with F4; F4 downgraded MEDIUM→LOW; F2 counts corrected (9 vs 4); Task 1.3 removed (prohibited `__tests__/` + nonexistent `src/utils/`); Task 1.2 reduced to error-listener relocation (backpressure cut as YAGNI); Task 1.1 fix changed to path-based `writeFileSync` flag form; Product wedge anchor added; 2026-06-14 re-refinement converted both tasks to regression verification because the source fixes/tests already exist |
| Cross-plans updated | 0 (current blueprint only; conflicts documented above) |
| Edge cases documented | 3 |
| Risks documented | 3 |
| **Parallelization score** | A (2 tasks, 1 wave, CPR=2.0) |
| **Critical path** | 1 wave |
| **Max parallel agents** | 2 |
| **Total tasks** | 2 |
| **Blueprint compliant** | 2/2 |
