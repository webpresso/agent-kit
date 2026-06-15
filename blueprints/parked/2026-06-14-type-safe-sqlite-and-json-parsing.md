---
type: blueprint
title: Type-safe SQLite and JSON parsing
owner: ozby
status: parked
complexity: L
created: '2026-06-14'
last_updated: '2026-06-15'
progress: "Implemented in PR #139; parked for legal lifecycle transition from planned pending finalization"
depends_on: []
cross_repo_depends_on: []
tags:
  - type-safety
  - zod
  - sqlite
  - json
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Type-safe SQLite and JSON parsing

## Implementation Update (2026-06-15)

Implemented in PR #139 on branch `work/ultragoal-9-blueprints-20260614221933`.
Task status and acceptance checkboxes below were reconciled from the landed code paths and focused verification evidence in this PR. The file is parked because CI enforces the legal first transition from `planned`; finalization can move parked/resumed work through the lifecycle after merge.


**Goal:** Replace unsafe `as unknown as` casts and unvalidated `JSON.parse` calls with Zod schemas so corrupt data fails loudly at runtime.

## Product wedge anchor

- **Stage outcome:** Hardening the blueprint MCP runtime — the `wp_blueprint_*` tool family (UBIQUITOUS_LANGUAGE "Blueprint" surface) must fail closed on corrupt SQLite state instead of returning silently-wrong rows to the agent. This directly serves the agent-kit goal of "does the extraction actually work for a 3rd party" by making `wp blueprint list`/`get`/`query` trustworthy under data drift.
- **Consuming surface:** The `wp blueprint list`, `wp blueprint get`, and `wp blueprint query` CLI verbs (and their `wp_blueprint_list` / `wp_blueprint_get` / `wp_blueprint_query` MCP tools), all backed by `src/mcp/blueprint-server.ts` row reads, plus the `wp audit ai-contracts` gate added in Task 5.1.
- **New user-visible capability:** When the on-disk blueprint SQLite cache is corrupt or schema-drifted, `wp blueprint list`/`get`/`query` now surface a clear `ZodError` ("missing required column X") instead of emitting wrong/empty results — and `wp audit ai-contracts` blocks the regression class going forward.

### Why Zod (DRY / YAGNI justification)

Zod is already a repo-standard validation dependency across `src/` (for example MCP tools, blueprint schemas, docs-lint schemas, and `src/blueprint/db/enums.ts`). This blueprint therefore does **not** introduce a new dependency; it extends the existing validation pattern to unsafe SQLite/JSON parse sites that still cast untrusted data. That choice remains scoped deliberately:

- **Where Zod is justified (genuinely unsafe, zero validation today):** the `blueprint-server.ts` row reads (F1), the Cloudflare release-metadata parse (F2), the `compile.ts` manifest at line 147 (F6), and the `sqlite-store.ts` JSON columns (F7). These have no shape check at all — a corrupt column today produces silently-wrong typed data.
- **Where Zod is NOT mandated (keep existing guards):** `auto-update/run.ts` `readCache` already has manual `typeof` guards (F8) — keep the guard; do not add a speculative schema there beyond aligning the cast removal. Third-party `package.json` reads (E4, `compile.ts` 32/72/337) stay as `Record<string, unknown>` + type guards.
- **Cost on the hot path:** SQLite `.all()` reads in `blueprint-server.ts` use loose object schemas (shape-only, no deep traversal). Benchmark target: a 1000-row `z.array(TaskRowSchema)` parse must add < 5 ms over the raw `.all()` (Task 1.2 acceptance). If it exceeds that, narrow to validate-first-row + trust-rest.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | HIGH | SQLite `.all()` results are cast with `as unknown as`. | Confirmed 4 occurrences at `src/mcp/blueprint-server.ts:946,1588,1619,1750`. Additional unchecked `as` casts at 1644 (`as TaskRow[]`), 1696 (`as Array<BpRow & {project_id}>`), 1911 (`as TaskRow[]`), and 1982 (`as TaskRow[]`). |
| F2 | HIGH | `JSON.parse` results are cast directly to specific types. | Confirmed at: `src/mcp/blueprint-server.ts:352,364,632`; `src/cli/auto-update/run.ts:41`; `src/audit/cloudflare-deploy-contract.ts:19`; `src/cli/commands/compile.ts:32,72,147,337`; `src/ai-memory/store/sqlite-store.ts:295,297,311`. **Correction:** `blueprint-server.ts:432` is already guarded — drop it from scope. |
| F3 | HIGH | `lint-after-edit.ts` uses non-null assertion + cast. | Confirmed at `src/hooks/post-tool/lint-after-edit.ts:188`: `input.tool_input!.file_path as string`. |
| F4 | LOW | `any` type usage is effectively zero. | Confirmed: only comment/string occurrences; no `any` type annotations. |
| F5 | MEDIUM | `TaskRow` is a single type. | `TaskRow` is defined twice with different shapes: line 925 (**7 fields** incl. `id`, `blueprint_slug`) and line 1785 (5 fields, subset). These must be merged. Note `src/blueprint/db/` already exists (with `enums.ts`) — reuse its status/lane enums rather than redefining them. |
| F6 | MEDIUM | `compile.ts` has 1 JSON.parse site. | Actually has 4 sites (lines 32, 72, 147, 337). Lines 32/72/337 read `package.json` with type guards — lower priority. Line 147 (`CompileManifest`) has NO shape validation. |
| F7 | MEDIUM | `sqlite-store.ts` has 2 JSON.parse sites. | Actually has 3 sites at lines **295 (`state_json`), 297 (`metadata_json`, already passes a `(_key, value) => value` reviver), and 311 (`embedding_json` → `as number[]`)**. There is NO site at line 318. All three cast to imported types with zero shape validation. |
| F8 | LOW | `auto-update/run.ts` `readCache` is unsound. | It uses manual `typeof` guards (lines 42-45) before the `as UpdateCache` cast, making it safer than most sites. Keep the guard; Zod here is optional consistency, not a fix. |
| F9 | MEDIUM | `compile.test.ts` exists. | **Corrected 2026-06-14:** `src/cli/commands/compile.test.ts` exists and now contains resource-leak regression coverage. Task 3.2 must extend the existing test file, not create it, and must preserve the no-`openSync` lock regression from `2026-06-14-fix-stream-resource-leaks`. |
| F10 | LOW | `code-safety.ts` exists for oxlint rules. | Confirmed: `src/config/oxlint/code-safety.ts` exists. |
| F11 | CRITICAL | A global `as unknown as` lint ban is safe to land. | **FALSE.** `rg "as unknown as" src/` finds **102 sites across 31 files** (e.g. `src/blueprint/db/sqlite.ts:69`, `src/audit/architecture-drift.ts:122,166`, plus dozens of legitimate test-mock casts like `src/audit/run-stryker.test.ts:27`). A global ban would emit ~96+ violations the instant it lands, failing `wp lint` repo-wide and self-contradicting Task 5.1's acceptance. Task 5.1 is rescoped to the `JSON.parse(...) as <NonRecordType>` surface only. |

## Edge Cases

| ID | Case | Severity | Mitigation |
| -- | ---- | -------- | ---------- |
| E1 | Schema drift: DB column added but Zod schema not updated | MEDIUM | Row schemas use loose objects (`z.looseObject` / `.loose()`) so extra columns silently pass; missing columns fail loudly. |
| E2 | `TaskRow` has two incompatible shapes in same file | HIGH | Merge into one exported type; use `.pick()` for subsets. |
| E3 | `BpRow` index signature `[key: string]: unknown` masks missing fields | MEDIUM | Schema validates known keys strictly; index sig fields become extras. |
| E4 | `compile.ts` lines 32/72/337 read third-party `package.json` | LOW | Keep `Record<string, unknown>` + type guards; full Zod schemas for npm package.json are excessive. |
| E5 | `sqlite-store.ts` types (`CheckpointState`, `CheckpointMetadata`) live in `#ai-memory/checkpoint/types.js` | MEDIUM | Add Zod schemas in the types module so both the store and consumers benefit. Sites are lines **295 (`state_json`), 297 (`metadata_json`, has a reviver fn), 311 (`embedding_json`)** — line 297's reviver must be preserved or its behavior replicated. |
| E6 | Large `.all()` results cause perf regression if Zod validates every row | LOW | Use loose object schemas + `z.array()` — Zod validates shape not deep content. Benchmark target: < 5 ms added over raw `.all()` for a 1000-row payload (Task 1.2). If exceeded, validate first row + trust rest. |

## Risks

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Zod schemas drift from DB schema | HIGH | Add parity test comparing schema keys to DB column names (Task 1.2 acceptance). |
| Runtime validation in hot path | MEDIUM | Zod is already used in `src/`, but these target JSON/SQLite sites are new validation points; scope to genuinely unsafe sites, keep existing `typeof` guards (F8), and measure per-row cost (E6). |
| Performance hit on large `.all()` results | LOW | Validate shape only (loose objects); benchmark with 1000-row payload against the < 5 ms target. |
| `TaskRow` merge breaks existing usage | MEDIUM | Audit all 6 call sites before merging; use `.pick()` for the second variant. |
| Extending `compile.test.ts` weakens existing regression coverage | MEDIUM | Add valid/malformed manifest fixtures while preserving the existing no-`openSync` lock regression owned by `2026-06-14-fix-stream-resource-leaks`. |
| Task 5.1 lint ban scoped too broadly | HIGH | Ban only `JSON.parse(...) as <NonRecordType>` — NOT a global `as unknown as` ban (102 pre-existing sites would fail `wp lint`, F11). |


## Cross-Plan Alignment Notes

- **2026-06-14 alignment:** `2026-06-14-fix-stream-resource-leaks` verified that
  `src/cli/commands/compile.test.ts` already exists and protects the no-raw-fd
  lock acquisition behavior. Task 3.2 in this blueprint must extend that file
  in place and keep the resource-leak regression intact.
- Coordinate implementation with `2026-06-14-shared-filesystem-io-utilities`,
  which also touches `src/cli/commands/compile.ts`. Prefer serializing the
  `compile.ts` edits or landing one plan's tests before the other changes the
  same file.
- Coordinate implementation with `2026-06-14-shared-filesystem-io-utilities`,
  which also touches `src/mcp/blueprint-server.ts`. This blueprint owns SQLite
  row schemas/casts and unsafe value validation; the filesystem utility plan owns
  only eligible filesystem JSON I/O. Serialize `blueprint-server.ts` edits or
  split them by file region after tests are in place.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 2.1, 3.1, 3.2, 4.1 | None | 5 agents | XS-S |
| **Wave 1** | 1.2 | Task 1.1 | 1 agent | M |
| **Wave 2** | 5.1 | None (logically after Wave 1) | 1 agent | M |
| **Critical path** | 1.1 → 1.2 → 5.1 | — | 3 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual | Status |
| ------ | ----------------- | ------ | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 3 | 5 | OK |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 2.33 | Near target — genuine dep chain (types → server → audit) |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.43 | OK |
| CP | same-file overlaps per wave | 0 | 0 | OK |

**Parallelization score: B** — CPR is slightly below target due to the genuine `types.ts → blueprint-server.ts → code-safety.ts` dependency chain. No artificial deps; all Wave 0 tasks are fully independent.

## Tasks

#### Task 1.1: Create shared DB row types with Zod schemas

**Status:** done

**Depends:** None

Create `src/blueprint/db/types.ts` with Zod schemas for `TaskRow` and `BpRow`. Merge the two existing `TaskRow` definitions (line 925: **7 fields**; line 1785: 5 fields) into one canonical type and use `.pick()` for the narrower variant. Use loose object schemas (Zod v4 `z.looseObject(...)` or `z.object(...).loose()`) on all schemas so extra DB columns don't break parsing but missing required fields do. `src/blueprint/db/` already exists — reuse its `enums.ts` status/lane enums rather than redefining them.

**Files:**

- Create: `src/blueprint/db/types.ts`
- Create: `src/blueprint/db/types.test.ts`

**Steps (TDD):**

1. Write failing test: define schemas, parse valid rows, assert malformed rows throw
2. Run: `./bin/wp test --file src/blueprint/db/types.test.ts` — verify FAIL (no file yet)
3. Implement `src/blueprint/db/types.ts`:
   - Export `TaskRowSchema` (merged: id, blueprint_slug, task_id, wave, lane, title, status — reuse the status/lane unions from `src/blueprint/db/enums.ts`)
   - Export `TaskRowCompactSchema` = `TaskRowSchema.pick({task_id, title, status, wave, lane})`
   - Export `BpRowSchema` (slug, title, status, complexity, owner, last_updated, content_hash, ingested_at, file_path) as a **loose** object (`z.looseObject(...)`) so the `[key: string]: unknown` index sig fields become extras
   - Export inferred types: `type TaskRow = z.infer<typeof TaskRowSchema>`, etc.
4. Run: `./bin/wp test --file src/blueprint/db/types.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [x] `src/blueprint/db/types.ts` exports `TaskRowSchema`, `TaskRowCompactSchema`, `BpRowSchema`
- [x] All schemas use Zod v4 loose objects (`z.looseObject` / `.loose()`), NOT the removed `.passthrough()`
- [x] Schemas reuse `src/blueprint/db/enums.ts` for status/lane unions (no duplicate enum literals)
- [x] Tests cover valid rows, missing-required-key rows, and wrong-type rows
- [x] `./bin/wp typecheck` passes
- [x] `./bin/wp lint` passes

---

#### Task 2.1: Replace non-null assertion in lint-after-edit

**Status:** done

**Depends:** None

Replace `input.tool_input!.file_path as string` at `src/hooks/post-tool/lint-after-edit.ts:188` with a runtime guard that returns `false` early when the input is absent or malformed. The existing test file `src/hooks/post-tool/lint-after-edit.test.ts` covers this function.

**Files:**

- Modify: `src/hooks/post-tool/lint-after-edit.ts`

**Steps (TDD):**

1. Write failing test: call `processPostToolUse` with `tool_input` missing or `file_path` as non-string
2. Run: `./bin/wp test --file src/hooks/post-tool/lint-after-edit.test.ts` — verify FAIL
3. Implement guard in `processPostToolUse`:
   ```ts
   const toolInput = input.tool_input
   if (!toolInput || typeof toolInput.file_path !== 'string') return false
   const filePath = toolInput.file_path
   ```
4. Run: `./bin/wp test --file src/hooks/post-tool/lint-after-edit.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [x] No `tool_input!` or `as string` remains for `file_path`
- [x] `processPostToolUse` returns `false` when `tool_input` is absent or `file_path` is not a string
- [x] Existing tests pass; new test covers malformed input
- [x] `./bin/wp typecheck` passes

---

#### Task 3.1: Add Zod validation to JSON.parse in auto-update + cloudflare-deploy-contract

**Status:** done

**Depends:** None

Add a Zod schema for `ProductionReleaseMetadata` (in `src/audit/cloudflare-deploy-contract.ts`) — `readProductionMetadata` has zero validation today (F2). For `UpdateCache` (in `src/cli/auto-update/run.ts`), `readCache` already has manual `typeof` guards (F8); **keep the guards** and replace only the trailing `as Partial<UpdateCache>` cast with a thin Zod `safeParse` for consistency — do not over-build a speculative schema where the guard already protects the read.

**Files:**

- Modify: `src/cli/auto-update/run.ts`
- Modify: `src/audit/cloudflare-deploy-contract.ts`

**Steps (TDD):**

1. Add failing test for malformed cache JSON in `src/cli/auto-update/run.test.ts`
2. Add failing test for malformed metadata JSON in `src/audit/cloudflare-deploy-contract.test.ts`
3. Run: `./bin/wp test --file src/cli/auto-update/run.test.ts --file src/audit/cloudflare-deploy-contract.test.ts` — verify FAIL
4. Implement:
   - `UpdateCacheSchema`: `z.object({latest: z.string(), current: z.string(), lastUpdateCheck: z.number()})`
   - Use `UpdateCacheSchema.safeParse(JSON.parse(raw))` in `readCache` (keep the existing `typeof` guard as the first line of defense)
   - `ProductionReleaseMetadataSchema`: a loose object (`z.looseObject(...)`) with all fields optional
   - Use `ProductionReleaseMetadataSchema.parse(...)` in `readProductionMetadata`
5. Run: `./bin/wp test --file src/cli/auto-update/run.test.ts --file src/audit/cloudflare-deploy-contract.test.ts` — verify PASS
6. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [x] `readProductionMetadata` validates with Zod; malformed JSON throws clear error
- [x] `readCache` keeps its `typeof` guard and replaces the final cast with a Zod `safeParse`
- [x] All existing tests pass
- [x] `./bin/wp typecheck` passes

---

#### Task 3.2: Add Zod validation to JSON.parse in compile.ts

**Status:** done

**Depends:** None

Add a Zod schema for `CompileManifest` and validate the JSON.parse at line 147. Lines 32, 72, and 337 read third-party `package.json` files — keep those as `Record<string, unknown>` + type guards (E4). Extend the existing `src/cli/commands/compile.test.ts` file (F9); do not replace or weaken its existing lock-acquisition regression coverage.

**Files:**

- Modify: `src/cli/commands/compile.ts`
- Modify: `src/cli/commands/compile.test.ts`

**Steps (TDD):**

1. Add valid + malformed manifest tests to the existing `compile.test.ts`, preserving the current no-`openSync` lock regression test
2. Run: `./bin/wp test --file src/cli/commands/compile.test.ts` — verify the new manifest-shape test FAILS while existing lock-regression tests still PASS
3. Implement `CompileManifestSchema`:
   ```ts
   const CompileManifestSchema = z.object({
     version: z.number(),
     timestamp: z.string(),
     sourceHash: z.string(),
     outputHashes: z.record(z.string(), z.string()),
   })
   ```
4. Replace `as CompileManifest` at line 147 with `CompileManifestSchema.parse(...)`
5. Run: `./bin/wp test --file src/cli/commands/compile.test.ts` — verify PASS
6. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [x] `readCompileManifest` returns `null` on shape mismatch (not just JSON parse failure)
- [x] Existing `compile.test.ts` is extended with valid+invalid manifest fixtures
- [x] Lines 32/72/337 (`package.json` reads) unchanged
- [x] `./bin/wp typecheck` passes

---

#### Task 4.1: Add Zod validation to JSON.parse in sqlite-store.ts

**Status:** done

**Depends:** None

Add Zod schemas for `CheckpointState`, `CheckpointMetadata`, and the `number[]` embedding array used in `sqlite-store.ts` at lines **295 (`state_json`), 297 (`metadata_json`), and 311 (`embedding_json`)**. There is NO parse at line 318 (F7). Note that line 297 already passes a `(_key, value) => value` reviver to `JSON.parse` — preserve that reviver (or replicate its behavior) when wrapping the parse in Zod, so the metadata read is not a bare parse. These types are imported from `#ai-memory/checkpoint/types.js` — add the schemas there so both the store and consumers benefit (E5).

**Files:**

- Modify: `src/ai-memory/checkpoint/types.ts` (add schemas)
- Modify: `src/ai-memory/store/sqlite-store.ts` (use schemas)

**Steps (TDD):**

1. Add failing test in `src/ai-memory/store/sqlite-store.test.ts` for malformed JSON columns
2. Run: `./bin/wp test --file src/ai-memory/store/sqlite-store.test.ts` — verify FAIL
3. Implement schemas in `src/ai-memory/checkpoint/types.ts`:
   - `CheckpointStateSchema` (shape-dependent on the existing type definition)
   - `CheckpointMetadataSchema`: `z.record(z.string(), z.unknown())`
   - `EmbeddingSchema`: `z.array(z.number())` for the line 311 `embedding_json`
   - Export all three
4. Replace casts in `mapCheckpoint` (line 295 `state_json`, line 297 `metadata_json` — keep the reviver) and `mapFact` (line 311 `embedding_json`) with `Schema.parse(...)`
5. Run: `./bin/wp test --file src/ai-memory/store/sqlite-store.test.ts` — verify PASS
6. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [x] `CheckpointStateSchema`, `CheckpointMetadataSchema`, and `EmbeddingSchema` exported from types module
- [x] `mapCheckpoint` validates `state_json` (295) and `metadata_json` (297, reviver preserved) with Zod; corrupt JSON throws clear error
- [x] `mapFact` validates `embedding_json` (311) with Zod
- [x] Existing tests pass
- [x] `./bin/wp typecheck` passes

---

#### Task 1.2: Replace unsafe casts + JSON.parse in blueprint-server.ts

**Status:** done

**Depends:** Task 1.1

Replace the 4 `as unknown as` casts (lines 946, 1588, 1619, 1750) plus the 4 additional unchecked `as` casts (lines 1644, 1696, 1911, **1982**) and the JSON.parse → as sites (lines 352, 364, 632) with Zod parsers using schemas from `src/blueprint/db/types.ts` (Task 1.1). **Note:** line 432 is already guarded — do NOT touch it (F2 correction). This is the largest task — plan for ~100 lines changed across multiple functions.

**Files:**

- Modify: `src/mcp/blueprint-server.ts`

**Steps (TDD):**

1. Add failing tests in `src/mcp/blueprint-server.test.ts` for:
   - Corrupt DB rows (missing required columns)
   - Malformed JSON in response_json payloads
   - A 1000-row `.all()` payload to benchmark the loose-object array parse (< 5 ms over raw `.all()`)
2. Run: `./bin/wp test --file src/mcp/blueprint-server.test.ts` — verify new tests FAIL
3. Implement:
   - Import `TaskRowSchema`, `TaskRowCompactSchema`, `BpRowSchema` from `#db/types.js`
   - Replace `as unknown as TaskRow[]` with `z.array(Schema).parse(...)`
   - Replace `as unknown as BpRow[]` with `z.array(BpRowSchema).parse(...)`
   - Replace unchecked `as TaskRow[]` (incl. line 1982) / `as Array<BpRow & {project_id}>` with Zod
   - Replace the `JSON.parse → as` sites (352, 364, 632) with appropriate Zod schemas; leave line 432 untouched
   - Inline simple schemas (e.g., `z.record(z.string(), z.number())` for line 364) where a reusable schema is overkill
4. Run: `./bin/wp test --file src/mcp/blueprint-server.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [x] Zero `as unknown as` casts remain in `blueprint-server.ts`
- [x] Zero unchecked `as TaskRow[]` / `as BpRow[]` casts remain (incl. line 1982)
- [x] Targeted JSON.parse results (352, 364, 632) validated through Zod; line 432 left unchanged
- [x] Corrupt rows throw `ZodError` instead of silently producing wrong data
- [x] 1000-row `.all()` parse adds < 5 ms over the raw read (E6 benchmark)
- [x] Existing tests pass
- [x] `./bin/wp typecheck` passes

---

#### Task 5.1: Add lint rule against unvalidated JSON.parse casts

**Status:** done

**Depends:** None

Add an oxlint/audit rule in `src/config/oxlint/code-safety.ts` that flags the **`JSON.parse(...) as <NonRecordType>`** pattern only — i.e. casting a raw `JSON.parse` result directly to a specific type without validation. This is a defensive gate to prevent regressions after the above tasks ship.

**This task does NOT add a global `as unknown as` ban.** There are **102 existing `as unknown as` sites across 31 files** in `src/` (F11) — many are legitimate test-mock casts (e.g. `src/audit/run-stryker.test.ts:27`) and statement-handle casts (e.g. `src/blueprint/db/sqlite.ts:69`). A blanket ban would emit ~96+ violations on landing and fail `wp lint` repo-wide, contradicting this task's own "lint passes" acceptance. Banning the broad cast is out of scope; if it is ever pursued it needs its own blueprint with an enumerated allowlist + cleanup of all 102 sites.

**Files:**

- Modify: `src/config/oxlint/code-safety.ts`
- Modify: `src/config/oxlint/code-safety.test.ts` (if needed for the new rule)

**Steps (TDD):**

1. Add test case in the oxlint test fixture for the `JSON.parse(...) as <NonRecordType>` pattern (and a passing case for `JSON.parse(...) as Record<string, unknown>`)
2. Run oxlint rule tests — verify FAIL (new pattern not yet flagged)
3. Implement the rule:
   - Flag `JSON.parse(...) as <SpecificType>` where the type is NOT `Record<string, unknown>` / `unknown`
   - Allow `JSON.parse(...) as Record<string, unknown>` (the documented escape hatch for third-party `package.json` reads, E4)
   - Do NOT ban `as unknown as` generally
4. Run oxlint rule tests — verify PASS
5. Run `./bin/wp lint` on the full repo and fix any false positives
6. Run `./bin/wp audit ai-contracts` to ensure audit passes

**Acceptance:**

- [x] Unvalidated `JSON.parse(...) as SpecificType` is flagged by oxlint
- [x] `JSON.parse(...) as Record<string, unknown>` is allowed
- [x] No global `as unknown as` ban is introduced (102 pre-existing sites stay green)
- [x] `./bin/wp lint` passes on entire repo
- [x] `./bin/wp audit ai-contracts` passes
- [x] `.agent/rules/no-timeout-as-fix.md` is not violated (no timeouts raised for lint perf)

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `./bin/wp typecheck` | Zero errors |
| Tests | `./bin/wp test` | All pass (unit + integration) |
| Lint | `./bin/wp lint` | Zero violations |
| Format | `./bin/wp format --check` | Zero diffs |
| Audit: AI contracts | `./bin/wp audit ai-contracts` | Pass |
| Audit: Blueprint lifecycle | `./bin/wp audit blueprint-lifecycle` | Pass |

## Non-goals

- Re-typing all `Record<string, unknown>` metadata fields.
- Changing SQLite table schemas.
- Adding runtime validation for test-only fixtures.
- Full Zod schemas for third-party `package.json` reads (compile.ts lines 32, 72, 337).
- Deep validation of large text/blob fields — shape validation only.
- A global `as unknown as` lint ban (102 pre-existing sites; out of scope per F11).

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 11 |
| Critical | 1 (F11) |
| High | 3 (F1, F2, F3) |
| Medium | 5 (F5, F6, F7, F9, E2) |
| Low | 4 (F4, F8, F10, E4) |
| Fixes applied | 11/11 — all findings wired into tasks |
| Cross-plans updated | 0 (no downstream blueprints reference these files) |
| Edge cases documented | 6 |
| Risks documented | 6 |
| **Parallelization score** | B (5 tasks in Wave 0, CPR 2.33) |
| **Critical path** | 3 waves (1.1 → 1.2 → 5.1) |
| **Max parallel agents** | 5 |
| **Total tasks** | 7 |
| **Blueprint compliant** | 7/7 |

### Key refinement changes

1. **F11 — Task 5.1 rescoped (CRITICAL).** The original "ban `as unknown as` globally" would fail `wp lint` repo-wide: 102 sites across 31 files exist today. Task 5.1 now flags only `JSON.parse(...) as <NonRecordType>` and the global ban is moved to Non-goals.
2. **F7/E5/Task 4.1 — corrected `sqlite-store.ts` line numbers.** Actual sites are 295, 297 (with a reviver), 311 — not 295/311/318. Line 318 does not exist; line 297's reviver must be preserved.
3. **Why Zod justification corrected.** Zod is already used broadly in `src/`; the overview now states the DRY/YAGNI rationale for extending the existing validation pattern only to genuinely-unsafe sites and keeps existing `typeof` guards (F8) rather than over-building schemas.
4. **Product wedge anchor added.** Names the `wp blueprint list/get/query` verbs (and `wp_blueprint_*` MCP tools) backed by `blueprint-server.ts` reads, plus the `wp audit ai-contracts` gate, as the consuming surface.
5. **F5 — corrected field count + reuse note.** Line 925 `TaskRow` is 7 fields (not 8). `src/blueprint/db/` already exists; Task 1.1 reuses its `enums.ts` instead of redefining status/lane unions.
6. **F2/Task 1.2 — target sites corrected.** Dropped already-guarded line 432; added missing `as TaskRow[]` at line 1982.
7. **Zod v4 API.** `.passthrough()` is removed in Zod v4 — switched all loose-object schemas to `z.looseObject` / `.loose()` and updated acceptance bullets accordingly.
8. **F6 — expanded `compile.ts` scope.** 4 JSON.parse sites found (not 1). Three are low-priority `package.json` reads kept as-is.
9. **F9 — existing test file must be preserved.** `src/cli/commands/compile.test.ts` exists and contains resource-leak regression coverage. Task 3.2 extends it instead of creating/replacing it.
10. **F10 — confirmed `code-safety.ts` exists.** Path verified.
11. **Task granularity improved.** Original Task 1.2 (5 files, M) split into 3 independent tasks (3.1, 3.2, 4.1) for parallel execution; E6 now carries a concrete < 5 ms benchmark target.
