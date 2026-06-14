---
type: blueprint
title: Shared filesystem I/O utilities
owner: ozby
status: planned
complexity: M
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/3 tasks done, 0 blocked)'
depends_on: []
cross_repo_depends_on: []
tags:
  - dry
  - utilities
  - filesystem
  - json
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Shared filesystem I/O utilities

**Goal:** Eliminate duplicated directory walking and JSON file read/write patterns across `src/audit/`, `src/cli/`, `src/blueprint/`, and `src/hooks/`.

## Product wedge anchor

- **Stage outcome:** Determinism + reliability of the `wp audit` surface (per `engineering-principles.md` DRY filter — remove real duplication after the second concrete use). The two verbatim `walkMdFiles` copies and the 14 inconsistent JSON writers are the direct cause of non-deterministic audit ordering and trailing-newline churn that the audit family emits.
- **Consuming surface:** `wp audit` CLI verbs (`wp audit broken-refs`, `wp audit tech-debt`, `wp audit architecture-drift`, `wp audit repo-guardrails`) and the `wp_audit` MCP tool — every one of them walks directories and serializes JSON through the deduplicated helpers.
- **New user-visible capability:** Audit outputs and the JSON state files those audits write become byte-deterministic (sorted traversal, single trailing-newline convention) across machines, so `wp audit` diffs stop flapping on traversal order and newline style.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | HIGH | `walkMdFiles` is duplicated verbatim. | Confirmed at `src/audit/broken-refs.ts:55` and `src/audit/tech-debt.ts:24` — identical implementations with the same internal closure pattern. |
| F2 | HIGH | 10+ directory-walking implementations exist. | **19** distinct walk functions found across non-test `src/`: `walkMdFiles` (2 sites), `walkMarkdownFiles` (2 sites), `walkFiles` (3 sites), `walk` inner closures (7 sites), `walkDir` (3 sites), `walkSkillDirs`, `walkDirectories`. |
| F3 | HIGH | `JSON.parse(readFileSync(...))` is repeated 9+ times. | **49** occurrences in non-test `src/` (live count: `rg 'JSON\.parse\(\s*readFileSync' src --glob '!*.test.ts' \| wc -l` = 49) — confirmed across `src/audit/`, `src/cli/`, `src/mcp/`, `src/hooks/`, `src/runtime/`, `src/worktrees/`, `src/config/`, `src/blueprint/`, `src/tool-runtime/`, `src/typecheck/`, `src/build/`. **The original "30+" estimate understated the baseline; the corrected count is 49.** |
| F4 | HIGH | `writeFileSync(...JSON.stringify(...))` is repeated 10+ times with inconsistent trailing newlines. | **14+** occurrences in non-test `src/` — some append `'\n'`, some don't; some use `JSON.stringify(x, null, 2)` inline, others use `JSON.stringify(x)`. |
| F5 | INFO | A shared `readJsonFile<T>` does not exist yet. | **False — a local `readJsonFile<T>(path): T` already exists at `src/audit/agents.ts:411`** (`JSON.parse(readFileSync(path, 'utf8')) as T`), already consumed at `agents.ts:35` and `agents.ts:241`. `src/wp-extension/index.ts:55-98` also has a `readJsonFile` injection seam. Task 1.1 **promotes** the existing `agents.ts` helper into the shared module rather than reinventing it; `agents.ts` becomes a Task 1.3 migration site that drops its local copy. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1 | None | 1 agent | S |
| **Wave 1** | 1.2, 1.3 | 1.1 | 1 agent (serialized — same-file overlap) | M, M |
| **Critical path** | 1.1 → 1.3 | — | 2 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 1 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.5 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.67 |
| CP | same-file overlaps per wave | 0 | **3 (Wave 1)** |

> **Refinement delta:** CPR (1.5) is below target but unavoidable for a 3-task utility-extraction plan. Task count is minimal by design — extracting utils is inherently serial (create utilities first, then consume them). **CP is NOT zero: Tasks 1.2 and 1.3 both modify `src/audit/repo-guardrails.ts`, `src/audit/architecture-drift.ts`, and `src/cli/commands/init/scaffolders/omx/index.ts` (3 same-file overlaps).** Because of this overlap, Wave 1 must be run by a single agent (1.2 then 1.3) or the two tasks must coordinate edits to those three shared files; they cannot run as two independent parallel agents without a merge conflict.

**Parallelization score:** C — CPR low and unavoidable for this plan shape; **Wave 1 has 3 same-file overlaps (CP = 3), so 1.2/1.3 cannot run as independent parallel agents**; DD is healthy.

## Tasks

#### [utilities] Task 1.1: Create shared filesystem I/O utilities (promoting the existing `readJsonFile`)

**Status:** todo
**Depends:** None

Create shared utility modules under a new `src/utils/` directory to replace duplicated walking, JSON reading, and JSON writing patterns. **`readJsonFile<T>` is not greenfield — promote the existing local helper at `src/audit/agents.ts:411` (`JSON.parse(readFileSync(path, 'utf8')) as T`) into the shared module verbatim, then list `agents.ts` as a Task 1.3 migration site that drops its local copy.** Each utility includes unit tests before downstream consumers are migrated.

**Files:**
- Create: `src/utils/walk-directory.ts`
- Create: `src/utils/read-json-file.ts` (promote from `src/audit/agents.ts:411`)
- Create: `src/utils/write-json-file.ts`
- Create: `src/utils/walk-directory.test.ts`
- Create: `src/utils/read-json-file.test.ts`
- Create: `src/utils/write-json-file.test.ts`

**Steps (TDD):**
1. Write failing test for `walkDirectory(root, opts?)` → `./bin/wp test --file src/utils/walk-directory.test.ts` verify FAIL
2. Implement `walkDirectory` (sync, sorted, `{ extensions?, skipDirs?, filter?, absolute?: boolean }`) → verify PASS
3. Write failing test for `readJsonFile<T>(path)` → `./bin/wp test --file src/utils/read-json-file.test.ts` verify FAIL
4. Implement `readJsonFile<T>(path): T` by promoting the existing `src/audit/agents.ts:411` body verbatim (`JSON.parse(readFileSync(path, 'utf8')) as T`), adding the file path to thrown error messages → verify PASS
5. Write failing test for `writeJsonFile(path, data, opts?)` → `./bin/wp test --file src/utils/write-json-file.test.ts` verify FAIL
6. Implement `writeJsonFile` (deterministic `JSON.stringify(data, null, 2)`, `{ trailingNewline?: boolean }` default `true`) → verify PASS
7. `./bin/wp lint` + `./bin/wp typecheck`

**Acceptance:**
- [ ] `walkDirectory` returns sorted paths, filters by extension, respects skip directories
- [ ] `readJsonFile` parses JSON and throws on parse failure with the file path in the message; signature matches the promoted `agents.ts` helper (`<T>(path): T`)
- [ ] `writeJsonFile` serializes with `JSON.stringify(data, null, 2)`, appends `\n` by default, configurable
- [ ] All three test files pass with `./bin/wp test`
- [ ] `./bin/wp lint` and `./bin/wp typecheck` clean

**Constraints:**
- `walkDirectory` must return sorted paths (deterministic for audit outputs)
- `readJsonFile` error messages must include the file path (for debugging)
- `readJsonFile` is a **throwing** helper — sites that swallow read/parse errors and return `null`/a default (e.g. `src/blueprint/freshness.ts`) MUST NOT migrate to it (see Edge Case E8 and Task 1.3)
- **No Zod `schema?` parameter (YAGNI):** no listed migration site validates with Zod today, and Zod is used nowhere in `src/`. `readJsonFile<T>(path)` is type-assertion-only, matching the promoted `agents.ts` helper. Adding schema validation is out of scope.
- `writeJsonFile` trailing newline default `true` (matches majority existing pattern)
- Do NOT handle symlinks in `walkDirectory` (scope: match the existing walk implementations which also avoid symlinks)

---

#### [dry] Task 1.2: Replace duplicated `walkMdFiles` and directory walks

**Status:** todo
**Depends:** Task 1.1

Replace the two verbatim `walkMdFiles` implementations and other directory-walk functions with `walkDirectory` from `src/utils/walk-directory.ts`. Behavior must remain identical — sorted, no symlink following, same file matching.

**Files:**
- Modify: `src/audit/broken-refs.ts`
- Modify: `src/audit/tech-debt.ts`
- Modify: `src/audit/repo-guardrails.ts` *(also modified by Task 1.3 — coordinate edits)*
- Modify: `src/audit/architecture-drift.ts` *(also modified by Task 1.3 — coordinate edits)*
- Modify: `src/audit/session-memory-hardcut.ts`
- Modify: `src/audit/skill-sizes.ts`
- Modify: `src/cli/commands/compile.ts`
- Modify: `src/cli/commands/init/scaffolders/omx/index.ts` *(also modified by Task 1.3 — coordinate edits)*

**Steps (TDD):**
1. Replace `walkMdFiles(dir)` with `walkDirectory(dir, { extensions: ['.md'] })` in `broken-refs.ts` and `tech-debt.ts`
2. Replace `walkMarkdownFiles(root)` in `repo-guardrails.ts` with `walkDirectory(root, { extensions: ['.md'] })`
3. Replace `walkFiles(root)` in `architecture-drift.ts` and `session-memory-hardcut.ts` with `walkDirectory(root)`
4. Replace `walkSkillDirs(dir)` in `skill-sizes.ts` with `walkDirectory(dir, { filter: ... })`
5. Replace inner `walk` closures in `compile.ts` with `walkDirectory`
6. Replace `walkDirectories(root)` in `omx/index.ts` with `walkDirectory(root, { filter: isDir })`
7. Run regression tests: `./bin/wp test --file src/audit/broken-refs.test.ts --file src/audit/tech-debt.test.ts`
8. `./bin/wp lint` + `./bin/wp typecheck`

**Acceptance:**
- [ ] No `function walkMdFiles` remains in non-test `src/`
- [ ] All replaced walk functions produce identical output (before/after comparison via existing tests)
- [ ] `./bin/wp test --file src/audit/broken-refs.test.ts --file src/audit/tech-debt.test.ts` passes
- [ ] `./bin/wp lint` and `./bin/wp typecheck` clean
- [ ] Audit commands produce identical results (spot-check 2-3 audit kinds)

---

#### [dry] Task 1.3: Replace duplicated JSON I/O

**Status:** todo
**Depends:** Task 1.1

Replace `JSON.parse(readFileSync(...)) as T` patterns with `readJsonFile<T>(path)` and replace `writeFileSync(...JSON.stringify(...))` with `writeJsonFile(...)`. Normalize trailing-newline behavior (sites that omit `'\n'` should adopt the default). **Drop `src/audit/agents.ts`'s local `readJsonFile` and re-import the promoted shared helper.** **Audit every site for swallow-and-default read semantics before mechanical replace — do NOT migrate sites that return `null`/a default on read or parse failure to the throwing helper (see Edge Case E8).**

**Files:**
- Modify: `src/audit/agents.ts` *(drop the local `readJsonFile<T>` copy at line 411, re-import from `src/utils/read-json-file.ts`)*
- Modify: `src/audit/compile-drift.ts`
- Modify: `src/audit/architecture-drift.ts` *(also modified by Task 1.2 — coordinate edits)*
- Modify: `src/audit/open-source-licenses.ts`
- Modify: `src/audit/agent-cost.ts`
- Modify: `src/audit/package-surface.ts`
- Modify: `src/audit/cloudflare-deploy-contract.ts`
- Modify: `src/audit/repo-guardrails.ts` *(also modified by Task 1.2 — coordinate edits)*
- Modify: `src/audit/toolchain-isolation.ts`
- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/cli/auto-update/installer.ts`
- Modify: `src/cli/commands/compile.ts`
- Modify: `src/cli/commands/config.ts`
- Modify: `src/cli/commands/quality-log-store.ts`
- Modify: `src/cli/commands/init/scaffolders/omx/index.ts` *(also modified by Task 1.2 — coordinate edits)*
- Modify: `src/cli/commands/init/scaffold-base-kit.ts`
- Modify: `src/worktrees/registry.ts`
- Modify: `src/hooks/doctor.ts`
- Modify: `src/hooks/guard-switch/state.ts`
- Modify: `src/runtime/package-version.ts`
- Modify: `src/config/internal-subpath-imports.ts`
- Modify: `src/tool-runtime/resolve-runner.ts`

> **Excluded from JSON-read migration:** `src/blueprint/freshness.ts` is intentionally NOT in this list. It has **zero** single-call `JSON.parse(readFileSync)` sites (`rg` count = 0) — it deliberately splits the read (`freshness.ts:108`, returns `null` on read failure) from the parse (`freshness.ts:114`, returns `null` on parse failure) as graceful degradation. Swapping in the throwing `readJsonFile` would change behavior from "return null" to "throw" — a silent regression. See Edge Case E8.

**Steps (TDD):**
1. **Pre-flight:** for every listed file, confirm the read is a single-call `JSON.parse(readFileSync(path, 'utf8')) as T` whose failure currently propagates (throws). Skip any site that catches and returns `null`/a default (Edge Case E8).
2. In `src/audit/agents.ts`, delete the local `readJsonFile<T>` definition (line 411) and re-import the shared helper from `src/utils/read-json-file.ts`; keep `agents.ts:35` and `agents.ts:241` call sites unchanged.
3. Replace `JSON.parse(readFileSync(path, 'utf8')) as T` → `readJsonFile<T>(path)` across the remaining listed files (throwing-only sites)
4. Replace `writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')` → `writeJsonFile(path, data)`
5. Replace `writeFileSync(path, JSON.stringify(data, null, 2))` → `writeJsonFile(path, data, { trailingNewline: false })` only where the original explicitly omits the trailing newline
6. Run affected test suites: `./bin/wp test --suite all`
7. `./bin/wp lint` + `./bin/wp typecheck`

**Acceptance:**
- [ ] `JSON.parse(readFileSync(...))` count in non-test `src/` reduced by ≥ 70% (measured pre/post delta: from **49** down to **≤ 15**)
- [ ] `writeFileSync(...JSON.stringify(...))` count in non-test `src/` reduced by ≥ 70% (from ~14 to ≤ 4)
- [ ] `src/audit/agents.ts` no longer defines a local `readJsonFile`; it imports the shared one
- [ ] No swallow-and-return-null read site (e.g. `freshness.ts`) was migrated to the throwing helper
- [ ] All affected tests pass (`./bin/wp test --suite all`)
- [ ] `./bin/wp lint` and `./bin/wp typecheck` clean
- [ ] JSON round-trip behavior is identical (write → read produces same data)
- [ ] Files that previously omitted trailing newline continue to omit it (`trailingNewline: false` sites)

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Unit tests (utils) | `./bin/wp test --file src/utils/walk-directory.test.ts --file src/utils/read-json-file.test.ts --file src/utils/write-json-file.test.ts` | Pass |
| Regression tests (walk) | `./bin/wp test --file src/audit/broken-refs.test.ts --file src/audit/tech-debt.test.ts` | Pass |
| Full test suite | `./bin/wp test --suite all` | Pass |
| Type safety | `./bin/wp typecheck` | Zero errors |
| Lint | `./bin/wp lint` | Zero violations |

## Edge Cases

| ID | Edge Case | Severity | Mitigation |
| -- | --------- | -------- | ---------- |
| E1 | Empty directory passed to `walkDirectory` | LOW | Return empty array (natural behavior of `readdirSync`) |
| E2 | JSON file with BOM or non-UTF-8 encoding | MEDIUM | `readFileSync` with `'utf8'` already handles UTF-8 BOM; non-UTF-8 is out of scope |
| E3 | Very large JSON files (memory pressure) | LOW | Out of scope — existing pattern already loads full file; streaming JSON is a separate concern |
| E4 | `walkDirectory` on missing/non-directory path | MEDIUM | Throw `ENOENT` / `ENOTDIR` with path in error message |
| E5 | `readJsonFile` parse-failure message clarity | MEDIUM | Wrap parse error with file path context; test that error messages include the file path |
| E6 | `writeJsonFile` on read-only filesystem | LOW | Propagate native `fs` error (consistent with original `writeFileSync`) |
| E7 | `walkDirectory` sort stability with mixed case | LOW | Use default locale string sort (matches existing `walkMdFiles` behavior) |
| E8 | Swallow-and-return-null read sites (e.g. `src/blueprint/freshness.ts:108/114`) | HIGH | These sites return `null`/a default on read or parse failure. The shared `readJsonFile` **throws**. Migrating them would change behavior from "return null" to "throw" — a silent regression. **Do NOT migrate them**; keep their split read/parse + null-return logic. Audit every Task 1.3 site for this pattern before mechanical replace. |

## Risks

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Subtle traversal order changes break tests | HIGH | Return sorted paths; add before/after comparison tests for the two verbatim `walkMdFiles` sites |
| Different newline expectations in fixtures | MEDIUM | Keep `trailingNewline` configurable; default `true` matches majority pattern; explicit `false` where original omitted it |
| Migrating a swallow-and-return-null read to the throwing helper introduces a silent behavior regression | HIGH | Exclude `freshness.ts` from the JSON-read migration; pre-flight every Task 1.3 site for catch-and-default semantics (Edge Case E8) before replacing |
| Wave-1 same-file overlap (1.2 and 1.3 both edit `repo-guardrails.ts`, `architecture-drift.ts`, `omx/index.ts`) | MEDIUM | Run Wave 1 with a single agent (1.2 then 1.3), or coordinate the three shared-file edits; do NOT dispatch 1.2/1.3 as independent parallel agents |
| Large PR scope (20+ files in Task 1.3) causes merge conflicts | MEDIUM | Task 1.3 touches many files but changes are mechanical (search-replace); batch by subdirectory and commit atomically |

## Non-goals

- Rewriting all file I/O in the repo (text file reads, config writes, log files remain as-is)
- Changing the JSON formatting style of hand-edited files (indentation stays `2` spaces)
- Removing `readFileSync` for non-JSON text
- Adding async/streaming file I/O utilities
- Adding Zod (or any) schema-validation parameter to `readJsonFile` (no site needs it; Zod is unused in `src/`)
- Migrating swallow-and-return-null read sites (`freshness.ts`) to the throwing helper
- Symlink-following in `walkDirectory` (existing implementations don't follow symlinks)

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 5 |
| High | 4 (F1–F4) |
| Medium | 0 |
| Low | 0 |
| Info | 1 (F5 — existing `readJsonFile` to promote) |
| Fixes applied | 5/5 — fact-check counts corrected (F3 49 not "30+"), existing `readJsonFile` promoted, `freshness.ts` excluded, Zod param dropped, CP corrected |
| Edge cases documented | 8 |
| Risks documented | 5 |
| **Parallelization score** | C (CPR 1.5 unavoidable; CP = 3 — Wave-1 same-file overlaps force serialization) |
| **Critical path** | 2 waves (1.1 → 1.2/1.3) |
| **Max parallel agents** | 1 in Wave 1 (same-file overlap blocks parallel 1.2/1.3) |
| **Total tasks** | 3 |
| **Blueprint compliant** | 3/3 — all tasks have lane prefixes, Status (own line), Depends, Files, Steps (TDD), Acceptance |

### Refinement deltas

- **Product wedge anchor added:** names the `wp audit` CLI verbs / `wp_audit` MCP tool as the consuming surface (audit determinism is the wedge), satisfying `blueprint-scoping.md`.
- **F3 baseline corrected (HIGH/accuracy):** original "30+" understated the live count of **49** (`rg 'JSON\.parse\(\s*readFileSync' src --glob '!*.test.ts' | wc -l`). Task 1.3 acceptance rewritten from "from ~30 to ≤ 9" to a measured pre/post delta "**from 49 to ≤ 15**" (≥70% reduction lands at ~15, not 9).
- **Existing `readJsonFile` promoted (HIGH/elegance):** F5 added; Task 1.1 now promotes the local `src/audit/agents.ts:411` helper instead of presenting `readJsonFile` as greenfield; `agents.ts` added to Task 1.3 as a migration site that drops its local copy.
- **`freshness.ts` removed from JSON-read migration (HIGH/architecture):** it has zero single-call `JSON.parse(readFileSync)` sites and deliberately returns `null` on read/parse failure (`freshness.ts:108/114`). Migrating to the throwing helper would be a silent regression. Added Edge Case E8 + a Risk row + a pre-flight audit step + a Non-goal.
- **Zod `schema?` parameter dropped (YAGNI):** no listed site uses Zod and Zod is unused across `src/`; `readJsonFile<T>(path)` is type-assertion-only. Removed from the API, Steps, Acceptance, E5, and Risks; added as a Non-goal.
- **CP=0 claim corrected:** Wave-1 tasks 1.2 and 1.3 both edit `src/audit/repo-guardrails.ts`, `src/audit/architecture-drift.ts`, and `src/cli/commands/init/scaffolders/omx/index.ts` → CP = 3, not 0. Parallelization score downgraded B → C; max parallel agents in Wave 1 corrected to 1; overlapping files annotated in both task Files lists and the Quick Reference.
- **F2/F4 counts retained:** original plan understated duplication (10+→19 walk functions, 10+→14+ JSON writes). File lists already reflect the verified hits.
- **Lane prefixes retained:** `[utilities]` (1.1), `[dry]` (1.2, 1.3) for `/pll` wave routing.
- **Status lines split:** every `**Status:**` is now on its own line, with `**Depends:**` on the following line.
- **TDD steps:** every task includes explicit `./bin/wp test --file <path>` verify FAIL/PASS steps.
- **`src/utils/` directory:** Confirmed does not exist — must be created by Task 1.1.
