---
type: blueprint
status: draft
complexity: S
created: '2026-05-14'
last_updated: '2026-05-15'
progress: '0% (refined to current repo layout on 2026-05-15)'
depends_on: []
tags: [sqlite, wal, concurrency, reliability]
---

# Harden shared SQLite WAL safety for multi-window agent workloads

**Goal:** Prove and harden the current shared SQLite layer under
multi-process access so future persistent ai-memory/session tools do not
inherit silent write-drop or SQLITE_BUSY failure modes. The current repo
does **not** have `src/session-memory/*`; the active SQLite boundary is
`src/blueprint/db/*`, with `openDb()` in `src/blueprint/db/connection.ts`
and the `bun:sqlite` adapter in `src/blueprint/db/sqlite.ts`.

## Provenance

This blueprint was originally split out of the larger context-mode
replacement plan because WAL/concurrency is an engine-wide prerequisite.
It has now been fact-checked against the current repo and rewritten to
target the SQLite layer that actually exists today.

## Product wedge anchor

- **Stage outcome:** the shared SQLite boundary used by blueprint/db work
  is proven safe under concurrent multi-process writes, and is safe to
  reuse for the future ai-memory/session persistence layer.
- **Consuming surface:** `src/blueprint/db/connection.ts`,
  `src/blueprint/db/sqlite.ts`, and any future persistence work built on
  top of them.
- **New user-visible capability:** none directly; this is a reliability
  prerequisite that prevents latent multi-window data loss in future
  session tooling.

## Architecture Overview

```text
CURRENT:
  openDb(dbPath)
    ├── Database(filename)           src/blueprint/db/sqlite.ts
    ├── PRAGMA journal_mode = WAL    src/blueprint/db/connection.ts
    ├── PRAGMA foreign_keys = ON
    └── runMigrations(db)

TARGET AFTER THIS BP:
  shared SQLite WAL contract
    ├── deterministic multi-process write tests
    ├── explicit busy/locking behavior documented in code + tests
    └── safe foundation for future ai-memory persistence work
```

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents |
| **Wave 1** | 1.3 | 1.1, 1.2 | 1 agent |
| **Wave 2** | 1.4 | 1.3 | 1 agent |
| **Critical path** | 1.1 → 1.3 → 1.4 | — | 3 waves |

### Parallel Metrics Snapshot

| Metric | Target | Actual |
| --- | --- | --- |
| RW0 | ≥ planned agents / 2 | 2 |
| CPR | ≥ 2.5 | 1.33 |
| DD | ≤ 2.0 | 0.75 |
| CP | 0 | 0 |

Refinement delta: this is a narrow reliability BP with one unavoidable
engine fan-in task, so CPR is below ideal; keep it intentionally small
rather than over-splitting fake parallel work.

### Phase 1: shared SQLite concurrency hardening [Complexity: S]

#### [qa] Task 1.1: Add multi-process integration test for the shared SQLite write path

**Status:** todo

**Depends:** None

Create a real multi-process integration test around `openDb()` using a
single temp database file and OS child processes. Use an existing
writable table that goes through the current migration stack (prefer a
simple append-only/event-like table already present in `src/blueprint/db`
tests). Each process should open its own connection and perform repeated
writes to the same db file. Assert all writes persist and no child exits
with SQLITE_BUSY.

**Files:**

- Create: `src/blueprint/db/wal-multiwindow.integration.test.ts`

**Steps (TDD):**

1. Write a failing integration test that spawns 4 processes writing to
   the same DB file through `openDb()`.
2. Run the test repeatedly (10 iterations inside the test or via helper)
   and prove the current behavior.
3. Keep the test deterministic: fixed counts, fixed schema target,
   explicit child exit-code assertions.

**Acceptance:**

- [ ] 10/10 deterministic green on local runs
- [ ] Final persisted row count matches expected total writes
- [ ] No child process exits with SQLITE_BUSY or lock-related failure

#### [qa] Task 1.2: Add multi-connection regression coverage for reopen/reuse semantics

**Status:** todo

**Depends:** None

Strengthen the existing sqlite/connection tests to cover overlapping
connections and writer contention at the API boundary, not only the
child-process e2e path. This task should pin the expected behavior of
`openDb()` and any transaction/retry semantics already present.

**Files:**

- Modify: `src/blueprint/db/migrations.test.ts`
- Modify: `src/blueprint/db/connection.ts` tests if split exists, or add
  a new focused test file near it

**Steps (TDD):**

1. Add failing tests for overlapping connections against the same db file.
2. Assert WAL mode is active and the expected locking behavior is
   observable.
3. Re-run after Task 1.3 if engine hardening is needed.

**Acceptance:**

- [ ] Connection-level overlap behavior is pinned by tests
- [ ] WAL mode is asserted explicitly, not assumed

#### [backend] Task 1.3: Apply the minimal shared SQLite hardening if tests prove it is needed

**Status:** todo

**Depends:** Task 1.1, Task 1.2

If the new tests surface real contention failures, fix the shared
SQLite boundary at its owner:
- `src/blueprint/db/connection.ts`
- `src/blueprint/db/sqlite.ts`

Allowed fixes:
- explicit `busy_timeout`
- explicit transaction discipline
- minimal retry only if justified by test evidence

Do **not** invent a larger persistence refactor here.

**Files:**

- Modify (conditional): `src/blueprint/db/connection.ts`
- Modify (conditional): `src/blueprint/db/sqlite.ts`

**Steps (TDD):**

1. Reproduce failing contention via Tasks 1.1/1.2.
2. Apply the narrowest fix at the shared DB boundary.
3. Re-run all WAL tests to confirm deterministic green.

**Acceptance:**

- [ ] All new WAL/concurrency tests pass
- [ ] Any fix is localized to the shared SQLite owner files
- [ ] No unrelated persistence/API work is bundled in

#### [infra] Task 1.4: Wire WAL tests into the blocking verification lane

**Status:** todo

**Depends:** Task 1.3

Add the new WAL test(s) to the blocking verification lane so future
persistent ai-memory/session work cannot regress the shared SQLite
contract.

**Files:**

- Modify: CI workflow / test entry wiring that owns blocking verification

**Steps (TDD):**

1. Add the new test file(s) to the relevant CI/test entry.
2. Verify they run in the same lane as the other blocking reliability
   checks.

**Acceptance:**

- [ ] WAL tests are part of a blocking verification lane
- [ ] CI fails if shared SQLite concurrency regresses

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Type safety | `wp_typecheck` | Zero errors |
| Lint | `wp_lint` (scoped) | Zero violations |
| Tests | `wp_test` (scoped) | All WAL tests pass |
| Full hook+sqlite slice | targeted blocking lane | Green |

## Cross-Plan References

| Type | Blueprint | Relationship |
| --- | --- | --- |
| Downstream | `replace-context-mode-plugin-with-v1-session-memory-mit-stack-...` | Future ai-memory persistence must build on this validated SQLite boundary |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --- | --- | --- | --- |
| Child-process test is flaky | False confidence / noisy CI | Keep write counts deterministic and fail loudly on the first mismatch | 1.1 |
| Existing tables are too coupled for clean write stress | Test becomes brittle | Use the smallest migrated table with append-only semantics | 1.1 |
| Contention fix requires more than a small connection tweak | Scope explosion | Stop, document, and split follow-up engine work | 1.3 |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Shared SQLite hardening reveals deeper architectural contention | Medium | Keep this BP limited to proving/fixing the owner boundary; defer broader persistence design to BP B |
| CI runtime grows noticeably | Low | Keep WAL suite focused and table-targeted |

## Technology Choices

| Component | Technology | Version | Why |
| --- | --- | --- | --- |
| Process isolation | `child_process.spawn` | Node/Bun current repo runtime | Real multi-process semantics |
| SQLite boundary | `bun:sqlite` + test shim | current repo | Matches the actual shared DB owner |
