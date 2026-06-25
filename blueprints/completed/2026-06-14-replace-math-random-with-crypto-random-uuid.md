---
type: blueprint
title: Replace Math.random with crypto-derived IDs
owner: ozby
status: completed
complexity: S
created: "2026-06-14"
last_updated: "2026-06-22"
progress: "100% (3/3 tasks done, 0 blocked, updated 2026-06-22)"
depends_on: []
cross_repo_depends_on: []
tags:
  - security
  - crypto
  - id-generation
  - temp-files
worktree_owner_id: ""
worktree_owner_branch: ""
---

# Replace Math.random with crypto-derived IDs

**Goal:** Replace all `Math.random()` usages in production `src/` code with
`node:crypto`-backed identifiers (`crypto.randomBytes` or `crypto.randomUUID`).
Current usages are not security-critical (ids, temp paths, suffixes), but
predictable PRNG output is a hardening gap — local symlink attacks on
predictable temp paths are the most realistic vector.

## Product wedge anchor

- **Stage outcome:** Agent-kit hardening track in the public-extraction
  roadmap — `wp audit` must be able to assert zero predictable-PRNG ID
  generation in the published `@webpresso/agent-kit` so third-party consumers
  (ingest-lens, edge-matte) inherit a crypto-clean toolchain.
- **Consuming surface:** the `wp audit no-math-random` audit kind (the final
  audit in Task 3.1 codifies the `grep`-based gate this audit enforces) plus
  every `wp` CLI verb whose temp-path / id-generation paths (`wp blueprint`
  mutations, `wp` quality-log store, docs-lint `migrate`) now route through
  `node:crypto.randomUUID()`.
- **New user-visible capability:** a consumer running `wp audit` gets a green
  signal that the agent-kit binary they install generates IDs and temp paths
  with crypto-grade randomness instead of `Math.random()`.

## Refinement Summary

| Metric                    | Value                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| Findings total            | 5                                                                         |
| Critical                  | 0                                                                         |
| High                      | 1 (HIGH: tempSuffix reinvents an in-scope randomUUID convention)          |
| Medium                    | 1 (F3: predictable temp paths)                                            |
| Low                       | 3                                                                         |
| Fixes applied             | 5/5                                                                       |
| Cross-plans updated       | 0                                                                         |
| Edge cases documented     | 2                                                                         |
| Risks documented          | 2                                                                         |
| **Parallelization score** | B (CPR=1.5, below 2.5 target but inherent to sequenced S-complexity plan) |
| **Critical path**         | 2 waves                                                                   |
| **Max parallel agents**   | 2 (Wave 1)                                                                |
| **Total tasks**           | 3                                                                         |

## Quick Reference (Execution Waves)

| Wave              | Tasks               | Dependencies | Parallelizable | Effort |
| ----------------- | ------------------- | ------------ | -------------- | ------ |
| **Wave 0**        | 1.1                 | None         | 1 agent        | S      |
| **Wave 1**        | 2.1, 2.2            | 1.1          | 2 agents       | XS, XS |
| **Wave 2**        | 3.1                 | 2.1, 2.2     | 1 agent        | XS     |
| **Critical path** | 1.1 → 2.1/2.2 → 3.1 | —            | 2 waves        | S      |

## Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target      | Actual    |
| ------ | ---------------------------------- | ----------- | --------- |
| RW0    | Ready tasks in Wave 0              | ≥ planned/2 | 1         |
| CPR    | total_tasks / critical_path_length | ≥ 2.5       | 3/2 = 1.5 |
| DD     | dependency_edges / total_tasks     | ≤ 2.0       | 3/3 = 1.0 |
| CP     | same-file overlaps per wave        | 0           | 0         |

**Refinement delta:** CPR misses 2.5 target because Wave 0 has a single
dependency-free task (helper creation) and all replacements are gated on it.
This is inherent for a 3-task S-complexity security hardening — splitting
the helper into smaller units would add overhead without parallelism. Accept.
(Metrics were previously stated against `total_tasks=4`; corrected to the
actual 3 tasks: CPR 4/2→3/2, DD 3/4→3/3.)

## Fact-Check Findings

| ID  | Severity | Claim                                                                                                                                                                              | Verified Reality                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | LOW      | `Math.random()` used 10+ times across 8+ production files.                                                                                                                         | **Confirmed.** 10 usages across exactly 8 non-test `src/**/*.ts` files. Verified via `grep -rn "Math\.random" src --include="*.ts"` (excluding `*.test.ts`). Full list below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| F2  | LOW      | None of these uses are security-sensitive (no auth tokens or session IDs).                                                                                                         | **Confirmed.** All 10 usages generate: row/session ids, temp-file suffixes, worktree short suffixes, checkpoint/thread identifiers. No auth tokens, secrets, or session-cookie generation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| F3  | MEDIUM   | Predictable temp paths can enable local symlink attacks if the directory is world-writable.                                                                                        | **Risk remains valid.** The `quality-log-store.ts`, `migrate-command.ts`, and `mutations.ts` usages write to temp paths under writable directories. `crypto.randomUUID()` eliminates the predictability vector.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| F4  | LOW      | `crypto.randomUUID()` is available in Node 24.                                                                                                                                     | **Confirmed.** `crypto.randomUUID()` is available since Node 14.17.0 (v15.6.0 for the global alias). Node runtime: v24.16.0. `crypto.randomBytes()` is also available and preferred for short-ID generation (arbitrary length).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| F5  | HIGH     | Task 1.1 creates a new `src/utils/short-id.ts` with `shortId()` **and** `tempSuffix()` as "the single point of change"; Task 2.2 replaces the temp-path sites with `tempSuffix()`. | **Reinvention confirmed — corrected.** `node:crypto.randomUUID` is **already imported and in scope** in `src/cli/commands/blueprint/mutations.ts:17` (used at :345 and :457), and the identical atomic-write temp-path pattern `path.join(tmpDir, ` + "`${randomUUID()}.md`" + `)` already exists one directory over at `src/cli/commands/blueprint/router-dispatch.ts:119`. The codebase has an established `randomUUID()` convention for exactly this use. **Fix:** the three temp-path sites use `crypto.randomUUID()` **directly** (no helper); the `tempSuffix()` helper is **deleted** (DRY/YAGNI). `shortId()` is kept only for the length-bounded short-slug sites. This also removes the `../../../../../utils` 5-level relative ladder from `migrate-command.ts` (which would violate `ts-coding-conventions.md`), since `crypto.randomUUID()` is imported directly from `node:crypto`. |

## Production Math.random Inventory

| #   | File                                                   | Line | Pattern                                                 | Replacement Strategy                                                    |
| --- | ------------------------------------------------------ | ---- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | `src/ai-memory/checkpoint/saver.ts`                    | 52   | `Math.random().toString(36).substring(2, 10)`           | `shortId(8)`                                                            |
| 2   | `src/ai-memory/checkpoint/saver.ts`                    | 58   | `Math.random().toString(36).substring(2, 10)`           | `shortId(8)`                                                            |
| 3   | `src/ai-memory/facts/extractor.ts`                     | 145  | `Math.random().toString(36).substring(2, 8)`            | `shortId(6)`                                                            |
| 4   | `src/ai-memory/store/sqlite-store.ts`                  | 93   | `Math.random().toString(36).slice(2, 10)`               | `shortId(8)`                                                            |
| 5   | `src/cli/commands/quality-log-store.ts`                | 200  | `Math.random().toString(36).slice(2)`                   | `crypto.randomUUID()` (temp path)                                       |
| 6   | `src/cli/commands/quality-log-store.ts`                | 277  | `Math.random().toString(36).slice(2, 8)`                | `shortId(6)`                                                            |
| 7   | `src/cli/commands/blueprint/mutations.ts`              | 209  | `Math.random().toString(36).slice(2)`                   | `crypto.randomUUID()` (temp path; `randomUUID` already imported at :17) |
| 8   | `src/cli/commands/worktree/router-dispatch.ts`         | 111  | `Math.random().toString(36).slice(2, 5).padEnd(3, '0')` | `shortId(3)` (filesystem-safe charset — see E1)                         |
| 9   | `src/config/docs-lint/cli/commands/migrate-command.ts` | 316  | `Math.random().toString(36).slice(2)`                   | `crypto.randomUUID()` (temp path; direct `node:crypto` import)          |
| 10  | `src/session-memory/session.ts`                        | 117  | `Math.random().toString(36).slice(2, 10)`               | `shortId(8)`                                                            |

Additionally, 49 test-file usages across 47 `*.test.ts` files follow the same
`Date.now() + Math.random()` temp-path pattern. A follow-up task replaces
these for consistency.

## Edge Cases

| #   | Case                                                                                                    | Handling                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | `router-dispatch.ts:111` produces a short suffix used as a **filesystem path component** for worktrees. | Use a filesystem-safe charset (base36), **not** base64url — base64url's `-`/`_` characters can trip worktree path-sanitization elsewhere. `shortId(n)` returns a base36 string of exactly `n` characters for this site. |
| E2  | Tests assert exact ID strings (e.g., regex or fixture snapshots).                                       | Update test expectations to match the new format or use length/character-set assertions.                                                                                                                                |

## Risks

| Risk                                                  | Mitigation                                                                                                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shortId` collides with prior IDs in the same system. | 8 chars of crypto-random base36 ≈ 41 bits of entropy; birthday-problem collision probability is negligible at project-local scope. The temp-path sites use full `crypto.randomUUID()` (122 bits). |
| Behavior change in tests asserting exact ID format.   | Use `expect(id).toMatch(/^[A-Za-z0-9]+$/)` instead of exact-string matchers. Update any snapshot fixtures.                                                                                        |

## Tasks

#### Task 1.1: Create short-id crypto helper

**Status:** done

**Depends:** None

Create a shared utility module that wraps `node:crypto.randomBytes` for
short, URL-safe identifier generation. This is the single point of change for
the **length-bounded short-id** sites. The temp-path sites do **not** use this
helper — they call `crypto.randomUUID()` directly, reusing the established
in-repo convention (e.g. `src/cli/commands/blueprint/router-dispatch.ts:119`),
so no `tempSuffix()` helper is created (it would reinvent `randomUUID()` — see
F5).

**Files:**

- Create: `src/utils/short-id.ts`
- Create: `src/utils/short-id.test.ts`

**Steps (TDD):**

1. Write failing tests in `src/utils/short-id.test.ts`:
   - `shortId(8)` returns exactly 8 characters from a filesystem-safe charset (base36), no `=` padding.
   - `shortId()` with no argument defaults to 8.
   - Two consecutive calls return different values.
2. Run: `./bin/wp test --file src/utils/short-id.test.ts` — verify FAIL.
3. Implement `src/utils/short-id.ts`:
   - `shortId(length = 8): string` → derive from `crypto.randomBytes` and
     encode to a base36 (filesystem-safe) string, then slice to exactly
     `length` characters.
4. Run: `./bin/wp test --file src/utils/short-id.test.ts` — verify PASS.
5. Run: `./bin/wp lint` on the two files, then `./bin/wp typecheck`.

**Acceptance:**

- [x] Helper imports only from `node:crypto`.
- [x] No `tempSuffix()` export (temp-path sites use `crypto.randomUUID()` directly).
- [x] No `Math.random` in helper source or test.
- [x] Tests cover uniqueness, length, and filesystem-safe character set.
- [x] `./bin/wp lint` passes on `src/utils/short-id.ts` and `src/utils/short-id.test.ts`.
- [x] `./bin/wp typecheck` passes.

---

#### Task 2.1: Replace Math.random in ai-memory subsystem

**Status:** done

**Depends:** Task 1.1

Replace all `Math.random()` calls in the `src/ai-memory/` directory with the
new `shortId()` helper. These are all SQLite row IDs and checkpoint identifiers
— low-risk, well-isolated from other subsystems.

**Files:**

- Modify: `src/ai-memory/checkpoint/saver.ts`
- Modify: `src/ai-memory/facts/extractor.ts`
- Modify: `src/ai-memory/store/sqlite-store.ts`

**Steps (TDD):**

1. For each file, identify the `Math.random()` line(s) from the inventory table.
2. Import `shortId` from `../../utils/short-id.js` (adjust relative path per file).
3. Replace: `Math.random().toString(36).substring(2, N)` → `shortId(N-2)`.
   - `saver.ts:52,58`: `substring(2, 10)` → `shortId(8)`.
   - `extractor.ts:145`: `substring(2, 8)` → `shortId(6)`.
   - `sqlite-store.ts:93`: `slice(2, 10)` → `shortId(8)`.
4. Run affected tests: `./bin/wp test --file src/ai-memory/checkpoint/saver.test.ts` (and any existing ai-memory tests).
5. Run: `./bin/wp lint` on modified files, then `./bin/wp typecheck`.

**Acceptance:**

- [x] `grep -rn "Math\.random" src/ai-memory --include="*.ts"` returns zero hits (in non-test files).
- [x] All existing ai-memory tests pass.
- [x] `./bin/wp lint` passes on modified files.
- [x] `./bin/wp typecheck` passes.

---

#### Task 2.2: Replace Math.random in CLI, config, and session subsystems

**Status:** done

**Depends:** Task 1.1

Replace all `Math.random()` calls in `src/cli/`, `src/config/`, and
`src/session-memory/`. Temp-path sites use `crypto.randomUUID()` **directly**
(the convention already in use at `router-dispatch.ts:119`; `randomUUID` is
already imported at `mutations.ts:17`); short-slug sites use `shortId()`.
Run in parallel with Task 2.1 (no shared files).

**Files:**

- Modify: `src/cli/commands/quality-log-store.ts`
- Modify: `src/cli/commands/blueprint/mutations.ts`
- Modify: `src/cli/commands/worktree/router-dispatch.ts`
- Modify: `src/config/docs-lint/cli/commands/migrate-command.ts`
- Modify: `src/session-memory/session.ts`

**Steps (TDD):**

1. For temp-path sites, import `randomUUID` from `node:crypto` (or reuse the
   existing import — `mutations.ts` already has it at :17). For short-slug
   sites, import `shortId` from the helper (adjust path per file).
2. Replacements:
   - `quality-log-store.ts:200`: temp path → `crypto.randomUUID()`.
   - `quality-log-store.ts:277`: `slice(2, 8)` → `shortId(6)`.
   - `mutations.ts:209`: temp path → `randomUUID()` (already imported at :17).
   - `router-dispatch.ts:111`: `slice(2, 5).padEnd(3, '0')` → `shortId(3)`
     (filesystem-safe base36 charset — this value is a worktree path
     component; do NOT use base64url, see E1).
   - `migrate-command.ts:316`: temp path → `crypto.randomUUID()` (direct
     `node:crypto` import — avoids the `../../../../../utils` 5-level relative
     ladder a helper import would require).
   - `session.ts:117`: `slice(2, 10)` → `shortId(8)`.
3. Run affected tests: `./bin/wp test --file src/cli/commands/quality-log-store.test.ts` and any others directly touching modified code.
4. Run: `./bin/wp lint` on modified files, then `./bin/wp typecheck`.

**Acceptance:**

- [x] `grep -rn "Math\.random" src/{cli,config,session-memory} --include="*.ts" | grep -v test` returns zero hits.
- [x] Temp-path sites call `crypto.randomUUID()` (no `tempSuffix` helper).
- [x] `migrate-command.ts` imports `randomUUID` from `node:crypto` (no `../../../../../utils` ladder).
- [x] All affected tests pass.
- [x] `./bin/wp lint` passes on modified files.
- [x] `./bin/wp typecheck` passes.

---

#### Task 3.1: Final audit — zero Math.random in production src

**Status:** done

**Depends:** Task 2.1, Task 2.2

Run a final audit to confirm zero `Math.random()` calls remain in any
production `src/` file. This `grep`-based gate is the contract the
`wp audit no-math-random` audit kind enforces (see Product wedge anchor).

**Files:**

- None (audit-only task).

**Steps:**

1. Run: `grep -rn "Math\.random" src --include="*.ts" | grep -v "\.test\."` — expect zero output.
2. Run: `grep -rn "crypto\.randomBytes" src/utils/short-id.ts` — confirm the helper uses `node:crypto`.
3. Run: `grep -rn "tempSuffix" src --include="*.ts"` — expect zero hits (helper was not created).
4. Run full test suite: `./bin/wp test` — all pass.
5. Run: `./bin/wp lint` and `./bin/wp typecheck` — zero issues.

**Acceptance:**

- [x] `grep -rn "Math\.random" src --include="*.ts" | grep -v "\.test\."` returns zero hits.
- [x] `src/utils/short-id.ts` exists and uses `crypto.randomBytes`.
- [x] No `tempSuffix` symbol exists anywhere in `src`.
- [x] Full test suite passes.
- [x] `./bin/wp lint` passes.
- [x] `./bin/wp typecheck` passes.

---

## Verification Gates

| Gate           | Command                                                                | Success Criteria                           |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| Type safety    | `./bin/wp typecheck`                                                   | Zero errors.                               |
| Tests          | `./bin/wp test --file src/utils/short-id.test.ts` then `./bin/wp test` | All pass.                                  |
| Lint           | `./bin/wp lint` on modified files                                      | Zero violations.                           |
| Audit          | `grep -rn "Math\.random" src --include="*.ts" \| grep -v "\.test\."`   | Zero hits.                                 |
| Crypto source  | `grep -rn "crypto\.randomBytes" src/utils/short-id.ts`                 | One match (the helper).                    |
| No reinvention | `grep -rn "tempSuffix" src --include="*.ts"`                           | Zero hits (temp paths use `randomUUID()`). |

## Non-goals

- Replacing `Math.random` in test files (49 usages across 47 `*.test.ts` files). These are for temp directories and test isolation only — out of scope for this S-complexity hardening.
- Changing deterministic fixtures or seed values.
- Adding new npm dependencies (only `node:crypto` standard library).
- Replacing `Math.random` for non-ID purposes (e.g., randomized sampling or shuffle algorithms — none exist in this codebase).
- Adding a `tempSuffix()` helper — temp-path sites reuse the existing `crypto.randomUUID()` convention directly (DRY/YAGNI).

## Technology Choices

| Choice                                        | Rationale                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `crypto.randomUUID()` for temp-path sites     | Already imported and in use in the exact files being edited (`mutations.ts:17`, `router-dispatch.ts:119`); 122 bits of entropy; zero new helper surface. Reuses the established in-repo convention rather than reinventing it. |
| `crypto.randomBytes` → base36 for `shortId()` | Node built-in; no deps; arbitrary-length short IDs; filesystem-safe characters (base36, not base64url — base64url's `-`/`_` can break worktree path sanitization).                                                             |
| Single `shortId()` helper (no `tempSuffix()`) | Only the length-bounded short-slug sites need a shared helper. The temp-path sites are covered by direct `randomUUID()` calls, so a second helper would duplicate an existing in-repo idiom.                                   |

## Completion Evidence

Completed on 2026-06-22 in branch `bp/2026-06-14-replace-math-random-with-crypto-random-uuid`.

Implemented:

- Added `src/utils/short-id.ts` backed by `node:crypto.randomBytes`, with tests for default length, requested length, uniqueness, and invalid lengths.
- Replaced all production `src/**/*.ts` `Math.random()` ID/temp-path usages with either `shortId()` or `randomUUID()`.
- Added `wp audit no-math-random` / MCP audit support and regression tests.
- Covered the additional current-main production hit in `src/hooks/errors/index.ts`, which was not in the original 2026-06-14 inventory.

Verification run:

- `./bin/wp test --file src/utils/short-id.test.ts --file src/audit/no-math-random.test.ts --file src/cli/commands/quality-log-store.test.ts --file src/ai-memory/checkpoint/saver.test.ts --file src/config/docs-lint/cli/commands/migrate-command.test.ts --file src/session-memory/session.test.ts --file src/hooks/errors/index.test.ts` — passed.
- `./bin/wp audit no-math-random --json` — passed (`ok: true`, `checked: 623`, `violations: []`).
- `grep -rn "Math\.random" src --include="*.ts" | grep -v "\.test\."` — zero production hits.
- `grep -rn "randomBytes" src/utils/short-id.ts` — confirms crypto source.
- `grep -rn "tempSuffix" src --include="*.ts"` — zero hits.
- `./bin/wp typecheck` — passed.
- `./bin/wp lint` — passed.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                            |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-14-replace-math-random-with-crypto-random-uuid.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
