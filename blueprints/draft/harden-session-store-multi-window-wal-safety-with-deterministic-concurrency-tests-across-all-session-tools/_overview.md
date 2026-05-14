---
type: blueprint
status: draft
complexity: S
created: '2026-05-14'
last_updated: '2026-05-14'
progress: '0% (drafted)'
depends_on: []
tags: [session-memory, wal, concurrency, reliability]
---

# Harden session-store multi-window WAL safety (engine-wide)

**Goal:** Prove and harden v1 session-store's behavior under concurrent
multi-process writes (two Claude Code windows, hook + manual call,
fetch-and-index racing capture, etc.) for ALL session-* tools, not just
one. Replaces the WAL test that was previously bundled into the
context-mode-replacement blueprint (split out per Codex outside-voice
finding 2026-05-14: WAL safety is engine-wide concern, not
fetch-and-index-specific).

## Provenance

Originally Task 1.3 inside `replace-context-mode-plugin-with-v1-session-
memory-mit-stack-...`. Codex outside-voice review surfaced that WAL
safety affects every session-* tool (capture, snapshot, search, execute,
batch-execute, fetch-and-index). Bundling it into a license-removal BP
entangled two unrelated risks. This BP now owns the engine-wide
concurrency story.

## Product wedge anchor

- **Stage outcome:** Eliminate silent dropped session events under
  multi-window concurrency for the agent-kit reference consumer
  (ozby/ingest-lens). Today, two Claude Code windows on the same repo
  + a Codex session can race on the same `~/.webpresso/sessions/<hash>.db`
  with no integration test asserting safety. After this BP, every
  session-* tool has a deterministic concurrency contract.
- **Consuming surface:** All `ak_session_*` MCP tools
  (capture/restore/search/snapshot/execute/batch-execute, plus future
  fetch-and-index from BP B). Consumers see no API change — only
  reliability improvement.
- **New user-visible capability:** Agents can run multiple Claude Code
  / Codex sessions on the same repo simultaneously without losing
  session events to silent SQLITE_BUSY drops. Hook authors can stop
  worrying about race conditions on `~/.webpresso/sessions/`.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents |
| **Wave 1** | 1.3 | 1.1, 1.2 | 1 agent |
| **Wave 2** | 1.4 | 1.3 | 1 agent |
| **Critical path** | 1.1 → 1.3 → 1.4 | — | 3 waves |

### Phase 1: Engine-wide WAL hardening [Complexity: S]

#### [qa] Task 1.1: Multi-process integration test for `session_events` table

**Status:** todo

**Depends:** None

Spawn N child processes (`child_process.spawn`, not worker_threads —
need OS-level processes to mirror real multi-window scenario) each
calling `captureEvent()` against the same `dbPath`. Mocked content,
deterministic seeding. Assert all writes persisted, no SQLITE_BUSY
surfaces to caller, total event count matches expected.

**Files:**

- Create: `src/session-memory/session-events.wal-multiwindow.integration.test.ts`

**Steps (TDD):**

1. Write integration test: 4 child processes × 25 captureEvent calls
   each = 100 events; assert sources table has all 100.
2. Run 10 consecutive invocations; assert all 10 green.
3. If ANY run drops events, root-cause (busy_timeout? checkpoint
   starvation?); fix at engine layer; do not raise the test bound.

**Acceptance:**

- [ ] 10/10 deterministic green
- [ ] 100/100 events persisted in every run
- [ ] Engine fix landed if `busy_timeout = 250` insufficient

#### [qa] Task 1.2: Multi-process integration test for `sources` table (fetch-and-index path)

**Status:** todo

**Depends:** None

Same shape as Task 1.1 but exercising `insertChunks()` from two
processes simultaneously against the same `dbPath` with different
sources. Asserts both source rows + their chunks present, no
constraint violations.

**Files:**

- Create: `src/session-memory/sources.wal-multiwindow.integration.test.ts`

**Steps (TDD):**

1. 2 child processes each insert 50 chunks under different `source`
   labels; assert final `sources` table has both rows with correct
   `chunk_count`.
2. Repeat 10 times.

**Acceptance:**

- [ ] 10/10 deterministic green
- [ ] Both sources persisted with correct chunk counts in every run

#### [backend] Task 1.3: Engine-level fix if busy_timeout insufficient

**Status:** todo

**Depends:** Task 1.1, Task 1.2

If either integration test surfaces dropped writes or unhandled
SQLITE_BUSY, fix at the engine layer:

- Bump `busy_timeout` (only with measured justification per `no-timeout-as-fix.md` rule)
- Add WAL checkpoint scheduling
- Add SQLITE_BUSY retry at `SessionStore` boundaries
- Document trade-offs

If both tests pass with current config, this task is a no-op
documented as such.

**Files:**

- Modify (conditionally): `src/session-memory/store.ts`,
  `src/session-memory/bun-store.ts`, `src/session-memory/session.ts`

**Acceptance:**

- [ ] Tasks 1.1 + 1.2 green deterministically
- [ ] If engine fix applied, root-cause documented in commit

#### [infra] Task 1.4: Wire WAL tests into CI

**Status:** todo

**Depends:** Task 1.3

Add the new integration tests to the CI flow that runs on PRs touching
`src/session-memory/`. Mark as required check.

**Files:**

- Modify: `.github/workflows/ci.yml` or equivalent
- Modify: any `vitest.config.ts` integration-test glob

**Acceptance:**

- [ ] PR check fails if either WAL test fails
- [ ] PR check completes within current CI time budget

---

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Type safety | `ak_typecheck` | Zero errors |
| Lint | `ak_lint` (scoped) | Zero violations |
| Unit tests | `ak_test` (scoped) | All pass |
| Integration | new WAL multi-window tests | 10/10 deterministic green |
| Full QA | `ak_qa` | Pass |

## Cross-Plan References

| Type | Blueprint | Relationship |
| --- | --- | --- |
| Downstream | `replace-context-mode-plugin-with-v1-session-memory-mit-stack-...` (BP B) | BP B's `depends_on` includes this BP per Codex outside-voice 2026-05-14 |

## Non-goals

- Designing a new concurrency primitive — this BP validates the
  existing WAL+busy_timeout config is sufficient (or fixes it minimally
  if not)
- Cross-machine concurrency (network FS, etc.) — out of scope; SQLite
  WAL is single-machine
- Performance regression testing — separate concern

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Test reveals deeper concurrency bug requiring schema change | Engine rework expands scope | Document and split into a follow-up BP if needed; do not paper over |
| `child_process.spawn` integration test flaky in CI | Reliability gate becomes noise | Root-cause flake; do not raise test bounds (per `no-timeout-as-fix.md`) |

## Technology Choices

| Component | Technology | Version | Why |
| --- | --- | --- | --- |
| Process isolation | `child_process.spawn` | Node 24+ | Real multi-process semantics; not worker_threads |
| Test framework | vitest | repo pinned | Existing |
