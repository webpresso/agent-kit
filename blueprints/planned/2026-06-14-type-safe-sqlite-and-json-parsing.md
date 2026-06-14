---
type: blueprint
title: Type-safe SQLite and JSON parsing
owner: ozby
status: planned
complexity: L
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/7 tasks done, 0 blocked)'
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

**Goal:** Replace unsafe `as unknown as` casts and unvalidated `JSON.parse` calls with Zod schemas so corrupt data fails loudly at runtime.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | HIGH | SQLite `.all()` results are cast with `as unknown as`. | Confirmed 4 occurrences at `src/mcp/blueprint-server.ts:946,1588,1619,1750`. Additional unchecked `as` casts at 1644 (`as TaskRow[]`), 1696 (`as Array<BpRow & {project_id}>`), 1911 (`as TaskRow[]`). |
| F2 | HIGH | `JSON.parse` results are cast directly to specific types. | Confirmed at: `src/mcp/blueprint-server.ts:352,364,432,632`; `src/cli/auto-update/run.ts:41`; `src/audit/cloudflare-deploy-contract.ts:19`; `src/cli/commands/compile.ts:32,72,147,337`; `src/ai-memory/store/sqlite-store.ts:295,311,318`. |
| F3 | HIGH | `lint-after-edit.ts` uses non-null assertion + cast. | Confirmed at `src/hooks/post-tool/lint-after-edit.ts:188`: `input.tool_input!.file_path as string`. |
| F4 | LOW | `any` type usage is effectively zero. | Confirmed: only comment/string occurrences; no `any` type annotations. |
| F5 | MEDIUM | `TaskRow` is a single type. | `TaskRow` is defined twice with different shapes: line 925 (8 fields incl. `id`, `blueprint_slug`) and line 1785 (5 fields, subset). These must be merged. |
| F6 | MEDIUM | `compile.ts` has 1 JSON.parse site. | Actually has 4 sites (lines 32, 72, 147, 337). Lines 32/72/337 read `package.json` with type guards — lower priority. Line 147 (`CompileManifest`) has NO shape validation. |
| F7 | MEDIUM | `sqlite-store.ts` has 2 JSON.parse sites. | Actually has 3 sites (lines 295, 311, 318). All three cast to imported types with zero validation. |
| F8 | LOW | `auto-update/run.ts` `readCache` is unsound. | It uses manual `typeof` guards (lines 42-45) before the `as UpdateCache` cast, making it safer than most sites. Still benefits from Zod for future-proofing. |
| F9 | MEDIUM | `compile.test.ts` exists. | `src/cli/commands/compile.test.ts` does NOT exist. Must be created for Task 3.2. |
| F10 | LOW | `code-safety.ts` exists for oxlint rules. | Confirmed: `src/config/oxlint/code-safety.ts` exists. |

## Edge Cases

| ID | Case | Severity | Mitigation |
| -- | ---- | -------- | ---------- |
| E1 | Schema drift: DB column added but Zod schema not updated | MEDIUM | Row schemas use `.passthrough()` so extra columns silently pass; missing columns fail loudly. |
| E2 | `TaskRow` has two incompatible shapes in same file | HIGH | Merge into one exported type; use `.pick()` for subsets. |
| E3 | `BpRow` index signature `[key: string]: unknown` masks missing fields | MEDIUM | Schema validates known keys strictly; index sig fields become extras. |
| E4 | `compile.ts` lines 32/72/337 read third-party `package.json` | LOW | Keep `Record<string, unknown>` + type guards; full Zod schemas for npm package.json are excessive. |
| E5 | `sqlite-store.ts` types (`CheckpointState`, `CheckpointMetadata`) live in `#ai-memory/checkpoint/types.js` | MEDIUM | Add Zod schemas in the types module so both the store and consumers benefit. |
| E6 | Large `.all()` results cause perf regression if Zod validates every row | LOW | Use `.passthrough()` + `z.array()` — Zod validates shape not deep content; negligible overhead for <1000-row results. |

## Risks

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Zod schemas drift from DB schema | HIGH | Add parity test comparing schema keys to DB column names (Task 1.2 acceptance). |
| Performance hit on large `.all()` results | LOW | Validate shape only (`.passthrough()`); benchmark with 1000-row payload. |
| `TaskRow` merge breaks existing usage | MEDIUM | Audit all 6 call sites before merging; use `.pick()` for the second variant. |
| New `compile.test.ts` misses edge cases | MEDIUM | Test both valid and malformed manifests; include missing-key and wrong-type fixtures. |

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

### [sqlite] Task 1.1: Create shared DB row types with Zod schemas

**Status:** todo

**Depends:** None

Create `src/blueprint/db/types.ts` with Zod schemas for `TaskRow` and `BpRow`. Merge the two existing `TaskRow` definitions (line 925: 8 fields; line 1785: 5 fields) into one canonical type and use `.pick()` for the narrower variant. Use `.passthrough()` on all schemas so extra DB columns don't break parsing but missing required fields do.

**Files:**

- Create: `src/blueprint/db/types.ts`
- Create: `src/blueprint/db/types.test.ts`

**Steps (TDD):**

1. Write failing test: define schemas, parse valid rows, assert malformed rows throw
2. Run: `./bin/wp test --file src/blueprint/db/types.test.ts` — verify FAIL (no file yet)
3. Implement `src/blueprint/db/types.ts`:
   - Export `TaskRowSchema` (merged: id, blueprint_slug, task_id, wave, lane, title, status)
   - Export `TaskRowCompactSchema` = `TaskRowSchema.pick({task_id, title, status, wave, lane})`
   - Export `BpRowSchema` (slug, title, status, complexity, owner, last_updated, content_hash, ingested_at, file_path, plus `.passthrough()` for index sig)
   - Export inferred types: `type TaskRow = z.infer<typeof TaskRowSchema>`, etc.
4. Run: `./bin/wp test --file src/blueprint/db/types.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] `src/blueprint/db/types.ts` exports `TaskRowSchema`, `TaskRowCompactSchema`, `BpRowSchema`
- [ ] All schemas use `.passthrough()`
- [ ] Tests cover valid rows, missing-required-key rows, and wrong-type rows
- [ ] `./bin/wp typecheck` passes
- [ ] `./bin/wp lint` passes

---

### [type-safety] Task 2.1: Replace non-null assertion in lint-after-edit

**Status:** todo

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

- [ ] No `tool_input!` or `as string` remains for `file_path`
- [ ] `processPostToolUse` returns `false` when `tool_input` is absent or `file_path` is not a string
- [ ] Existing tests pass; new test covers malformed input
- [ ] `./bin/wp typecheck` passes

---

### [type-safety] Task 3.1: Add Zod validation to JSON.parse in auto-update + cloudflare-deploy-contract

**Status:** todo

**Depends:** None

Add Zod schemas for `UpdateCache` (in `src/cli/auto-update/run.ts`) and `ProductionReleaseMetadata` (in `src/audit/cloudflare-deploy-contract.ts`). The `readCache` function already has manual `typeof` guards — replace the `as Partial<UpdateCache>` cast with Zod. The `readProductionMetadata` function has zero validation — add a schema.

**Files:**

- Modify: `src/cli/auto-update/run.ts`
- Modify: `src/audit/cloudflare-deploy-contract.ts`

**Steps (TDD):**

1. Add failing test for malformed cache JSON in `src/cli/auto-update/run.test.ts`
2. Add failing test for malformed metadata JSON in `src/audit/cloudflare-deploy-contract.test.ts`
3. Run: `./bin/wp test --file src/cli/auto-update/run.test.ts --file src/audit/cloudflare-deploy-contract.test.ts` — verify FAIL
4. Implement:
   - `UpdateCacheSchema`: `z.object({latest: z.string(), current: z.string(), lastUpdateCheck: z.number()})`
   - Use `UpdateCacheSchema.safeParse(JSON.parse(raw))` in `readCache`
   - `ProductionReleaseMetadataSchema`: `z.object({...}).passthrough()` with all fields optional
   - Use `ProductionReleaseMetadataSchema.parse(...)` in `readProductionMetadata`
5. Run: `./bin/wp test --file src/cli/auto-update/run.test.ts --file src/audit/cloudflare-deploy-contract.test.ts` — verify PASS
6. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] `readCache` validates with Zod; manual `typeof` guards removed
- [ ] `readProductionMetadata` validates with Zod; malformed JSON throws clear error
- [ ] All existing tests pass
- [ ] `./bin/wp typecheck` passes

---

### [type-safety] Task 3.2: Add Zod validation to JSON.parse in compile.ts

**Status:** todo

**Depends:** None

Add a Zod schema for `CompileManifest` and validate the JSON.parse at line 147. Lines 32, 72, and 337 read third-party `package.json` files — keep those as `Record<string, unknown>` + type guards (E4). Create a new test file since `src/cli/commands/compile.test.ts` does not exist (F9).

**Files:**

- Modify: `src/cli/commands/compile.ts`
- Create: `src/cli/commands/compile.test.ts`

**Steps (TDD):**

1. Write `compile.test.ts` with test for valid + malformed manifests
2. Run: `./bin/wp test --file src/cli/commands/compile.test.ts` — verify FAIL (manifest schema not yet added)
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

- [ ] `readCompileManifest` returns `null` on shape mismatch (not just JSON parse failure)
- [ ] `compile.test.ts` created with valid+invalid manifest fixtures
- [ ] Lines 32/72/337 (`package.json` reads) unchanged
- [ ] `./bin/wp typecheck` passes

---

### [sqlite] Task 4.1: Add Zod validation to JSON.parse in sqlite-store.ts

**Status:** todo

**Depends:** None

Add Zod schemas for `CheckpointState`, `CheckpointMetadata`, and the `number[]` embedding array used in `sqlite-store.ts` lines 295, 311, 318. These types are imported from `#ai-memory/checkpoint/types.js` — add the schemas there so both the store and consumers benefit (E5).

**Files:**

- Modify: `src/ai-memory/checkpoint/types.ts` (add schemas)
- Modify: `src/ai-memory/store/sqlite-store.ts` (use schemas)

**Steps (TDD):**

1. Add failing test in `src/ai-memory/store/sqlite-store.test.ts` for malformed JSON columns
2. Run: `./bin/wp test --file src/ai-memory/store/sqlite-store.test.ts` — verify FAIL
3. Implement schemas in `src/ai-memory/checkpoint/types.ts`:
   - `CheckpointStateSchema` (shape-dependent on the existing type definition)
   - `CheckpointMetadataSchema`: `z.record(z.string(), z.unknown())`
   - Export both
4. Replace casts in `mapCheckpoint` and `mapFact` with `Schema.parse(...)`
5. Run: `./bin/wp test --file src/ai-memory/store/sqlite-store.test.ts` — verify PASS
6. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] `CheckpointStateSchema` and `CheckpointMetadataSchema` exported from types module
- [ ] `mapCheckpoint` validates with Zod; corrupt state_json throws clear error
- [ ] `mapFact` validates embedding_json with Zod
- [ ] Existing tests pass
- [ ] `./bin/wp typecheck` passes

---

### [sqlite] Task 1.2: Replace unsafe casts + JSON.parse in blueprint-server.ts

**Status:** todo

**Depends:** Task 1.1

Replace the 4 `as unknown as` casts (lines 946, 1588, 1619, 1750) plus the 3 additional unchecked `as` casts (lines 1644, 1696, 1911) and the 4 `JSON.parse → as` sites (lines 352, 364, 432, 632) with Zod parsers using schemas from `src/blueprint/db/types.ts` (Task 1.1). This is the largest task — plan for ~100 lines changed across multiple functions.

**Files:**

- Modify: `src/mcp/blueprint-server.ts`

**Steps (TDD):**

1. Add failing tests in `src/mcp/blueprint-server.test.ts` for:
   - Corrupt DB rows (missing required columns)
   - Malformed JSON in response_json payloads
2. Run: `./bin/wp test --file src/mcp/blueprint-server.test.ts` — verify new tests FAIL
3. Implement:
   - Import `TaskRowSchema`, `TaskRowCompactSchema`, `BpRowSchema` from `#db/types.js`
   - Replace `as unknown as TaskRow[]` with `z.array(Schema).parse(...)`
   - Replace `as unknown as BpRow[]` with `z.array(BpRowSchema).parse(...)`
   - Replace unchecked `as TaskRow[]` / `as Array<BpRow & {project_id}>` with Zod
   - Replace `as Record<string, unknown>` JSON.parse sites with appropriate Zod schemas
   - Inline simple schemas (e.g., `Record<string, number>` for line 364) where a reusable schema is overkill
4. Run: `./bin/wp test --file src/mcp/blueprint-server.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] Zero `as unknown as` casts remain in `blueprint-server.ts`
- [ ] Zero unchecked `as TaskRow[]` / `as BpRow[]` casts remain
- [ ] All JSON.parse results validated through Zod
- [ ] Corrupt rows throw `ZodError` instead of silently producing wrong data
- [ ] Existing tests pass
- [ ] `./bin/wp typecheck` passes

---

### [qa] Task 5.1: Add lint rule against new unsafe casts

**Status:** todo

**Depends:** None

Add an oxlint rule or audit rule in `src/config/oxlint/code-safety.ts` that flags new `as unknown as` casts and unvalidated `JSON.parse(...) as` patterns. This is a defensive gate to prevent regressions after the above tasks ship.

**Files:**

- Modify: `src/config/oxlint/code-safety.ts`
- Modify: `src/config/oxlint/code-safety.test.ts` (if needed for the new rule)

**Steps (TDD):**

1. Add test case in oxlint test fixture for new `as unknown as` + `JSON.parse(...) as` patterns
2. Run oxlint rule tests — verify FAIL (new patterns not yet flagged)
3. Implement the rule:
   - Ban `as unknown as` pattern globally
   - Ban `JSON.parse(...) as <NonRecordType>` (allow `as Record<string, unknown>`)
4. Run oxlint rule tests — verify PASS
5. Run `./bin/wp lint` on the full repo and fix any false positives
6. Run `./bin/wp audit ai-contracts` to ensure audit passes

**Acceptance:**

- [ ] New `as unknown as` casts are blocked by oxlint
- [ ] Unvalidated `JSON.parse(...) as SpecificType` is flagged
- [ ] `./bin/wp lint` passes on entire repo
- [ ] `./bin/wp audit ai-contracts` passes
- [ ] `.agent/rules/no-timeout-as-fix.md` is not violated (no timeouts raised for lint perf)

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

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 10 |
| Critical | 0 |
| High | 3 (F1, F2, F3) |
| Medium | 5 (F5, F6, F7, F9, E2) |
| Low | 4 (F4, F8, F10, E4) |
| Fixes applied | 10/10 — all findings wired into tasks |
| Cross-plans updated | 0 (no downstream blueprints reference these files) |
| Edge cases documented | 6 |
| Risks documented | 4 |
| **Parallelization score** | B (5 tasks in Wave 0, CPR 2.33) |
| **Critical path** | 3 waves (1.1 → 1.2 → 5.1) |
| **Max parallel agents** | 5 |
| **Total tasks** | 7 |
| **Blueprint compliant** | 7/7 |

### Key refinement changes

1. **F5 — merged two `TaskRow` definitions.** Found at lines 925 and 1785 with different shapes. Task 1.1 creates one canonical schema.
2. **F6 — expanded `compile.ts` scope.** 4 JSON.parse sites found (not 1). Three are low-priority `package.json` reads kept as-is.
3. **F7 — expanded `sqlite-store.ts` scope.** 3 JSON.parse sites found (not 2). Line 318 (`number[]`) added.
4. **F8 — downgraded `auto-update` severity.** Manual `typeof` guards already provide basic safety. Zod replaces them for consistency.
5. **F9 — new test file needed.** `src/cli/commands/compile.test.ts` does not exist. Task 3.2 creates it.
6. **F10 — confirmed `code-safety.ts` exists.** Path verified.
7. **Task 1.2 scope expanded.** Now covers 7 unchecked casts (not 4) plus 4 JSON.parse sites — everything in `blueprint-server.ts`.
8. **Task granularity improved.** Original Task 1.2 (5 files, M) split into 3 independent tasks (3.1, 3.2, 4.1) for parallel execution.
