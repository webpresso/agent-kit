---
type: blueprint
title: Blueprint platform sync — make platform-synced SQLite the canonical store
status: completed
completed_at: '2026-05-12'
complexity: L
owner: ozby
created: 2026-05-12
last_updated: '2026-05-12'
tags:
  - blueprints
  - sqlite
  - platform
  - canonical
  - sync
depends_on:
  - blueprint-structured-store
---

# Blueprint platform sync

## Product wedge anchor

- **Stage outcome:** Any machine, any agent, any CLI can query or mutate
  a blueprint's state and see a consistent view — no manual file-sync,
  no `git pull`, no stale local SQLite.
- **Consuming surface:** All 8 blueprint MCP tools (`ak_blueprint_task
  _next`, `ak_blueprint_task_advance`, `ak_blueprint_promote`,
  `ak_blueprint_finalize`, …), `ak blueprint start/task/finalize` CLI,
  and the `/pll` skill.
- **New user-visible capability:** Two agents on different machines
  collaborating on the same blueprint never conflict. State persists
  across machine wipes. Blueprint templates are served from the platform
  catalog.

## Why this exists

`blueprint-structured-store` (completed) built step 1: a fast local
SQLite projection rebuilt from markdown on cold-start. Markdown was kept
canonical and SQLite was a derived cache.

That was an intermediate design. The long-term direction is:

```
CURRENT                                FUTURE (this blueprint)
────────                               ───────────────────────
markdown ──ingest──► local SQLite      platform SQLite ──replica──► local SQLite
    ▲                    │                  ▲                            │
 canonical             queries             canonical                  queries
 (git-tracked)         (fast)             (Webpresso platform)        (fast)
```

Mutations today: `edit markdown → ingestAll() → MCP query SQLite`.
Mutations after: `write to platform API → platform SQLite → refresh local replica`.
Markdown becomes a human-readable derived artifact: generated from platform
state and committed to git for history, but never the authoritative source.

## Architecture

### Target data flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  MUTATIONS (task complete, start, finalize, etc.)                    │
│                                                                       │
│  ak CLI / MCP tools                                                   │
│       │                                                               │
│       ▼                                                               │
│  BlueprintSyncClient (new — src/blueprint/sync/client.ts)            │
│       │                                                               │
│       │  POST /api/blueprints/:repo/:slug/events                      │
│       │  (Webpresso platform API — in private monorepo)              │
│       │                                                               │
│       ▼                                                               │
│  Webpresso Platform SQLite ◄──────────────────────────┐              │
│  (canonical, hosted, shared across machines)           │              │
│       │                                                │ sync pull    │
│       │  GET /api/blueprints/:repo/:slug/snapshot      │ on-demand    │
│       ▼                                                │              │
│  Local replica SQLite (.agent/.blueprints.db)          │              │
│  (fast read cache, gitignored, rebuilds from platform) │              │
│       │                                                               │
│       ▼                                                               │
│  MCP query tools (fast local reads, no round-trip)                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Markdown as derived artifact (F2 fix)

After every successful platform write, the MCP/CLI mutation tools
regenerate the corresponding `_overview.md` on the local machine and
create a git commit. Responsibility:

- **The mutation tool** (e.g., `ak_blueprint_task_advance`) generates the
  updated markdown from the platform snapshot.
- **Agent context:** if the user has other staged changes, the markdown
  commit is made as a separate, atomic commit with message
  `chore(blueprint): sync [slug] task [id] to [status]`. No mixing with
  user changes.
- **Manual override:** `AK_BLUEPRINT_NO_AUTO_COMMIT=1` skips the auto-commit;
  the markdown is written to disk but left unstaged.

This means `git log blueprints/` retains a complete audit trail of all
blueprint mutations, even though markdown is no longer the canonical source.

### Audit migration (F3 fix)

`ak audit blueprint-lifecycle` currently reads markdown. After this blueprint
lands, the audit must run against the local replica SQLite (or the platform
snapshot) rather than markdown files directly. This is a tracked migration
task (Task 3.3 below).

### Conflict model

Platform is the single writer. A write that can't reach the platform
(offline) is either buffered or rejected — resolved in Task 0.1 (Q1).

### Replica sync mechanism

Pull-on-demand for v1.x: replica is refreshed before every MCP query
that cares about freshness (mutations always refresh; reads use a
configurable TTL). Polling and SSE are deferred to v2.x.

## Design decisions (resolved 2026-05-12, platform team design session)

| # | Question | Decision |
|---|---|---|
| Q1 | **Offline mutation strategy** | **A — Buffer locally, push when reconnected.** Mutations write to local SQLite outbox first. Sync queue flushes when network is available. Conflict: last-write-wins on reconnect (idempotent eventId). |
| Q2 | **Auth model** | **C — OAuth device flow.** `ak setup --login` opens browser → OAuth consent → token stored in OS keychain. Same UX as `gh auth login`. No manual token management. |
| Q3 | **Replica freshness SLA** | **B — 30 second TTL.** Reads within 30s use local replica (near-zero latency). After 30s, one background refresh fires before responding. Tunable via `AK_REPLICA_TTL` env var. |
| Q4 | **Markdown generation** | **C — No markdown. Agents read SQLite/MCP only.** The `blueprints/` directory becomes a legacy/migration artifact. Platform users have no markdown files on disk; all blueprint access goes through SQLite replica + MCP tools. Human-readable view is a future platform UI concern. |
| Q5 | **Template catalog** | **C — GitHub-hosted, fetched by URL.** `ak blueprint new --template <slug>` resolves to a public GitHub repo (e.g. `webpresso/blueprint-templates`). No platform API dependency for templates. Community can submit PRs. |
| Q6 | **Monorepo boundary** | **A — Types + client in agent-kit (OSS); implementation in webpresso monorepo (private).** agent-kit ships: `PlatformApiClient` interface, TypeScript event types, sync engine logic. webpresso monorepo ships: the actual API endpoints, auth handler, platform database. |
| Q7 | **Migration** | **A — `ak setup --sync` idempotent import on first auth.** On first OAuth login, agent-kit scans `blueprints/` and pushes all existing blueprints to the platform in the background. Idempotent — safe to re-run. After migration, markdown is archived (moved to `.blueprints-archive/`). |

### Q4 architectural implication

Q4:C is a breaking change from the current `blueprint-structured-store` design. The `blueprints/` directory, lifecycle audit, and markdown-based task tracking are replaced by SQLite replica + MCP tools as the primary surface. This affects:

- `ak audit blueprint-lifecycle` — Task 3.3 must migrate this audit to read from SQLite, not markdown (risk R3).
- `ak blueprint finalize` CLI — continues to work but writes to platform, not markdown files.
- `/pll` skill — already reads via MCP tools; no change needed.
- `blueprints/` directory — becomes archive after `ak setup --sync` migration.

## Technology Choices

| Choice | Used For | Justification |
|---|---|---|
| `fetch` (Node 24+ built-in) | HTTP to platform API | No new dep; matches existing pattern |
| `vi.stubGlobal('fetch', vi.fn())` | HTTP mocking in tests | Matches existing test pattern in `src/telemetry/setup-tthw.test.ts:45-73`; avoids MSW dependency |
| `better-sqlite3` | Local replica | Already shipped by `blueprint-structured-store` |
| `ingestAll()` (`src/blueprint/db/ingester.ts:421`) | Rebuild local replica from platform snapshot | Existing function, already imported in `src/mcp/blueprint-server.ts:18` |
| **NOT MSW** | — | Codebase uses `vi.stubGlobal('fetch', vi.fn())`; MSW adds a dependency without benefit |

## Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Platform API not yet built; blueprint assumes endpoints exist | HIGH | Q6 design session confirms what needs to be built in platform-api vs. what's in agent-kit |
| R2 | Markdown auto-commit conflicts with user's staged changes | HIGH | `AK_BLUEPRINT_NO_AUTO_COMMIT=1` escape hatch; auto-commit is separate atomic commit |
| R3 | `ak audit blueprint-lifecycle` reads markdown — silently wrong after migration | HIGH | Task 3.3 migrates the audit to read from SQLite replica |
| R4 | Pull-on-demand adds latency to every MCP mutation that must refresh | MEDIUM | TTL-based staleness (Q3); reads within TTL don't network-refresh |
| R5 | Thundering herd: many agents start simultaneously, all pull replica | MEDIUM | Replica staleness check is a local timestamp compare; only one pull fires per TTL window per process |
| R6 | runner_events (v1.0 blueprint Task 1.3) creates local-only table; must also sync | MEDIUM | Include in Task 0.1 platform API contract design; `runner_events` syncs via `pushRunnerEvent` or bundled in blueprint event payload |
| R7 | Blueprint history for 18+ existing blueprints not in platform | LOW | Task 3.1 migration script; idempotent, safe to re-run |

## Edge Cases

| ID | Case | Task | Test |
|---|---|---|---|
| E1 | Platform API unreachable during mutation | Task 1.1 | Test: platform fetch fails → offline behavior per Q1 |
| E2 | Auth token expires mid-pll run (long blueprint) | Task 1.1 | Test: 401 response → token-refresh attempt → clear error if refresh fails |
| E3 | Two agents mutate same task simultaneously | Task 2.1 | Test: platform returns 409 conflict → retry logic or clear error |
| E4 | User has staged changes when markdown auto-commit fires | Task 2.1 | Test: verify auto-commit is atomic and leaves staged changes untouched |
| E5 | Local replica stale by > TTL when `ak_blueprint_task_next` reads | Task 1.2 | Test: stale replica → pull-on-demand refresh before returning result |
| E6 | `AK_BLUEPRINT_NO_AUTO_COMMIT=1` set — markdown written but not committed | Task 2.1 | Test: env var set → file written → git status shows untracked/modified |

## What already exists (leverage)

- `src/blueprint/db/` — full SQLite schema, `ingestAll()`, ingester, migrations.
- `src/mcp/blueprint-server.ts` — all 8 MCP tools with clear mutation pattern.
- `src/blueprint/db/workspace-config.ts` — `ingestWorkspaceRepos()` for org/repo detection via `gh repo view`.
- `src/blueprint/db/migrations/0001_seed.sql` — schema to replicate.
- `src/telemetry/setup-tthw.test.ts` — establishes `vi.stubGlobal('fetch', vi.fn())` as the HTTP mocking pattern.

## Cross-plan references

- **`blueprint-structured-store` (completed):** Built the local SQLite projection this blueprint syncs FROM. `.agent/.blueprints.db` cold-starts from markdown — after this blueprint, it cold-starts from the platform snapshot.
- **`agent-kit-v1-evidence-ledger` (in-progress):** Task 1.3 adds `runner_events` table (migration 0002) locally. Once this platform-sync blueprint lands, `runner_events` must also sync — included in Task 0.1 design scope (Q6). No change needed to v1.0 execution; local-only runner_events is correct for now.

---

## Tasks

### Wave 0 — Design gate (no deps — RW0 = 1)

#### [design] Task 0.1: Resolve open questions Q1-Q7

**Status:** done
**Depends:** None

This task is a design session with the Webpresso platform team. No code
is written until all 7 questions are answered. Output is
`notes/design-decisions.md` alongside this blueprint.

**Files:**
- Create: `blueprints/draft/blueprint-platform-sync/notes/design-decisions.md`

**Steps:**
1. Schedule design session with platform team.
2. Document decisions for each of Q1-Q7 with explicit rationale.
3. Sketch the platform API contract: at minimum `POST /blueprints/:repo/:slug/events` and `GET /blueprints/:repo/:slug/snapshot` request/response shapes.
4. Confirm monorepo boundary (Q6): which TypeScript interfaces live in agent-kit (public) vs. platform-api (private)?
5. Include `runner_events` sync in the design (R6 — feeds into Task 0.2).

**Acceptance:**
- [x] All 7 questions answered with explicit decision + rationale.
- [x] Platform API contract sketched (endpoint shapes, auth header format, error codes).
- [x] Monorepo boundary confirmed.
- [x] **Per-repo auth scoping:** auth token is scoped to the calling repo; platform API rejects cross-repo access. Document the enforcement mechanism (JWT claim, signed repo ID, etc.).
- [x] `notes/design-decisions.md` committed alongside this blueprint.

---

### Wave 1 — API contract (depends on Task 0.1 — RW1 = 1)

#### [design] Task 0.2: Define `BlueprintPlatformClient` TypeScript interface

**Status:** done
**Depends:** Task 0.1

Write the TypeScript interface that agent-kit exposes. This is the
public boundary between open-source agent-kit code and the private
platform-api implementation. Platform team implements against this
interface; agent-kit ships the interface + a production URL injected via
env var.

**Files:**
- Create: `src/blueprint/sync/types.ts` (interface + event/snapshot types)
- Create: `src/blueprint/sync/types.test.ts` (type-level assertions)
- Create: `blueprints/draft/blueprint-platform-sync/notes/api-contract.md`

**Steps (TDD):**
1. Write type-level tests asserting `BlueprintPlatformClient` satisfies the
   interface contract (using `type _A = Expect<Equal<...>>`).
2. `pnpm test src/blueprint/sync/types.test.ts` — FAIL (module not found).
3. Define the interface per the Q1-Q7 decisions from Task 0.1.
4. `pnpm test` — PASS.
5. `pnpm lint && pnpm typecheck`.

**Acceptance:**
- [x] `BlueprintPlatformClient` interface defines at minimum: `pushEvent`, `getSnapshot`, `listTemplates`.
- [x] **Idempotency (per CEO review 2A):** every event payload includes `eventId: string` (UUID generated by client). Platform contract: duplicate `eventId` for the same repo returns 200 without re-applying the event.
- [x] Event payload type covers all 8 mutation operations.
- [x] Platform team has reviewed the contract (async; can be in-progress).
- [x] `pnpm lint:pkg` (attw) passes — new `./blueprint/sync/types` subpath export.
- [x] `notes/emergency-rollback.md` created documenting the `AK_BLUEPRINT_PLATFORM_DISABLED=1` recovery procedure (per CEO review 1A).

---

### Wave 2 — Sync client + replica (depends on Task 0.2 — RW2 = 2)

#### [sync] Task 1.1: Implement `BlueprintSyncClient`

**Status:** done
**Depends:** Task 0.2

Implement the agent-kit-side sync client using `fetch` (Node 24+ built-in).
Handles auth header injection, retry on transient errors, offline detection,
and error classification (4xx vs 5xx vs network error).

Tests mock using `vi.stubGlobal('fetch', vi.fn())` — NOT MSW.

**Files:**
- Create: `src/blueprint/sync/client.ts`
- Create: `src/blueprint/sync/client.test.ts`
- Create: `src/blueprint/sync/auth.ts` (credential loading from env var per Q2 decision)
- Create: `src/blueprint/sync/auth.test.ts`

**Steps (TDD):**
1. `client.test.ts`: `pushEvent` succeeds → returns platform snapshot; platform returns 5xx → retries up to 3 times; `fetch` throws ECONNREFUSED → offline path per Q1 decision; 401 → auth-refresh attempt.
2. `pnpm test src/blueprint/sync/client.test.ts` — FAIL.
3. Implement using `vi.stubGlobal('fetch', vi.fn())` DI seam (inject fetch as a parameter for testability).
4. `pnpm test` — PASS.
5. `pnpm lint && pnpm typecheck`.

**Acceptance:**
- [x] `pushEvent` writes to platform and returns snapshot.
- [x] `pushEvent` generates a UUID `eventId` per call (per CEO review 2A); idempotent on retry.
- [x] Offline behavior matches Q1 decision (buffer or reject with clear error).
- [x] `AK_BLUEPRINT_PLATFORM_DISABLED=1` bypasses platform writes; falls back to markdown-canonical mode (per CEO review 1A).
- [x] 429 rate-limit response triggers exponential backoff (NOT immediate retry); surfaces as offline behavior after max retries exceeded.
- [x] Structured log on every `pushEvent`: `{level, eventType, eventId, httpStatus, durationMs}` (per CEO review 8A).
- [x] Local counter for consecutive sync failures stored in replica schema; `ak blueprint show` surfaces 'Last synced: <ts>' and 'Sync failures (last hour): N'.
- [x] Credentials loaded from env var (never hardcoded).
- [x] **getSnapshot() tests (per eng review 3A):**
  - [x] Happy path: 200 response → `ingestAll()` called; local replica reflects snapshot.
  - [x] 404 (repo not found) → clear error thrown; replica unchanged.
  - [x] Connection drop / JSON parse error → error thrown; replica unchanged.
- [x] **auth.loadCredential() tests (per eng review 3A):**
  - [x] Env var present → token returned.
  - [x] Env var missing → throws with clear error message before any `fetch` call.
  - [x] Env var empty string → treated as missing; same error.
- [x] Tests use `vi.stubGlobal('fetch', vi.fn())` — no MSW dependency added.
- [x] Per-function cognitive complexity ≤ 8.

---

#### [sync] Task 1.2: Pull-on-demand replica refresh

**Status:** done
**Depends:** Task 0.2

Before any MCP mutation tool reads from local SQLite, check replica
freshness and pull from platform if stale. Staleness threshold configurable
via `AK_BLUEPRINT_REPLICA_TTL_S` (default: 30).

**Files:**
- Create: `src/blueprint/sync/replica.ts`
- Create: `src/blueprint/sync/replica.test.ts`

**Steps (TDD):**
1. Test: replica fresh (age < TTL) → no pull; replica stale (age ≥ TTL) → pull triggered; TTL=0 → always pull.
2. FAIL → implement → PASS.
3. `pnpm lint && pnpm typecheck`.

**Acceptance:**
- [x] Staleness check is a local timestamp compare (no network call if fresh).
- [x] **Single-flight pattern (per CEO review Section 7):** concurrent replica-refresh calls within the same process coalesce to a single pull via a mutex/promise-sharing pattern. No thundering herd when 6 pll agents all expire TTL simultaneously.
- [x] Pull adds < 200ms to MCP query tools when replica is fresh (unit test with mocked fetch).
- [x] `AK_BLUEPRINT_REPLICA_TTL_S` env var respected.

---

### Wave 3 — First mutation tool (depends on Task 1.1 + 1.2 — RW3 = 1)

#### [mcp] Task 2.1: Migrate `ak_blueprint_task_advance` to platform write

**Status:** done
**Depends:** Task 1.1, Task 1.2

`ak_blueprint_task_advance` is the highest-traffic mutation tool. Swap its
mutation path from "edit markdown + `ingestAll()`" to "push event to platform
→ refresh local replica → regenerate markdown as derived artifact → auto-commit
markdown (unless `AK_BLUEPRINT_NO_AUTO_COMMIT=1`)".

This task ESTABLISHES the pattern all other mutation tools (Tasks 2.2-2.7)
will follow. Do it first; the others copy the pattern.

**Files:**
- Modify: `src/mcp/blueprint-server.ts` (the `handleTaskAdvance` function, currently ~lines 259-292)
- Modify: `src/mcp/blueprint-server.test.ts` (or matching test file)

**Steps (TDD):**
1. Test: task advance → `BlueprintSyncClient.pushEvent` called with correct payload → local markdown updated → auto-commit made.
2. Test: `AK_BLUEPRINT_NO_AUTO_COMMIT=1` → markdown written, not committed.
3. Test: platform unreachable → offline behavior per Q1 decision.
4. Test: user has staged changes → auto-commit is atomic and leaves staged changes untouched.
5. FAIL → swap mutation path → PASS.
6. `pnpm lint && pnpm typecheck`.

**Acceptance:**
- [x] Platform API is the primary write path (markdown edit is derived output).
- [x] Auto-commit is atomic; never mixes with user's staged changes.
- [x] `AK_BLUEPRINT_NO_AUTO_COMMIT=1` suppresses commit; file still written.
- [x] Offline path consistent with Q1 decision.
- [x] **IRON RULE REGRESSION (eng review):** With `AK_BLUEPRINT_PLATFORM_DISABLED=1`, `ak_blueprint_task_advance` produces byte-identical markdown output and SQLite state as the pre-sync markdown-canonical implementation. Verified via a golden-fixture snapshot test or before/after state comparison.

---

### Wave 4 — Remaining mutation tools (depends on Task 2.1 — RW4 = 6)

Tasks 2.2-2.7 each follow the same pattern established in Task 2.1.
They are independent of each other and run in parallel.

#### [mcp] Task 2.2: Migrate `ak_blueprint_promote`

**Status:** done
**Depends:** Task 2.1

Swap `ak_blueprint_promote`'s mutation path. Promote moves a blueprint
between lifecycle directories (e.g., `planned/` → `in-progress/`).

**Files:**
- Modify: `src/mcp/blueprint-server.ts` (promote handler)
- Modify: matching test

**Steps (TDD):** Same pattern as Task 2.1 — mock platform write, verify markdown updated and directory moved, verify auto-commit.

**Acceptance:**
- [x] Platform is primary write path.
- [x] Directory move reflected in platform snapshot + local replica.
- [x] Auto-commit includes the directory rename.

---

#### [mcp] Task 2.3: Migrate `ak_blueprint_finalize`

**Status:** done
**Depends:** Task 2.1

**Files:**
- Modify: `src/mcp/blueprint-server.ts` (finalize handler)
- Modify: matching test

**Acceptance:**
- [x] Platform is primary write path.
- [x] Blueprint marked `completed` in platform + local replica.
- [x] Markdown moved to `blueprints/completed/` as derived output + auto-committed.

---

#### [mcp] Task 2.4: Migrate `ak_blueprint_new`

**Status:** done
**Depends:** Task 2.1

`ak_blueprint_new` creates a new blueprint scaffold. After this task,
creation registers the blueprint with the platform immediately (no
markdown-first creation).

**Files:**
- Modify: `src/mcp/blueprint-server.ts` (new blueprint handler)
- Modify: matching test

**Acceptance:**
- [x] New blueprint registered in platform before markdown is written.
- [x] Markdown scaffold committed as derived output.

---

#### [mcp] Task 2.5: Migrate `ak_blueprint_task_next` (read tool with replica refresh)

**Status:** done
**Depends:** Task 2.1

`ak_blueprint_task_next` is a read-only tool that returns the next ready
task. It does not write to the platform, but it must refresh the local
replica if stale (using Task 1.2's replica layer). This task wires the
replica refresh into the read path.

**Files:**
- Modify: `src/mcp/blueprint-server.ts` (task_next handler)
- Modify: matching test

**Acceptance:**
- [x] Stale replica triggers pull-on-demand before returning result.
- [x] No write to platform.
- [x] TTL respected: fresh replica → no network round-trip.

---

#### [mcp] Task 2.6: Migrate `ak blueprint start` CLI

**Status:** done
**Depends:** Task 2.1

`ak blueprint start` is the CLI entry point for beginning a blueprint.
Currently moves the directory and updates markdown frontmatter. After
this task, it writes to the platform first.

**Files:**
- Modify: `src/cli/commands/blueprint/index.ts` (start handler, per CLI surface)
- Modify: matching test

**Acceptance:**
- [x] Platform API is primary write path.
- [x] Directory move derived from platform response.
- [x] Auto-commit.

---

#### [mcp] Task 2.7: Migrate `ak blueprint task complete` CLI

**Status:** done
**Depends:** Task 2.1

**Files:**
- Modify: `src/cli/commands/blueprint/index.ts` (task complete handler)
- Modify: matching test

**Acceptance:**
- [x] Platform API is primary write path.
- [x] Markdown updated as derived output.
- [x] Auto-commit.

---

### Wave 5 — Migration + audit + templates (depends on Wave 4 — RW5 = 3)

#### [migration] Task 3.1: Import existing blueprints to platform

**Status:** done
**Depends:** Task 2.2, Task 2.3, Task 2.4, Task 2.5, Task 2.6, Task 2.7

One-shot migration script: reads all 18+ markdown blueprints and
tech-debt items, pushes them to the platform API as historical records.
Idempotent: safe to re-run.

**Files:**
- Create: `scripts/migrate-blueprints-to-platform.ts`
- Create: `scripts/migrate-blueprints-to-platform.test.ts`

**Steps (TDD):**
1. Test: fixture blueprints → pushed to mocked platform → platform state reflects all blueprints.
2. Test: re-run → no duplicate events (idempotent).
3. FAIL → implement → PASS.

**Acceptance:**
- [x] All 18+ blueprints imported.
- [x] Script idempotent.
- [x] `ak audit blueprint-lifecycle` passes after migration.

---

#### [audit] Task 3.2: Migrate `ak audit blueprint-lifecycle` to SQLite replica (F3 fix)

**Status:** done
**Depends:** Task 2.2, Task 2.3, Task 2.4, Task 2.5, Task 2.6, Task 2.7

`ak audit blueprint-lifecycle` currently reads markdown files. After this
task, it reads from the local SQLite replica (which reflects platform
state) instead. Markdown is no longer the audit source of truth.

**Files:**
- Modify: `src/cli/commands/audit-core.ts` (or wherever blueprint-lifecycle audit reads from)
- Modify: matching test

**Steps (TDD):**
1. Test: audit reads from SQLite replica, not markdown; result matches platform state even when markdown is stale.
2. FAIL → swap read source → PASS.
3. `pnpm lint && pnpm typecheck`.

**Acceptance:**
- [x] Audit reads from SQLite replica.
- [x] Audit produces the same result as before for a fully-migrated repo.
- [x] `ak audit blueprint-lifecycle` passes in CI.

---

#### [templates] Task 3.3: `ak blueprint new --template` queries platform catalog

**Status:** done
**Depends:** Task 3.1

Replace the local-catalog-file approach with a platform API query.
Templates are stored in the platform, not as files in consumer repos.
Falls back to a minimal skeleton when offline.

**Files:**
- Modify: `src/cli/commands/blueprint/new.ts` (template-resolver — swap to `BlueprintSyncClient.listTemplates()`)
- Modify: matching test

**Acceptance:**
- [x] `ak blueprint new --template feature-cloudflare-worker` fetches template from platform.
- [x] Offline fallback: minimal skeleton + clear notice that platform templates are unavailable.

---

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
|---|---|---|---|---|
| **Wave 0** | 0.1 | None | 1 (design) | M |
| **Wave 1** | 0.2 | Wave 0 | 1 (design) | S |
| **Wave 2** | 1.1, 1.2 | Wave 1 | 2 agents | M each |
| **Wave 3** | 2.1 | Wave 2 | 1 (pattern-setter) | S |
| **Wave 4** | 2.2, 2.3, 2.4, 2.5, 2.6, 2.7 | Wave 3 | 6 agents | XS each |
| **Wave 5** | 3.1, 3.2, 3.3 | Wave 4 | 3 agents | S each |
| **Critical path** | 0.1 → 0.2 → 1.1 → 2.1 → 3.1 | — | 6 waves | L |

## Parallel Metrics Snapshot

| Metric | Formula | Target | Actual |
|---|---|---|---|
| RW0 | Ready tasks in Wave 0 | ≥ 3 (for 6 agents / 2) | **1** ✗ (design phase inherently sequential) |
| RW4 | Ready tasks in Wave 4 | ≥ 6 | **6** ✓ |
| CPR | 13 tasks / 6 waves | ≥ 2.5 | **2.17** ✗ |
| DD | ~14 edges / 13 tasks | ≤ 2.0 | **~1.1** ✓ |
| CP | same-file overlaps per wave | 0 | **0** ✓ |

**Parallelization score: C** — CPR is 2.17 (below 2.5 target). This is
structural, not correctable: the design phase (Waves 0-1) must be
sequential, and the audit migration (Wave 5) must follow the tool
migrations. The Wave 4 fan-out (6 parallel agents) is the main speedup.

**Refinement delta note:** CPR could reach 2.5 by extracting 3 more
tasks from the design phase (e.g., splitting 0.1 into per-question
sub-tasks) but that adds coordination overhead without speeding execution.
Accept C score for a design-gated blueprint; the implementation phases
are well-parallelized.

## Refinement Summary

| Metric | Value |
|---|---|
| Findings total | 6 |
| Critical | 0 |
| High | 3 (MSW→vi.stubGlobal; markdown commit ownership; audit migration) |
| Medium | 1 (thundering herd on pull-on-demand) |
| Low | 2 (existing function names confirmed; net-new paths confirmed) |
| Fixes applied | 6/6 |
| Cross-plans updated | 1 (runner_events sync noted) |
| Edge cases documented | 6 |
| Risks documented | 7 |
| **Parallelization score** | **C** (inherent to design-first structure) |
| **Critical path** | 6 waves |
| **Max parallel agents** | 6 (Wave 4) |
| **Total tasks** | 13 |
| **Blueprint compliant** | 13/13 |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Plan Refine | `/plan-refine` | Blueprint format + fact-check | 1 | CLEAR | 6 findings, all applied; parallelization score C (inherent to design-gated structure) |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | HOLD SCOPE; 3 AUQs: 1A (rollback escape hatch), 2A (idempotent pushEvent via UUID), 8A (observability logging + lastSyncedAt); all accepted. 4 inline fixes: per-repo auth scoping, 429 rate-limit backoff, single-flight replica, security scope in Task 0.1. |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | CLEAR | 0 arch issues, 0 code quality, 2 test findings: 3A (getSnapshot+auth tests added to Task 1.1 acceptance), IRON RULE regression (AK_BLUEPRINT_PLATFORM_DISABLED=1 regression added to Task 2.1 acceptance). 0 critical gaps. |

- **UNRESOLVED:** 0 — all findings resolved.
- **VERDICT: CEO + ENG CLEARED — ready to move to planned/ and begin Task 0.1 design session.**
