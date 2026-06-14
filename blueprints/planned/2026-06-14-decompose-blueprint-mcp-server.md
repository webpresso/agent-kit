---
type: blueprint
title: Decompose blueprint MCP server
owner: ozby
status: planned
complexity: XL
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/8 tasks done, 0 blocked)'
depends_on: []
cross_repo_depends_on: []
tags:
  - architecture
  - mcp
  - blueprint
  - srp
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Decompose blueprint MCP server

**Goal:** Split `src/mcp/blueprint-server.ts` from a 3,194-line god-object into thin wiring and per-tool handler modules.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | HIGH | 3,194 lines. | `wc -l` returns 3,194. Confirmed. |
| F2 | HIGH | 58 functions (export + plain named), 24 import statements. | Confirmed via AST scan: 58 named functions (3 `export function`, 55 `function`), 24 `import` lines. |
| F3 | HIGH | Imports from ~22 module areas. | Confirmed: `#db/*`, `#core/*`, `#lifecycle/*`, `#utils/*`, `#evidence`, `#freshness`, `#projects`, `#aggregate`, `#project-resolver`, `#projection-ready`, `#mcp/tools/_shared`, `gray-matter`, `zod`, plus node builtins. |
| F4 | MEDIUM | Tool handlers mixed with DB/FS/sync logic. | Confirmed: 16 handler functions (`handleQuery`, `handleNew`, `handleValidate`, `handleTaskNext`, `handleTaskAdvance`, `handleTaskVerify`, `handlePromote`, `handleFinalize`, `handleDepgraph`, `handleBlueprintList`, `handleBlueprintGet`, `handleBlueprintContext`, `handleBlueprintPut`, `handleBlueprintTransition`, `handleBlueprintCreate`, `handleProjects`) co-located with `openDbRW`, `readVt`/`writeVt`, `reIngest`, `resolveToolProject`, `runPlatformMutationSync`, and mutation freshness helpers in one file. |
| F5 | MEDIUM | 16 MCP tools registered. | Confirmed: 15 in `registerBlueprintTools` + `wp_blueprint_projects` in `registerBlueprintServer`. Total: 16 tools mapped to 16 handlers. |
| F6 | MEDIUM | Shared schemas (`summaryEnvelopeOutputSchema`, `nextActionOutputSchema`) are inline. | Confirmed: defined at lines 2556/2565 inside `registerBlueprintTools`. Must move to `_shared/` for reuse across handler modules. |
| F7 | LOW | `src/mcp/blueprint/` directory does not exist. | Confirmed: neither `src/mcp/blueprint/` nor `src/mcp/blueprint/handlers/` nor `src/mcp/blueprint/_shared/` exists. All are greenfield. |
| F8 | LOW | `src/mcp/server.integration.test.ts` exists (11,468 bytes). | Confirmed: file present at expected path. Also 20+ blueprint-server test files exist in `src/mcp/`. |
| F9 | LOW | Handler files listed in original blueprint. | Confirmed: 16 handler names listed match the 16 actual `handleXxx` functions. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 | None | 6 agents | S-M |
| **Wave 1** | 2.1 | Wave 0 | 1 agent | M |
| **Wave 2** | 2.2 | Wave 1 | 1 agent | S |
| **Critical path** | 1.1 → 2.1 → 2.2 | — | 3 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 3 | 6 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 2.67 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.75 |
| CP | same-file overlaps per wave | 0 | 0 |

**Parallelization score: A** — All metrics meet targets. Six agents can run Wave 0 concurrently (CREATE-only tasks, no file conflicts). Single serialized rewire in Wave 1, then test in Wave 2.

## Edge Cases

| # | Scenario | Impact | Mitigation |
| -- | -------- | ------ | ---------- |
| E1 | Handler breaks tool schema contract during extraction | Tool returns wrong shape to MCP client | Each handler keeps its existing Zod/JSON schemas co-located; schema extraction is CREATE-only in Wave 0, unchanged until Wave 1 wiring. |
| E2 | Merge conflict with in-flight blueprint work | Stale imports or duplicated code after rebase | Keep diff mechanical; all changes are file MOVEs not LOGIC changes. Rebase checklist in Task 2.1. |
| E3 | Shared schemas (`summaryEnvelopeOutputSchema`, `nextActionOutputSchema`) imported from `_shared/` but handler tests use them | Tests break if import path wrong | Extract schemas into `_shared/schema.ts` in Task 1.1; all handlers import from there. Tests verify schema identity. |
| E4 | Existing test files import from `./blueprint-server.ts` directly | ~20 test files need import path updates | Test imports stay pointing at `blueprint-server.ts` (which re-exports or keeps the wiring). Tests that test internal helpers need new import paths — handled in Task 1.1 acceptance. |
| E5 | `registerBlueprintTools` vs `registerBlueprintServer` split | Two registration entry points, handler duplication risk | `registerBlueprintServer` wraps `registerBlueprintTools` + adds `wp_blueprint_projects`. Keep both in the slim server file; only handler *implementations* move out. |
| E6 | Sync adapter code (lines 47–256) is tightly coupled to handler internals | Moving handlers without moving adapter creates cross-file coupling | Sync adapter stays in blueprint-server.ts (it's wiring infrastructure, not a handler). Handlers receive adapter via parameter or module-level injection. |
| E7 | Mutation freshness helpers (`hashMutationPayload`, `validateMutationFreshnessToken`, etc.) used by multiple handlers | Duplicate or circular imports if placed in wrong module | Extract to `_shared/freshness.ts` in Task 1.1. |

## Risks

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Merge conflicts with in-flight blueprint work | HIGH | Coordinate with active blueprint tasks; keep refactor purely mechanical. Rebase after each Wave 0 task completes. |
| Subtle behavioral drift during handler move | HIGH | TDD steps in every task: extract → test passes → commit. Zero logic changes in Wave 0; Wave 1 only changes import paths. |
| import path churn breaks existing 20+ test files | MEDIUM | Handler extraction moves handler bodies to new files but leaves re-exports or keeps wiring in `blueprint-server.ts`. Tests targeting the server file continue to work; handler-level tests are new. |
| Circular dependency between `_shared/` and handler modules | MEDIUM | `_shared/` modules have zero imports from `handlers/`. Enforced by lint rule in CI. |
| Handler extraction exposes internal signatures that should stay private | LOW | Export only the handler function; keep helper functions module-scoped (no `export` unless needed). |

## Product wedge anchor

- **Stage outcome:** Production-ready MCP server with single-responsibility handler modules
- **Consuming surface:** MCP tools registered via `registerBlueprintServer` / `registerBlueprintTools`
- **New user-visible capability:** None — internal refactor only, all tool contracts preserved

## Non-goals

- Rewriting blueprint business logic.
- Changing the public MCP tool contract (tool names, input/output schemas unchanged).
- Extracting every one-liner; keep small pure helpers co-located with their consumer.
- Changing the server startup flow (`registerBlueprintServer` → `registerBlueprintTools` call chain).
- Modifying `auto-discover.ts` or the general MCP server boot sequence.

---

## Tasks

#### [architecture] Task 1.1: Extract shared helper modules

**Status:** todo

**Depends:** None

Extract standalone helper functions from `blueprint-server.ts` into `src/mcp/blueprint/_shared/` modules. These helpers have no dependency on any handler — they are pure utilities used by multiple handlers. Each extracted module gets a co-located test file.

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

**Steps (TDD):**

1. Create one `_shared/` module file with extracted functions (verbatim copy — zero logic changes).
2. Create co-located test file importing from the new module; verify existing test coverage transfers.
3. Run: `./bin/wp test --file src/mcp/blueprint/_shared/<module>.test.ts` — verify PASS.
4. Repeat for all 7 modules.
5. Run: `./bin/wp lint src/mcp/blueprint/_shared/` — verify zero violations.
6. Run: `./bin/wp typecheck` — verify zero errors.

**Acceptance:**

- [ ] All 7 `_shared/` modules created with correct function exports.
- [ ] Co-located test file for each module; all pass.
- [ ] Zero logic changes from original `blueprint-server.ts` code.
- [ ] `./bin/wp lint src/mcp/blueprint/_shared/` passes.
- [ ] `./bin/wp typecheck` passes.

---

#### [mcp] Task 1.2: Extract read-only handlers

**Status:** todo

**Depends:** None

Extract the 4 read-only (no-mutation) handlers into `src/mcp/blueprint/handlers/`. These handlers do not modify markdown or SQLite state — they only read and return data. Each handler file exports a single async function with the same signature as the original.

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

1. Copy each handler function body verbatim into its new file. Import needed deps from `#*` modules and `../_shared/*`.
2. Write a test that calls the handler with a valid input and asserts the response shape.
3. Run: `./bin/wp test --file src/mcp/blueprint/handlers/<name>.test.ts` — verify PASS.
4. Repeat for all 4 handlers.
5. Run: `./bin/wp lint src/mcp/blueprint/handlers/` — verify zero violations.

**Acceptance:**

- [ ] All 4 handler files created; each exports one async handler function.
- [ ] Each handler test passes with correct response envelope shape.
- [ ] Zero logic changes from original code.
- [ ] `./bin/wp lint src/mcp/blueprint/handlers/` passes.

---

#### [mcp] Task 1.3: Extract projection handlers

**Status:** todo

**Depends:** None

Extract the 3 projection-list handlers that query the SQLite blueprint projection. These handlers share the `listCurrentProjectBlueprintRows`/`getCurrentProjectBlueprint`/`staleProjectionResponse` helpers and the `aggregateBlueprintRows` pattern.

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
| `list.ts` | `handleBlueprintList` (+ `listCurrentProjectBlueprintRows`, `staleProjectionResponse`) | 1591–1791 |
| `get.ts` | `handleBlueprintGet` (+ `getCurrentProjectBlueprint`) | 1625–2024 |
| `context.ts` | `handleBlueprintContext` | 2026–2218 |

**Steps (TDD):**

1. Extract each handler + its private helpers into the handler file.
2. Write a test using a temp SQLite DB (or mock the projection reader) to verify handler output.
3. Run: `./bin/wp test --file src/mcp/blueprint/handlers/<name>.test.ts` — verify PASS.
4. Run: `./bin/wp lint src/mcp/blueprint/handlers/` — verify zero violations.

**Acceptance:**

- [ ] All 3 handler files created with correct exports.
- [ ] Tests pass for each handler.
- [ ] Shared helpers (`listCurrentProjectBlueprintRows`, `getCurrentProjectBlueprint`, `staleProjectionResponse`) are co-located in the handler file that uses them (or extracted if shared across multiple — `staleProjectionResponse` is used by both list and get, place it in `list.ts` and export).
- [ ] `./bin/wp lint` + `./bin/wp typecheck` pass.

---

#### [mcp] Task 1.4: Extract task lifecycle handlers

**Status:** todo

**Depends:** None

Extract the 3 task-level mutation handlers. These handlers edit task status in blueprint markdown, push platform events, and update the SQLite projection. They share the `runPlatformMutationSync` pattern and mutation freshness helpers.

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

1. Extract each handler with its inline Zod schemas into the handler file.
2. Write tests that mock the sync adapter and verify task status transitions.
3. Run: `./bin/wp test --file src/mcp/blueprint/handlers/<name>.test.ts` — verify PASS.
4. Run: `./bin/wp lint` + `./bin/wp typecheck`.

**Acceptance:**

- [ ] All 3 task handler files created.
- [ ] Tests verify: task-next returns correct next task, task-advance transitions status correctly, task-verify enforces evidence contract.
- [ ] Platform sync calls are preserved (tests mock `SyncAdapter`).
- [ ] `./bin/wp lint` + `./bin/wp typecheck` pass.

---

#### [mcp] Task 1.5: Extract blueprint lifecycle handlers

**Status:** todo

**Depends:** None

Extract the 3 blueprint-level lifecycle mutation handlers. These move blueprints between lifecycle states (draft → planned → in-progress → completed, etc.) and handle the `assertBlueprintCanComplete` guard.

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

1. Extract each handler with its helpers and inline schemas.
2. Write tests that mock the project resolver and verify lifecycle state transitions.
3. Run: `./bin/wp test --file src/mcp/blueprint/handlers/<name>.test.ts` — verify PASS.
4. Run: `./bin/wp lint` + `./bin/wp typecheck`.

**Acceptance:**

- [ ] All 3 lifecycle handler files created.
- [ ] `handlePromote` refuses promotion without prior validate (F12 guard preserved).
- [ ] `handleFinalize` refuses if tasks are not done/dropped (`assertBlueprintCanComplete` guard preserved).
- [ ] `handleBlueprintTransition` enforces revision-token freshness check.
- [ ] Tests pass; lint + typecheck pass.

---

#### [mcp] Task 1.6: Extract document create/update handlers

**Status:** todo

**Depends:** None

Extract the 3 document-level handlers that create or replace blueprint markdown. These handlers render markdown from templates, write files, and re-ingest the SQLite projection.

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

1. Extract each handler; `renderBlueprintMarkdownFromDocument` goes with `put.ts` (its only caller).
2. Write tests using temp directories to verify markdown output and file creation.
3. Run: `./bin/wp test --file src/mcp/blueprint/handlers/<name>.test.ts` — verify PASS.
4. Run: `./bin/wp lint` + `./bin/wp typecheck`.

**Acceptance:**

- [ ] All 3 document handler files created.
- [ ] `handleNew` returns correct template bundle (target_path, template, rules_context, examples, lifecycle_advice, validation_required).
- [ ] `handleBlueprintCreate` writes markdown and returns slug/path/idempotent.
- [ ] `handleBlueprintPut` renders entire document from JSON payload.
- [ ] Tests pass; lint + typecheck pass.

---

#### [architecture] Task 2.1: Rewire server file to thin wiring layer

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3, Task 1.4, Task 1.5, Task 1.6

Rewrite `src/mcp/blueprint-server.ts` to import all handlers and helpers from `./blueprint/_shared/*` and `./blueprint/handlers/*`. Remove all extracted function bodies. Keep only:
- The `SyncAdapter` interface and sync adapter wiring (lines 47–256)
- Constants (`VALIDATE_TS_FILE`, `ROWS_CAP`, timeouts, `BLUEPRINT_TEMPLATE`, etc.)
- `registerBlueprintTools` — now imports and delegates to handler modules
- `registerBlueprintServer` — wrapper that adds `wp_blueprint_projects`

**Files:**

- Modify: `src/mcp/blueprint-server.ts`

**Steps (TDD):**

1. Add imports for all 7 `_shared/` modules and all 16 handler modules at the top of `blueprint-server.ts`.
2. Delete all extracted function bodies (leaving only the imports and the two `register*` functions + sync adapter code + constants).
3. In `registerBlueprintTools`, replace inline handler calls with imported handler functions.
4. Run: `./bin/wp test --file src/mcp/server.integration.test.ts` — verify PASS (all existing integration tests still work).
5. Run: `wc -l src/mcp/blueprint-server.ts` — verify ≤ 300 lines.
6. Run: `./bin/wp typecheck && ./bin/wp lint src/mcp/blueprint-server.ts`.

**Acceptance:**

- [ ] `wc -l src/mcp/blueprint-server.ts` ≤ 300 lines.
- [ ] `./bin/wp test --file src/mcp/server.integration.test.ts` passes.
- [ ] No direct `#db/*`, `#core/*`, `#lifecycle/*`, `#utils/*`, `#evidence`, `#freshness`, `#projects`, `#aggregate`, `#projection-ready`, `#project-resolver` imports remain in server file (all moved to handler/helper modules).
- [ ] `./bin/wp typecheck` — zero errors.
- [ ] `./bin/wp lint src/mcp/blueprint-server.ts src/mcp/blueprint/` — zero violations.

---

#### [qa] Task 2.2: Add contract tests for handler wiring

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
5. Run: `./bin/wp lint src/mcp/blueprint/handlers/index.test.ts`.

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
| Lint | `./bin/wp lint src/mcp/blueprint-server.ts src/mcp/blueprint/` | Zero violations |
| No dead imports | manual review of `blueprint-server.ts` imports | Only `./blueprint/_shared/*`, `./blueprint/handlers/*`, node builtins, and `./auto-discover.js` |

---

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 9 |
| Critical | 0 |
| High | 3 (F1, F2, F3 — verified as correct) |
| Medium | 4 (F4, F5, F6, F7) |
| Low | 2 (F8, F9) |
| Fixes applied | 9/9 |
| Edge cases documented | 7 |
| Risks documented | 4 |
| **Parallelization score** | A (6 tasks in Wave 0, CPR 2.67) |
| **Critical path** | 3 waves (1.1 → 2.1 → 2.2) |
| **Max parallel agents** | 6 |
| **Total tasks** | 8 |
| **Blueprint compliant** | 8/8 |

### Key refinements applied

1. **Task structure redesigned for parallelism.** Original 4 serial tasks replaced with 6 parallel Wave 0 tasks (CREATE-only, zero file conflicts) + 2 sequential wiring/test tasks. CPR improved from 1.0 (all serial) to 2.67.
2. **Fact-check table expanded.** Added F5 (tool count = 16), F6 (shared schemas are inline), F7 (`blueprint/` dir doesn't exist), F8 (integration test confirmed), F9 (handler list verified against source).
3. **Edge Cases table added** covering schema breakage (E1), merge conflicts (E2), shared schema import path (E3), existing test import churn (E4), registration split (E5), sync adapter coupling (E6), and freshness helper circularity (E7).
4. **Parallel Metrics Snapshot added** — all four metrics meet targets (RW0=6, CPR=2.67, DD=0.75, CP=0).
5. **Lane prefixes** assigned: `[architecture]` for infrastructure tasks (1.1, 2.1), `[mcp]` for handler extraction (1.2–1.6), `[qa]` for testing (2.2).
6. **TDD steps** in every task with exact `./bin/wp` commands.
7. **Module mapping tables** added to each Wave 0 task so agents know exactly which functions to extract without reading the source.
