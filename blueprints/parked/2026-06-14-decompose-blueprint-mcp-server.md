---
type: blueprint
title: Decompose blueprint MCP server
owner: ozby
status: parked
complexity: XL
created: '2026-06-14'
last_updated: '2026-06-21'
progress: '0% (0/9 tasks done, 0 blocked, updated 2026-06-21)'
parked_reason: >-
  Refresh needed before execution: shared-module extraction partially landed and
  blueprint-server line/function inventory drifted; avoid duplicating extraction work.
depends_on: []
cross_repo_depends_on: []
tags:
  - architecture
  - mcp
  - blueprint
  - srp
---

# Decompose blueprint MCP server

**Goal:** Split `src/mcp/blueprint-server.ts` from a 3,194-line god-object into thin wiring and per-tool handler modules.

## Product wedge anchor

- **Stage outcome:** Sustainable blueprint MCP surface (the `wp_blueprint_*` tool family that powers `wp blueprint` execution in Claude Code / Codex). A 3,194-line single-file server is the maintenance bottleneck blocking safe iteration on every new `wp_blueprint_*` verb.
- **Consuming surface:** The 16 MCP tools registered via `registerBlueprintServer` / `registerBlueprintTools` (`wp_blueprint_query`, `wp_blueprint_list`, `wp_blueprint_get`, `wp_blueprint_context`, `wp_blueprint_task_next`, `wp_blueprint_task_advance`, `wp_blueprint_task_verify`, `wp_blueprint_promote`, `wp_blueprint_finalize`, `wp_blueprint_transition`, `wp_blueprint_create`, `wp_blueprint_put`, `wp_blueprint_new`, `wp_blueprint_depgraph`, `wp_blueprint_validate`, `wp_blueprint_projects`) — the tools Claude Code/Codex call when running `wp blueprint new`, `wp blueprint task next`, `wp blueprint promote`, etc.
- **New user-visible capability:** No new tool contract; the wedge is reliability/velocity — after this lands, a contributor can add or fix a single `wp_blueprint_*` verb by editing one ≤200-line handler module under `src/mcp/blueprint/handlers/` instead of navigating a 3,194-line file, and the contract test in Task 2.2 fails fast if a verb is ever silently unregistered.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | HIGH | 3,194 lines. | `wc -l` returns 3,194. Confirmed. |
| F2 | HIGH | 58 functions (export + plain named), 24 import statements. | Confirmed via AST scan: 58 named functions (3 `export function`, 55 `function`), 24 `import` lines. |
| F3 | HIGH | Imports from ~22 module areas. | Confirmed: `#db/*`, `#core/*`, `#lifecycle/*`, `#utils/*`, `#evidence`, `#freshness`, `#projects`, `#aggregate`, `#project-resolver`, `#projection-ready`, `#next-action`, `#mcp/tools/_shared`, lazy `#sync/*` and `#paths` imports, `gray-matter`, `zod`, plus node builtins. |
| F4 | MEDIUM | Tool handlers mixed with DB/FS/sync logic. | Confirmed: 16 handler functions (`handleQuery`, `handleNew`, `handleValidate`, `handleTaskNext`, `handleTaskAdvance`, `handleTaskVerify`, `handlePromote`, `handleFinalize`, `handleDepgraph`, `handleBlueprintList`, `handleBlueprintGet`, `handleBlueprintContext`, `handleBlueprintPut`, `handleBlueprintTransition`, `handleBlueprintCreate`, `handleProjects`) co-located with `openDbRW`, `readVt`/`writeVt`, `reIngest`, `resolveToolProject`, `runPlatformMutationSync`, and mutation freshness helpers in one file. |
| F5 | MEDIUM | 16 MCP tools registered. | Confirmed: 15 in `registerBlueprintTools` + `wp_blueprint_projects` in `registerBlueprintServer`. Total: 16 tools mapped to 16 handlers. |
| F6 | MEDIUM | Shared schemas (`summaryEnvelopeOutputSchema`, `nextActionOutputSchema`) are inline. | Confirmed: defined at lines 2556/2565 inside `registerBlueprintTools`. Must move to `_shared/` for reuse across handler modules. |
| F7 | LOW | `src/mcp/blueprint/` directory does not exist. | Confirmed: neither `src/mcp/blueprint/` nor `src/mcp/blueprint/handlers/` nor `src/mcp/blueprint/_shared/` exists. All are greenfield. |
| F8 | LOW | `src/mcp/server.integration.test.ts` exists (11,468 bytes). | Confirmed: file present at expected path. Also 20+ blueprint-server test files exist in `src/mcp/`. |
| F9 | LOW | Handler files listed in original blueprint. | Confirmed: 16 handler names listed match the 16 actual `handleXxx` functions. |
| F10 | HIGH | Sync adapter is module-level mutable singleton. | Confirmed: `_syncAdapterFactory` (line 123) is module-level mutable state, resolved via `resolveSyncAdapter` (line 143), with exported test seam `_setSyncAdapterFactory` (line 131); mutation handlers reach it via `runPlatformMutationSync` (line 225). Moving mutation handlers out without moving this singleton forces a `handlers/ → blueprint-server.ts → handlers/` import cycle. Resolved by Task 1.0 (extract to `_shared/sync.ts`, pass resolver as a parameter). |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.0, 1.1 | None | 2 agents | M / S-M |
| **Wave 1** | 1.2, 1.3, 1.4, 1.5, 1.6 | Wave 0 (Task 1.1; mutation handlers 1.4/1.5 also need Task 1.0) | 5 agents | S-M |
| **Wave 2** | 2.1 | Wave 1 | 1 agent | M |
| **Wave 3** | 2.2 | Wave 2 | 1 agent | S |
| **Critical path** | 1.1 → {1.2…1.6} → 2.1 → 2.2 | — | 4 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 3 | 2 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 2.25 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 1.33 |
| CP | same-file overlaps per wave | 0 | 0 |

**Parallelization score: B** — Wave 0 is now correctly limited to the two foundational extractions (Task 1.0 sync seam, Task 1.1 shared helpers) because the handler tasks (1.2–1.6) genuinely depend on the `_shared/` modules those tasks create. Five handler agents fan out in Wave 1 once the foundation lands (CREATE-only, no file conflicts), then one serialized rewire in Wave 2 and one contract-test task in Wave 3. RW0 (2) is below the ≥3 target because the dependency reality (handlers cannot typecheck before `_shared/` exists) does not permit honest over-parallelization at Wave 0; the wide fan-out happens in Wave 1 (5 agents).

## Edge Cases

| # | Scenario | Impact | Mitigation |
| -- | -------- | ------ | ---------- |
| E1 | Handler breaks tool schema contract during extraction | Tool returns wrong shape to MCP client | Each handler keeps its existing Zod/JSON schemas co-located; schema extraction is CREATE-only in Wave 0–1, unchanged until Wave 2 wiring. |
| E2 | Merge conflict with in-flight blueprint work | Stale imports or duplicated code after rebase | Keep diff mechanical; all changes are file MOVEs not LOGIC changes. Rebase checklist in Task 2.1. |
| E3 | Shared schemas (`summaryEnvelopeOutputSchema`, `nextActionOutputSchema`) imported from `_shared/` but handler tests use them | Tests break if import path wrong | Extract schemas into `_shared/schema.ts` in Task 1.1; all handlers import them via the `#mcp/blueprint/_shared/schema` subpath. Tests verify schema identity. |
| E4 | Existing test files import from `./blueprint-server.ts` directly | ~20 test files need import path updates | Test imports stay pointing at `blueprint-server.ts` (which re-exports or keeps the wiring). Tests that test internal helpers need new import paths — handled in Task 1.1 acceptance. |
| E5 | `registerBlueprintTools` vs `registerBlueprintServer` split | Two registration entry points, handler duplication risk | `registerBlueprintServer` wraps `registerBlueprintTools` + adds `wp_blueprint_projects`. Keep both in the slim server file; only handler *implementations* move out. |
| E6 | Sync adapter singleton (`_syncAdapterFactory`/`resolveSyncAdapter`/`_setSyncAdapterFactory`/`runPlatformMutationSync`, lines 116–186, 225) is module-level mutable state reached by mutation handlers | Moving mutation handlers while the singleton stays in `blueprint-server.ts` forces a `handlers/ → blueprint-server.ts → handlers/` import cycle the Risk table forbids | The sync seam **MOVES** to `src/mcp/blueprint/_shared/sync.ts` in blocking Task 1.0. Mutation handlers (1.4, 1.5, and the `put`/`create` handlers in 1.6) receive the resolved adapter — or a `() => Promise<SyncAdapter \| null>` resolver — as an explicit parameter. No handler imports back from `blueprint-server.ts`. |
| E7 | Mutation freshness helpers (`hashMutationPayload`, `validateMutationFreshnessToken`, etc.) used by multiple handlers | Duplicate or circular imports if placed in wrong module | Extract to `_shared/freshness.ts` in Task 1.1; handlers import via `#mcp/blueprint/_shared/freshness`. |
| E8 | Projection-read helpers (`getCurrentProjectBlueprint`, `listCurrentProjectBlueprintRows`, `staleProjectionResponse`, lines 1591–1651) are also called by `persistBlueprintMarkdown` (line 391) | Keeping them handler-private creates a `_shared/ → handlers/` back-edge (cycle) | Extract these three into `src/mcp/blueprint/_shared/projection.ts` in Task 1.1 so both `_shared/db.ts` (via `persistBlueprintMarkdown`) and the list/get/context handlers import them from one `_shared/` home. |

## Risks

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Merge conflicts with in-flight blueprint work | HIGH | Coordinate with active blueprint tasks; keep refactor purely mechanical. Rebase after each Wave task completes. |
| Subtle behavioral drift during handler move | HIGH | TDD steps in every task: extract → test passes → commit. Zero logic changes in Wave 0–1; Wave 2 only changes import paths and wiring. |
| import path churn breaks existing 20+ test files | MEDIUM | Handler extraction moves handler bodies to new files but leaves re-exports or keeps wiring in `blueprint-server.ts`. Tests targeting the server file continue to work; handler-level tests are new. |
| Circular dependency between `_shared/` and handler modules | MEDIUM | `_shared/` modules have zero imports from `handlers/`. The sync seam (Task 1.0) and projection helpers (E8) are extracted to `_shared/` specifically to remove the two real back-edges. Enforced by lint rule in CI. |
| Handler extraction exposes internal signatures that should stay private | LOW | Export only the handler function; keep helper functions module-scoped (no `export` unless needed). |

## Non-goals

- Rewriting blueprint business logic.
- Changing the public MCP tool contract (tool names, input/output schemas unchanged).
- Extracting every one-liner; keep small pure helpers co-located with their consumer.
- Changing the server startup flow (`registerBlueprintServer` → `registerBlueprintTools` call chain).
- Modifying `auto-discover.ts` or the general MCP server boot sequence.

---

## Tasks

#### Task 1.0: Extract sync-adapter seam to _shared/sync.ts

**Status:** todo

**Depends:** None

Extract the module-level sync-adapter singleton out of `blueprint-server.ts` into `src/mcp/blueprint/_shared/sync.ts` **before** any mutation handler moves. This is a blocking prerequisite for the mutation handler tasks (1.4, 1.5, and the `put`/`create` handlers in 1.6): if the singleton stayed in `blueprint-server.ts`, moved mutation handlers would have to import `resolveSyncAdapter` back from `blueprint-server.ts`, creating exactly the `handlers/ → blueprint-server.ts → handlers/` cycle the Risk table forbids (F10/E6).

The seam is `_syncAdapterFactory` (line 123), `resolveSyncAdapter` (line 143), the `_setSyncAdapterFactory` test seam (line 131), the `SyncAdapter` type, and `runPlatformMutationSync` (line 225). Move them verbatim; mutation handlers will receive a resolved adapter or a `() => Promise<SyncAdapter | null>` resolver as an explicit parameter.

**Files:**

- Create: `src/mcp/blueprint/_shared/sync.ts`
- Create: `src/mcp/blueprint/_shared/sync.test.ts`

**Steps (TDD):**

1. Move `SyncAdapter`, `_syncAdapterFactory`, `resolveSyncAdapter`, `_setSyncAdapterFactory`, and `runPlatformMutationSync` (lines 116–186, 225) into `_shared/sync.ts` verbatim (zero logic changes).
2. Re-export `_setSyncAdapterFactory` from `blueprint-server.ts` so existing tests that call the test seam keep their import path working.
3. Write `sync.test.ts` covering: default factory resolution, the `_setSyncAdapterFactory` override seam, and `runPlatformMutationSync` invoking the resolved adapter (mock the adapter).
4. Run: `./bin/wp test --file src/mcp/blueprint/_shared/sync.test.ts` — verify PASS.
5. Run: `./bin/wp lint --file src/mcp/blueprint/_shared/sync.ts` — verify zero violations (imports use `#*` subpaths, not `../`).
6. Run: `./bin/wp typecheck` — verify zero errors.

**Acceptance:**

- [ ] `_shared/sync.ts` exports `SyncAdapter`, `resolveSyncAdapter`, `_setSyncAdapterFactory`, `runPlatformMutationSync`.
- [ ] Mutation handlers will be able to receive the adapter/resolver as a parameter (no `handlers/ → blueprint-server.ts` import).
- [ ] `_setSyncAdapterFactory` test seam still reachable from its existing import path.
- [ ] Zero logic changes from original code.
- [ ] `./bin/wp lint` + `./bin/wp typecheck` pass.

---

#### Task 1.1: Extract shared helper modules

**Status:** todo

**Depends:** None

Extract standalone helper functions from `blueprint-server.ts` into `src/mcp/blueprint/_shared/` modules. These helpers have no dependency on any handler — they are pure utilities used by multiple handlers. Each extracted module gets a co-located test file. All cross-module imports inside these files MUST use `#mcp/blueprint/_shared/*` subpaths, never `../` parent-relative imports (the `no-relative-parent-imports` lint rule rejects `../`).

**Files:**

- Create: `src/mcp/blueprint/_shared/db.ts`
- Create: `src/mcp/blueprint/_shared/db.test.ts`
- Create: `src/mcp/blueprint/_shared/errors.ts`
- Create: `src/mcp/blueprint/_shared/errors.test.ts`
- Create: `src/mcp/blueprint/_shared/validation-timestamp.ts`
- Create: `src/mcp/blueprint/_shared/validation-timestamp.test.ts`
- Create: `src/mcp/blueprint/_shared/payload.ts`
- Create: `src/mcp/blueprint/_shared/payload.test.ts`
- Create: `src/mcp/blueprint/_shared/schema.ts`
- Create: `src/mcp/blueprint/_shared/project.ts`
- Create: `src/mcp/blueprint/_shared/project.test.ts`
- Create: `src/mcp/blueprint/_shared/freshness.ts`
- Create: `src/mcp/blueprint/_shared/freshness.test.ts`
- Create: `src/mcp/blueprint/_shared/projection.ts`
- Create: `src/mcp/blueprint/_shared/projection.test.ts`

**Functions to extract (by module):**

| Module | Functions |
| ------ | --------- |
| `db.ts` | `openDbRW`, `reIngest`, `persistBlueprintMarkdown`, `dbPath` arrow |
| `errors.ts` | `err`, `jsonContent`, `parseStructuredJson`, `finishPayload` |
| `validation-timestamp.ts` | `readVt`, `writeVt`, `vtPath` arrow |
| `payload.ts` | `sortKeys`, `toStr` arrow, `bytes` arrow |
| `schema.ts` | `summaryEnvelopeOutputSchema`, `nextActionOutputSchema` (move from lines 2556/2565) |
| `project.ts` | `findBlueprintDir`, `projectCandidateView`, `projectDisambiguationError`, `resolveFallbackProjectCwd`, `buildFallbackCurrentProject`, `resolveToolProject` |
| `freshness.ts` | `hashMutationPayload`, `mutationFreshnessError`, `validateMutationFreshnessToken`, `readMutationReplay`, `recordMutationReplay` |
| `projection.ts` | `getCurrentProjectBlueprint`, `listCurrentProjectBlueprintRows`, `staleProjectionResponse` (lines 1591–1651) — also consumed by `persistBlueprintMarkdown` in `db.ts`, so they belong in `_shared/`, not in a handler (E8) |

**Steps (TDD):**

1. Create one `_shared/` module file with extracted functions (verbatim copy — zero logic changes). Cross-`_shared` imports use `#mcp/blueprint/_shared/*` subpaths.
2. Create co-located test file importing from the new module; verify existing test coverage transfers.
3. Run: `./bin/wp test --file src/mcp/blueprint/_shared/<module>.test.ts` — verify PASS.
4. Repeat for all 8 modules.
5. Run: `./bin/wp lint --file src/mcp/blueprint/_shared/` — verify zero violations (no `../` imports).
6. Run: `./bin/wp typecheck` — verify zero errors.

**Acceptance:**

- [ ] All 8 `_shared/` modules created with correct function exports (`db`, `errors`, `validation-timestamp`, `payload`, `schema`, `project`, `freshness`, `projection`).
- [ ] Co-located test file for each module (except `schema.ts`, which is type/schema declarations); all pass.
- [ ] `projection.ts` houses the three projection-read helpers so `db.ts`'s `persistBlueprintMarkdown` imports them from `_shared/`, not from a handler (no `_shared/ → handlers/` back-edge).
- [ ] All imports use `#mcp/blueprint/_shared/*` subpaths; zero `../` parent-relative imports.
- [ ] Zero logic changes from original `blueprint-server.ts` code.
- [ ] `./bin/wp lint --file src/mcp/blueprint/_shared/` passes.
- [ ] `./bin/wp typecheck` passes.

---

#### Task 1.2: Extract read-only handlers

**Status:** todo

**Depends:** Task 1.1

Extract the 4 read-only (no-mutation) handlers into `src/mcp/blueprint/handlers/`. These handlers do not modify markdown or SQLite state — they only read and return data. Each handler file exports a single async function with the same signature as the original. They import their dependencies from `_shared/` (created in Task 1.1), so this task cannot typecheck or pass its tests until Task 1.1 lands.

**Files:**

- Create: `src/mcp/blueprint/handlers/query.ts`
- Create: `src/mcp/blueprint/handlers/query.test.ts`
- Create: `src/mcp/blueprint/handlers/validate.ts`
- Create: `src/mcp/blueprint/handlers/validate.test.ts`
- Create: `src/mcp/blueprint/handlers/depgraph.ts`
- Create: `src/mcp/blueprint/handlers/depgraph.test.ts`
- Create: `src/mcp/blueprint/handlers/projects.ts`
- Create: `src/mcp/blueprint/handlers/projects.test.ts`

**Handlers:**

| File | Original Function | Original Lines (approx) |
| ---- | ----------------- | ------------------------ |
| `query.ts` | `handleQuery` | 721–758 |
| `validate.ts` | `handleValidate` | 837–862 |
| `depgraph.ts` | `handleDepgraph` | 1482–1589 |
| `projects.ts` | `handleProjects` | 3119–3194 |

**Steps (TDD):**

1. Copy each handler function body verbatim into its new file. Import needed deps from `#*` modules and `#mcp/blueprint/_shared/*` (never `../_shared/*` — parent-relative imports fail `wp lint`).
2. Write a test that calls the handler with a valid input and asserts the response shape.
3. Run: `./bin/wp test --file src/mcp/blueprint/handlers/<name>.test.ts` — verify PASS.
4. Repeat for all 4 handlers.
5. Run: `./bin/wp lint --file src/mcp/blueprint/handlers/` — verify zero violations.

**Acceptance:**

- [ ] All 4 handler files created; each exports one async handler function.
- [ ] Each handler test passes with correct response envelope shape.
- [ ] All `_shared` imports use `#mcp/blueprint/_shared/*` subpaths; zero `../` imports.
- [ ] Zero logic changes from original code.
- [ ] `./bin/wp lint --file src/mcp/blueprint/handlers/` passes.

---

#### Task 1.3: Extract projection handlers

**Status:** todo

**Depends:** Task 1.1

Extract the 3 projection-list handlers that query the SQLite blueprint projection. These handlers consume the `listCurrentProjectBlueprintRows`/`getCurrentProjectBlueprint`/`staleProjectionResponse` helpers — now living in `#mcp/blueprint/_shared/projection` (Task 1.1, E8) — and the `aggregateBlueprintRows` pattern.

**Files:**

- Create: `src/mcp/blueprint/handlers/list.ts`
- Create: `src/mcp/blueprint/handlers/list.test.ts`
- Create: `src/mcp/blueprint/handlers/get.ts`
- Create: `src/mcp/blueprint/handlers/get.test.ts`
- Create: `src/mcp/blueprint/handlers/context.ts`
- Create: `src/mcp/blueprint/handlers/context.test.ts`

**Handlers:**

| File | Original Function | Original Lines (approx) |
| ---- | ----------------- | ------------------------ |
| `list.ts` | `handleBlueprintList` | 1591–1791 |
| `get.ts` | `handleBlueprintGet` | 1625–2024 |
| `context.ts` | `handleBlueprintContext` | 2026–2218 |

**Steps (TDD):**

1. Extract each handler into its handler file; import the shared projection-read helpers from `#mcp/blueprint/_shared/projection` (do NOT re-house `getCurrentProjectBlueprint`/`listCurrentProjectBlueprintRows`/`staleProjectionResponse` inside a handler — they live in `_shared/projection.ts`).
2. Write a test using a temp SQLite DB (or mock the projection reader) to verify handler output.
3. Run: `./bin/wp test --file src/mcp/blueprint/handlers/<name>.test.ts` — verify PASS.
4. Run: `./bin/wp lint --file src/mcp/blueprint/handlers/` — verify zero violations.

**Acceptance:**

- [ ] All 3 handler files created with correct exports.
- [ ] Tests pass for each handler.
- [ ] Shared projection-read helpers (`listCurrentProjectBlueprintRows`, `getCurrentProjectBlueprint`, `staleProjectionResponse`) are imported from `#mcp/blueprint/_shared/projection` — not duplicated or housed in a handler (avoids the `_shared/ → handlers/` back-edge).
- [ ] All imports use `#mcp/blueprint/_shared/*` subpaths; zero `../` imports.
- [ ] `./bin/wp lint` + `./bin/wp typecheck` pass.

---

#### Task 1.4: Extract task lifecycle handlers

**Status:** todo

**Depends:** Task 1.0, Task 1.1

Extract the 3 task-level mutation handlers. These handlers edit task status in blueprint markdown, push platform events, and update the SQLite projection. They consume the sync seam from `#mcp/blueprint/_shared/sync` (Task 1.0) and the mutation freshness helpers from `#mcp/blueprint/_shared/freshness` (Task 1.1) — they receive the resolved adapter (or its resolver) as a parameter rather than importing it back from `blueprint-server.ts`.

**Files:**

- Create: `src/mcp/blueprint/handlers/task-next.ts`
- Create: `src/mcp/blueprint/handlers/task-next.test.ts`
- Create: `src/mcp/blueprint/handlers/task-advance.ts`
- Create: `src/mcp/blueprint/handlers/task-advance.test.ts`
- Create: `src/mcp/blueprint/handlers/task-verify.ts`
- Create: `src/mcp/blueprint/handlers/task-verify.test.ts`

**Handlers:**

| File | Original Function | Original Lines (approx) |
| ---- | ----------------- | ------------------------ |
| `task-next.ts` | `handleTaskNext` | 864–995 |
| `task-advance.ts` | `handleTaskAdvance` | 997–1146 |
| `task-verify.ts` | `handleTaskVerify` | 1148–1283 |

**Steps (TDD):**

1. Extract each handler with its inline Zod schemas into the handler file. Import the sync seam and freshness helpers via `#mcp/blueprint/_shared/sync` and `#mcp/blueprint/_shared/freshness`; accept the adapter/resolver as a parameter.
2. Write tests that mock the sync adapter and verify task status transitions.
3. Run: `./bin/wp test --file src/mcp/blueprint/handlers/<name>.test.ts` — verify PASS.
4. Run: `./bin/wp lint` + `./bin/wp typecheck`.

**Acceptance:**

- [ ] All 3 task handler files created.
- [ ] Tests verify: task-next returns correct next task, task-advance transitions status correctly, task-verify enforces evidence contract.
- [ ] Platform sync calls are preserved (tests mock `SyncAdapter`); handlers receive the adapter/resolver as a parameter — no import back from `blueprint-server.ts`.
- [ ] All imports use `#mcp/blueprint/_shared/*` subpaths; zero `../` imports.
- [ ] `./bin/wp lint` + `./bin/wp typecheck` pass.

---

#### Task 1.5: Extract blueprint lifecycle handlers

**Status:** todo

**Depends:** Task 1.0, Task 1.1

Extract the 3 blueprint-level lifecycle mutation handlers. These move blueprints between lifecycle states (draft → planned → in-progress → completed, etc.) and handle the `assertBlueprintCanComplete` guard. Like the task handlers, they consume the sync seam from `#mcp/blueprint/_shared/sync` (Task 1.0) and receive the adapter/resolver as a parameter.

**Files:**

- Create: `src/mcp/blueprint/handlers/promote.ts`
- Create: `src/mcp/blueprint/handlers/promote.test.ts`
- Create: `src/mcp/blueprint/handlers/finalize.ts`
- Create: `src/mcp/blueprint/handlers/finalize.test.ts`
- Create: `src/mcp/blueprint/handlers/transition.ts`
- Create: `src/mcp/blueprint/handlers/transition.test.ts`

**Handlers:**

| File | Original Function | Original Lines (approx) |
| ---- | ----------------- | ------------------------ |
| `promote.ts` | `handlePromote` | 1285–1364 |
| `finalize.ts` | `handleFinalize` (+ `assertBlueprintCanComplete`) | 1366–1480 |
| `transition.ts` | `handleBlueprintTransition` (+ `applyLocalBlueprintTransition`) | 2356–2483 |

**Steps (TDD):**

1. Extract each handler with its helpers and inline schemas. Import the sync seam via `#mcp/blueprint/_shared/sync` and accept the adapter/resolver as a parameter.
2. Write tests that mock the project resolver and verify lifecycle state transitions.
3. Run: `./bin/wp test --file src/mcp/blueprint/handlers/<name>.test.ts` — verify PASS.
4. Run: `./bin/wp lint` + `./bin/wp typecheck`.

**Acceptance:**

- [ ] All 3 lifecycle handler files created.
- [ ] `handlePromote` refuses promotion without prior validate (existing promote-after-validate guard preserved).
- [ ] `handleFinalize` refuses if tasks are not done/dropped (`assertBlueprintCanComplete` guard preserved).
- [ ] `handleBlueprintTransition` enforces revision-token freshness check.
- [ ] Handlers receive the sync adapter/resolver as a parameter — no import back from `blueprint-server.ts`.
- [ ] All imports use `#mcp/blueprint/_shared/*` subpaths; zero `../` imports.
- [ ] Tests pass; lint + typecheck pass.

---

#### Task 1.6: Extract document create/update handlers

**Status:** todo

**Depends:** Task 1.0, Task 1.1

Extract the 3 document-level handlers that create or replace blueprint markdown. These handlers render markdown from templates, write files, and re-ingest the SQLite projection. `handleBlueprintCreate` and `handleBlueprintPut` are mutation handlers that touch the sync seam, so they take the adapter/resolver from `#mcp/blueprint/_shared/sync` (Task 1.0) as a parameter.

**Files:**

- Create: `src/mcp/blueprint/handlers/new.ts`
- Create: `src/mcp/blueprint/handlers/new.test.ts`
- Create: `src/mcp/blueprint/handlers/create.ts`
- Create: `src/mcp/blueprint/handlers/create.test.ts`
- Create: `src/mcp/blueprint/handlers/put.ts`
- Create: `src/mcp/blueprint/handlers/put.test.ts`

**Handlers:**

| File | Original Function | Original Lines (approx) |
| ---- | ----------------- | ------------------------ |
| `new.ts` | `handleNew` | 759–836 |
| `create.ts` | `handleBlueprintCreate` | 2485–2574 |
| `put.ts` | `handleBlueprintPut` (+ `renderBlueprintMarkdownFromDocument`) | 2220–2354 |

**Steps (TDD):**

1. Extract each handler; `renderBlueprintMarkdownFromDocument` goes with `put.ts` (its only caller). For the mutation handlers (`create`, `put`), import the sync seam via `#mcp/blueprint/_shared/sync` and accept the adapter/resolver as a parameter.
2. Write tests using temp directories to verify markdown output and file creation.
3. Run: `./bin/wp test --file src/mcp/blueprint/handlers/<name>.test.ts` — verify PASS.
4. Run: `./bin/wp lint` + `./bin/wp typecheck`.

**Acceptance:**

- [ ] All 3 document handler files created.
- [ ] `handleNew` returns correct template bundle (target_path, template, rules_context, examples, lifecycle_advice, validation_required).
- [ ] `handleBlueprintCreate` writes markdown and returns slug/path/idempotent.
- [ ] `handleBlueprintPut` renders entire document from JSON payload.
- [ ] All imports use `#mcp/blueprint/_shared/*` subpaths; zero `../` imports.
- [ ] Tests pass; lint + typecheck pass.

---

#### Task 2.1: Rewire server file to thin wiring layer

**Status:** todo

**Depends:** Task 1.0, Task 1.1, Task 1.2, Task 1.3, Task 1.4, Task 1.5, Task 1.6

Rewrite `src/mcp/blueprint-server.ts` to import all handlers and helpers from `#mcp/blueprint/_shared/*` and `#mcp/blueprint/handlers/*`. Remove all extracted function bodies. Keep only:
- Constants (`VALIDATE_TS_FILE`, `ROWS_CAP`, timeouts, `BLUEPRINT_TEMPLATE`, etc.)
- `registerBlueprintTools` — now imports handler modules and passes the resolved sync adapter (from `#mcp/blueprint/_shared/sync`) into the mutation handlers
- `registerBlueprintServer` — wrapper that adds `wp_blueprint_projects`
- Re-export of `_setSyncAdapterFactory` (from `#mcp/blueprint/_shared/sync`) so existing tests keep their import path (Task 1.0 step 2)

**Files:**

- Modify: `src/mcp/blueprint-server.ts`

**Steps (TDD):**

1. Add imports for all 8 `_shared/` modules and all 16 handler modules at the top of `blueprint-server.ts`, using `#mcp/blueprint/_shared/*` and `#mcp/blueprint/handlers/*` subpaths (NOT `./blueprint/...` cross-directory relatives — only `./auto-discover.js` / `./_tail-hints.js` same-directory relatives remain legitimate).
2. Delete all extracted function bodies (leaving only the imports, the two `register*` functions, constants, and the `_setSyncAdapterFactory` re-export).
3. In `registerBlueprintTools`, replace inline handler calls with imported handler functions; thread the resolved sync adapter into each mutation handler.
4. Run: `./bin/wp test --file src/mcp/server.integration.test.ts` — verify PASS (all existing integration tests still work).
5. Run: `wc -l src/mcp/blueprint-server.ts` — verify ≤ 300 lines.
6. Run: `./bin/wp typecheck && ./bin/wp lint --file src/mcp/blueprint-server.ts`.

**Acceptance:**

- [ ] `wc -l src/mcp/blueprint-server.ts` ≤ 300 lines.
- [ ] `./bin/wp test --file src/mcp/server.integration.test.ts` passes.
- [ ] No direct `#db/*`, `#core/*`, `#lifecycle/*`, `#utils/*`, `#evidence`, `#freshness`, `#projects`, `#aggregate`, `#projection-ready`, `#project-resolver`, `#next-action`, `#sync/*` imports remain in server file (all moved to handler/helper modules).
- [ ] All handler/helper imports use `#mcp/blueprint/...` subpaths; only `./auto-discover.js` / `./_tail-hints.js` same-directory relatives remain.
- [ ] `./bin/wp typecheck` — zero errors.
- [ ] `./bin/wp lint --file src/mcp/blueprint-server.ts --file src/mcp/blueprint/` — zero violations.

---

#### Task 2.2: Add contract tests for handler wiring

**Status:** todo

**Depends:** Task 2.1

Add tests that verify every handler module is registered under the correct MCP tool name, the server file stays under the line budget, and no handler is accidentally unregistered during future edits.

**Files:**

- Create: `src/mcp/blueprint/handlers/index.test.ts`
- Modify: `src/mcp/server.integration.test.ts` (add wiring assertions, if needed)

**Steps (TDD):**

1. Create `index.test.ts` that imports all 16 handler modules and the `BLUEPRINT_SURFACE_TOOLS` constant. Assert every handler has a corresponding tool name entry.
2. Add a test that parses `blueprint-server.ts` and asserts it imports from all 16 handler paths — fails if a handler is created but not wired.
3. Add a line-budget assertion: fail if `blueprint-server.ts` > 300 lines on disk.
4. Run: `./bin/wp test --file src/mcp/blueprint/handlers/index.test.ts` — verify PASS.
5. Run: `./bin/wp lint --file src/mcp/blueprint/handlers/index.test.ts`.

**Acceptance:**

- [ ] `./bin/wp test --file src/mcp/blueprint/handlers/index.test.ts` passes.
- [ ] Missing handler registration causes test failure (verify by temporarily removing an import).
- [ ] Line budget assertion fails if server file grows beyond 300 lines.
- [ ] `./bin/wp lint` + `./bin/wp typecheck` pass.

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Line budget | `wc -l src/mcp/blueprint-server.ts` | ≤ 300 lines |
| Integration | `./bin/wp test --file src/mcp/server.integration.test.ts` | Pass |
| Contract tests | `./bin/wp test --file src/mcp/blueprint/handlers/index.test.ts` | Pass |
| All handler tests | `./bin/wp test --file src/mcp/blueprint/handlers/` | All pass |
| Type safety | `./bin/wp typecheck` | Zero errors |
| Lint | `./bin/wp lint --file src/mcp/blueprint-server.ts --file src/mcp/blueprint/` | Zero violations (incl. no `../` parent-relative imports) |
| No dead imports | manual review of `blueprint-server.ts` imports | Only `#mcp/blueprint/_shared/*`, `#mcp/blueprint/handlers/*`, node builtins, and `./auto-discover.js` / `./_tail-hints.js` |

---

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 10 |
| Critical | 0 |
| High | 4 (F1, F2, F3, F10) |
| Medium | 4 (F4, F5, F6, F7) |
| Low | 2 (F8, F9) |
| Fixes applied | 10/10 |
| Edge cases documented | 8 |
| Risks documented | 5 |
| **Parallelization score** | B (2 tasks in Wave 0, 5 in Wave 1, CPR 2.25) |
| **Critical path** | 4 waves (1.1 → {1.2…1.6} → 2.1 → 2.2) |
| **Max parallel agents** | 5 (Wave 1 handler fan-out) |
| **Total tasks** | 9 |
| **Blueprint compliant** | 9/9 |

### Key refinements applied

1. **Sync-adapter cycle resolved (F10/E6, CRITICAL).** Added blocking Task 1.0 that extracts the module-level sync-adapter singleton (`_syncAdapterFactory`/`resolveSyncAdapter`/`_setSyncAdapterFactory`/`runPlatformMutationSync`, lines 116–186, 225) into `_shared/sync.ts` and passes the resolved adapter/resolver into mutation handlers as a parameter. E6 rewritten: the adapter **MOVES**, it does not "stay" in `blueprint-server.ts`. Without this, moved mutation handlers would import back from `blueprint-server.ts`, creating the forbidden `handlers/ → blueprint-server.ts → handlers/` cycle.
2. **False Wave-0 parallelism corrected (HIGH).** Handler Tasks 1.2–1.6 import Task 1.1's `_shared/` modules (`schema`, `freshness`, `db`, `project`, `projection`) and so cannot typecheck before 1.1 lands. They now declare `Depends: Task 1.1` (mutation tasks 1.4/1.5/1.6 also depend on Task 1.0) and move to Wave 1. Critical path corrected from 3 waves to 4; metrics recomputed honestly (RW0 2, CPR 2.25, DD 1.33); parallelization score downgraded from A to B.
3. **Import convention fixed (HIGH).** Every `../_shared/*` and `./blueprint/*` import instruction replaced with `#mcp/blueprint/_shared/*` / `#mcp/blueprint/handlers/*` subpaths, because the `no-relative-parent-imports` lint rule rejects `../` and would fail the plan's own `wp lint` gate. Only `./auto-discover.js` / `./_tail-hints.js` same-directory relatives remain legitimate.
4. **Projection helpers reclassified (E8).** `getCurrentProjectBlueprint`/`listCurrentProjectBlueprintRows`/`staleProjectionResponse` (lines 1591–1651) are also called by `persistBlueprintMarkdown` (line 391), so they move to `_shared/projection.ts` in Task 1.1 rather than staying handler-private — removing a second `_shared/ → handlers/` back-edge.
5. **F3 module-area enumeration completed.** Added `#next-action` and the lazy `#sync/*` / `#paths` imports to the F3 list; added F10 documenting the sync singleton.
6. **Dangling guard citation repaired.** Task 1.5's "F12 guard preserved" referenced a non-existent finding; reworded to "existing promote-after-validate guard preserved."
7. **Fact-check table expanded** with F10 (sync-adapter singleton); Edge Cases extended to E8 (projection back-edge); Risks updated to reflect both back-edges being removed via `_shared/` extraction.
8. **TDD steps + module-mapping tables** retained in every task; each task names the exact functions to extract and the exact subpath imports to use.
