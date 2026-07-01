---
type: blueprint
title: Fix session-memory snapshot bench gate
owner: codex
status: completed
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "100% (implemented; verification passed)"
depends_on: []
cross_repo_depends_on: []
tags: [native, session-memory, ci, performance]
---

# Fix session-memory snapshot bench gate

**Goal:** Make the native session-memory `snapshot_50_events` benchmark gate pass by fixing the snapshot hot path at its owner, without raising benchmark thresholds or hiding failures.

## Planning Summary

- Trigger: PR #337 CI job `Native session-memory` failed in `Native session-memory bench gate`.
- Evidence: `snapshot_50_events` mean was 532,021 ns against its 500,000 ns mean SLO; median was 204,008 ns and all other native checks passed.
- Constraint: Repo rule says timeout/threshold increases are not fixes; repair must be future-proof and minimal.

### Phase 1: Snapshot hot-path repair [Complexity: S]

#### [backend] Task 1.1: Stream snapshot serialization and cap enforcement

**Status:** done

**Depends:** None

Fix `session_memory_core::session::snapshot` so the time cap is enforced while rows are consumed and JSON is serialized directly, rather than collecting every event and then allocating a second JSON value vector. Keep the public `SnapshotResult` contract unchanged.

**Files:**

- Modify: `native/session-memory-engine/crates/session-memory-core/src/session.rs`
- Modify: `native/session-memory-engine/crates/session-memory-core/tests/session_test.rs`
- Modify if needed: `native/session-memory-engine/Cargo.toml`

**Steps (TDD):**

1. Add a regression test proving a zero-cap snapshot can return a partial snapshot without eagerly scanning a large backlog.
2. Verify the regression fails against the current eager implementation.
3. Implement the minimal owner-side streaming/cap fix.
4. Run native session-memory tests and benchmark gate.

**Acceptance:**

- [x] Regression proof fails before production change and passes after.
- [x] `snapshot()` still persists valid JSON for captured events.
- [x] No benchmark threshold or timeout is increased.
- [x] `pnpm run native:session-memory:test` passes.
- [x] `pnpm run native:session-memory:bench:run && pnpm run native:session-memory:bench:gate` passes locally.

## Verification Gates

| Gate         | Command                                                                                 | Success Criteria                                          |
| ------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Native tests | `pnpm run native:session-memory:test`                                                   | All session-memory Rust tests pass                        |
| Bench gate   | `pnpm run native:session-memory:bench:run && pnpm run native:session-memory:bench:gate` | All Criterion SLO checks pass without threshold increases |
| Format       | `pnpm run native:session-memory:fmt`                                                    | Rust formatting clean                                     |

## Non-goals

- Raising `snapshot_50_events` thresholds or workflow timeouts.
- Broad benchmark redesign beyond the failing hot path.
- Release-package changes from PR #337.

## Verification evidence

Fresh verification on 2026-07-01:

- Regression-first proof: `cargo test --manifest-path native/session-memory-engine/Cargo.toml --package session-memory-core test_snapshot_zero_cap_does_not_scan_full_backlog -- --exact --nocapture` failed before the production change with SQLite `OperationInterrupted`, then passed after the fix.
- `pnpm run native:session-memory:fmt` passed.
- `pnpm run native:session-memory:test` passed: 37 Rust tests across `session-memory-core` and `session-memory-napi`, including the new zero-cap backlog regression.
- `pnpm run native:session-memory:clippy` passed with `-D warnings`.
- `pnpm run native:session-memory:bench:run && pnpm run native:session-memory:bench:gate` passed; `snapshot_50_events` mean was 117,030 ns and median was 117,468 ns against the unchanged 500,000 ns SLO.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T16:11:54Z
- verified-head: d107df0455218358dbbbd25d6db418bd0f863d8e
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                    | Evidence                                                                       |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| C1  | PR #339 fixed the `snapshot_50_events` bench gate without raising the benchmark threshold.               | repo:blueprints/completed/2026-07-01-fix-session-memory-snapshot-bench-gate.md |
| C2  | The shipped fix streams snapshot serialization and keeps the public `SnapshotResult` contract unchanged. | repo:native/session-memory-engine/crates/session-memory-core/src/session.rs    |

### Material Decisions

| ID  | Decision          | Chosen option                           | Rejected alternatives                   | Rationale                                                             |
| --- | ----------------- | --------------------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| D1  | Bench gate repair | Fix the snapshot hot path at the owner. | Raise benchmark thresholds or timeouts. | Preserves the SLO while removing the synchronous-path outlier source. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result |
| --------- | ---------------------------- | ---------------- | ----------- |
| Test      | wp test                      | pass             | pass        |
| Lifecycle | wp audit blueprint-lifecycle | pass             | pass        |

### Residual Unknowns

None.
