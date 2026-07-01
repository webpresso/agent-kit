---
type: blueprint
status: draft
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "0% (drafted)"
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

**Status:** todo

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

- [ ] Regression proof fails before production change and passes after.
- [ ] `snapshot()` still persists valid JSON for captured events.
- [ ] No benchmark threshold or timeout is increased.
- [ ] `pnpm run native:session-memory:test` passes.
- [ ] `pnpm run native:session-memory:bench:run && pnpm run native:session-memory:bench:gate` passes locally or any environment limitation is recorded with evidence.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Native tests | `pnpm run native:session-memory:test` | All session-memory Rust tests pass |
| Bench gate | `pnpm run native:session-memory:bench:run && pnpm run native:session-memory:bench:gate` | All Criterion SLO checks pass without threshold increases |
| Format | `pnpm run native:session-memory:fmt` | Rust formatting clean |

## Non-goals

- Raising `snapshot_50_events` thresholds or workflow timeouts.
- Broad benchmark redesign beyond the failing hot path.
- Release-package changes from PR #337.
