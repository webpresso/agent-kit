---
type: blueprint
title: Fix stream and resource leaks
owner: ozby
status: planned
complexity: S
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/2 tasks done, 0 blocked)'
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

**Goal:** Close the one confirmed leaked file descriptor — the raw `openSync` fd
passed to `writeFileSync` in `compile.ts` lock acquisition — and register the
`quality-log-store.ts` stream error listener at creation time so a mid-run fd
error is observed.

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

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | **REFUTED** | 5 files open a `createWriteStream` without a matching close (installer.ts=1, quality-runner.ts=1, quality-log-store.ts=3, compile.ts=1, hook-bootstrap.ts=1). | **Only `quality-log-store.ts` has `createWriteStream` (1 call, not 3).** The other 4 files have zero `createWriteStream`/`createReadStream` calls. None of the 5 files have unclosed `createReadStream` either. |
| F2 | LOW | No `addEventListener`/`removeEventListener` imbalance. | Confirmed (conclusion unchanged): 9 non-test `addEventListener` vs 4 matching `removeEventListener`. The surplus `addEventListener` calls are intentional once-only handlers (e.g. `chunk-load-recovery.ts` Vite preload error handlers); no leak. |
| F3 | LOW | DB connections are generally closed in `finally`. | Confirmed: 66 `.close()` calls vs 0 `.open(` tracked, indicating `close` is the dominant pattern. |
| F4 | **LOW** (downgraded from MEDIUM) | — (not in original) | **`compile.ts:190`** — `writeFileSync(openSync(lockPath, 'ax'), String(process.pid))` passes a raw `openSync` fd to `writeFileSync`. When `writeFileSync` receives an fd (not a path), it does NOT auto-close, so the fd is held until process exit. **Downgrade rationale:** the fd is reclaimed at process exit of a short-lived CLI that already registers a `process.on('exit', cleanup)` path; this is a cheap correctness fix, not a runtime-fatal leak. |
| F5 | LOW | `quality-log-store.ts` `createWriteStream` has no cleanup. | Has `autoClose: true`, an error handler, and `.end()` in `finalize()`. Gap: the error listener is attached only in `finalize()`, so a mid-run fd error before `finalize()` is unobserved. (Backpressure is NOT a real defect here — see Task 1.2 note.) |

## Tasks

#### [reliability] Task 1.1: Fix openSync fd leak in compile.ts lock acquisition
**Status:** todo
**Depends:** None
Replace the raw-fd `writeFileSync(openSync(...))` lock-acquisition pattern with a
path-based write so no fd is ever exposed.
**Files:**
- Modify: `src/cli/commands/compile.ts`
**Steps (TDD):**
1. Write a test that verifies the lock file is written without a leaked fd (e.g. mock/spy `openSync` and assert it is NOT called for the lock write) — `./bin/wp test --file src/cli/commands/compile.test.ts` verify FAIL
2. Replace `writeFileSync(openSync(lockPath, 'ax'), String(process.pid))` with the path-based form `writeFileSync(lockPath, String(process.pid), { flag: 'ax' })` — this preserves `O_EXCL` exclusive-lock semantics and never exposes a raw fd to leak.
3. `./bin/wp test --file src/cli/commands/compile.test.ts` verify PASS
4. `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] `compile.ts` lock write uses path-based `writeFileSync(lockPath, ..., { flag: 'ax' })`; no raw `openSync` fd is passed to `writeFileSync`
- [ ] Exclusive-lock (`ax` / `O_EXCL`) semantics preserved
- [ ] `./bin/wp test` passes

#### [streams] Task 1.2: Register quality-log-store.ts stream error listener at creation time
**Status:** todo
**Depends:** None
Move the `stream.on('error', ...)` registration from `finalize()` to stream
creation so a mid-run fd error is observed. (Scope deliberately excludes
backpressure buffering — see note.)

> **YAGNI note:** `src/cli/commands/quality-log-store.ts:68-87` already sets
> `autoClose: true` and closes via `stream.end()` in `finalize()`. The sink is a
> fire-and-forget local CLI log writer (write-to-disk, sub-second). Backpressure
> buffering / drain tracking on a local file sink is speculative infra with no
> consumer pull (KISS/YAGNI). This task is the one-line error-listener relocation
> only; the F5 backpressure acceptance criterion is dropped.

**Files:**
- Modify: `src/cli/commands/quality-log-store.ts`
**Steps (TDD):**
1. Add a test that creates a `CliLogSink`, triggers a stream `error` before `finalize()` is called, and verifies the error is observed (no unhandled error) — `./bin/wp test --file src/cli/commands/quality-log-store.test.ts` verify FAIL
2. Register `stream.on('error', ...)` at stream-creation time (not only inside `finalize()`).
3. `./bin/wp test --file src/cli/commands/quality-log-store.test.ts` verify PASS
4. `./bin/wp lint` + `./bin/wp typecheck`
**Acceptance:**
- [ ] Stream `error` listener is registered at creation time (mid-run fd errors are observed, not only at `finalize()`)
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
| Test flakiness from fs state | Use unique temp directories per test. |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 5 |
| REFUTED | 1 (F1: 5-file createWriteStream claim) |
| MEDIUM | 0 (F4 downgraded to LOW) |
| LOW | 4 (F2, F3, F4, F5) |
| Fixes applied to blueprint | F1 replaced with F4; F4 downgraded MEDIUM→LOW; F2 counts corrected (9 vs 4); Task 1.3 removed (prohibited `__tests__/` + nonexistent `src/utils/`); Task 1.2 reduced to error-listener relocation (backpressure cut as YAGNI); Task 1.1 fix changed to path-based `writeFileSync` flag form; Product wedge anchor added |
| Cross-plans updated | 0 |
| Edge cases documented | 1 |
| Risks documented | 2 |
| **Parallelization score** | A (2 tasks, 1 wave, CPR=2.0) |
| **Critical path** | 1 wave |
| **Max parallel agents** | 2 |
| **Total tasks** | 2 |
| **Blueprint compliant** | 2/2 |
