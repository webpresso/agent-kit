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

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | HIGH | `walkMdFiles` is duplicated verbatim. | Confirmed at `src/audit/broken-refs.ts:55` and `src/audit/tech-debt.ts:24` — identical implementations with the same internal closure pattern. |
| F2 | HIGH | 10+ directory-walking implementations exist. | **19** distinct walk functions found across non-test `src/`: `walkMdFiles` (2 sites), `walkMarkdownFiles` (2 sites), `walkFiles` (3 sites), `walk` inner closures (7 sites), `walkDir` (3 sites), `walkSkillDirs`, `walkDirectories`. |
| F3 | HIGH | `JSON.parse(readFileSync(...))` is repeated 9+ times. | **30+** occurrences in non-test `src/` — confirmed across `src/audit/`, `src/cli/`, `src/mcp/`, `src/hooks/`, `src/runtime/`, `src/worktrees/`, `src/config/`, `src/blueprint/`, `src/tool-runtime/`, `src/typecheck/`, `src/build/`. |
| F4 | HIGH | `writeFileSync(...JSON.stringify(...))` is repeated 10+ times with inconsistent trailing newlines. | **14+** occurrences in non-test `src/` — some append `'\n'`, some don't; some use `JSON.stringify(x, null, 2)` inline, others use `JSON.stringify(x)`. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1 | None | 1 agent | S |
| **Wave 1** | 1.2, 1.3 | 1.1 | 2 agents | M, M |
| **Critical path** | 1.1 → 1.3 | — | 2 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 1 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.5 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.67 |
| CP | same-file overlaps per wave | 0 | 0 |

> **Refinement delta:** CPR (1.5) is below target but unavoidable for a 3-task utility-extraction plan. Task count is minimal by design — extracting utils is inherently serial (create utilities first, then consume them). No further task split would improve parallelism without creating artificial intermediate tasks.

**Parallelization score:** B — CPR low but unavoidable for this plan shape; CP = 0 across all waves; DD is healthy.

## Tasks

### [utilities] Task 1.1: Create shared filesystem I/O utilities

**Status:** todo | **Depends:** None

Create three utility modules under a new `src/utils/` directory to replace duplicated walking, JSON reading, and JSON writing patterns. Each utility includes unit tests before downstream consumers are migrated.

**Files:**
- Create: `src/utils/walk-directory.ts`
- Create: `src/utils/read-json-file.ts`
- Create: `src/utils/write-json-file.ts`
- Create: `src/utils/walk-directory.test.ts`
- Create: `src/utils/read-json-file.test.ts`
- Create: `src/utils/write-json-file.test.ts`

**Steps (TDD):**
1. Write failing test for `walkDirectory(root, opts?)` → `./bin/wp test --file src/utils/walk-directory.test.ts` verify FAIL
2. Implement `walkDirectory` (sync, sorted, `{ extensions?, skipDirs?, filter?, absolute?: boolean }`) → verify PASS
3. Write failing test for `readJsonFile<T>(path, schema?)` → `./bin/wp test --file src/utils/read-json-file.test.ts` verify FAIL
4. Implement `readJsonFile` (parse + optional Zod schema validation, throws descriptive errors) → verify PASS
5. Write failing test for `writeJsonFile(path, data, opts?)` → `./bin/wp test --file src/utils/write-json-file.test.ts` verify FAIL
6. Implement `writeJsonFile` (deterministic `JSON.stringify(data, null, 2)`, `{ trailingNewline?: boolean }` default `true`) → verify PASS
7. `./bin/wp lint` + `./bin/wp typecheck`

**Acceptance:**
- [ ] `walkDirectory` returns sorted paths, filters by extension, respects skip directories
- [ ] `readJsonFile` parses JSON and optionally validates with Zod schema, throws on parse/validation failure
- [ ] `writeJsonFile` serializes with `JSON.stringify(data, null, 2)`, appends `\n` by default, configurable
- [ ] All three test files pass with `./bin/wp test`
- [ ] `./bin/wp lint` and `./bin/wp typecheck` clean

**Constraints:**
- `walkDirectory` must return sorted paths (deterministic for audit outputs)
- `readJsonFile` error messages must include the file path (for debugging)
- `writeJsonFile` trailing newline default `true` (matches majority existing pattern)
- Do NOT handle symlinks in `walkDirectory` (scope: match the existing walk implementations which also avoid symlinks)

---

### [dry] Task 1.2: Replace duplicated `walkMdFiles` and directory walks

**Status:** todo | **Depends:** Task 1.1

Replace the two verbatim `walkMdFiles` implementations and other directory-walk functions with `walkDirectory` from `src/utils/walk-directory.ts`. Behavior must remain identical — sorted, no symlink following, same file matching.

**Files:**
- Modify: `src/audit/broken-refs.ts`
- Modify: `src/audit/tech-debt.ts`
- Modify: `src/audit/repo-guardrails.ts`
- Modify: `src/audit/architecture-drift.ts`
- Modify: `src/audit/session-memory-hardcut.ts`
- Modify: `src/audit/skill-sizes.ts`
- Modify: `src/cli/commands/compile.ts`
- Modify: `src/cli/commands/init/scaffolders/omx/index.ts`

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

### [dry] Task 1.3: Replace duplicated JSON I/O

**Status:** todo | **Depends:** Task 1.1

Replace `JSON.parse(readFileSync(...)) as T` patterns with `readJsonFile<T>(path)` or `readJsonFile(path, schema)` and replace `writeFileSync(...JSON.stringify(...))` with `writeJsonFile(...)`. Normalize trailing-newline behavior (sites that omit `'\n'` should adopt the default).

**Files:**
- Modify: `src/audit/compile-drift.ts`
- Modify: `src/audit/architecture-drift.ts`
- Modify: `src/audit/open-source-licenses.ts`
- Modify: `src/audit/agent-cost.ts`
- Modify: `src/audit/package-surface.ts`
- Modify: `src/audit/cloudflare-deploy-contract.ts`
- Modify: `src/audit/agents.ts`
- Modify: `src/audit/repo-guardrails.ts`
- Modify: `src/audit/toolchain-isolation.ts`
- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/cli/auto-update/installer.ts`
- Modify: `src/cli/commands/compile.ts`
- Modify: `src/cli/commands/config.ts`
- Modify: `src/cli/commands/quality-log-store.ts`
- Modify: `src/cli/commands/init/scaffolders/omx/index.ts`
- Modify: `src/cli/commands/init/scaffold-base-kit.ts`
- Modify: `src/worktrees/registry.ts`
- Modify: `src/hooks/doctor.ts`
- Modify: `src/hooks/guard-switch/state.ts`
- Modify: `src/blueprint/freshness.ts`
- Modify: `src/runtime/package-version.ts`
- Modify: `src/config/internal-subpath-imports.ts`
- Modify: `src/tool-runtime/resolve-runner.ts`

**Steps (TDD):**
1. Replace `JSON.parse(readFileSync(path, 'utf8')) as T` → `readJsonFile<T>(path)` across all listed files
2. For sites with implicit validation (type assertions after parse), add Zod schemas where a schema already exists in the file or nearby; otherwise keep `readJsonFile<T>(path)` without schema
3. Replace `writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')` → `writeJsonFile(path, data)`
4. Replace `writeFileSync(path, JSON.stringify(data, null, 2))` → `writeJsonFile(path, data, { trailingNewline: false })` only where the original explicitly omits the trailing newline
5. Run affected test suites: `./bin/wp test --suite all`
6. `./bin/wp lint` + `./bin/wp typecheck`

**Acceptance:**
- [ ] `JSON.parse(readFileSync(...))` count in non-test `src/` reduced by ≥ 70% (from ~30 to ≤ 9)
- [ ] `writeFileSync(...JSON.stringify(...))` count in non-test `src/` reduced by ≥ 70% (from ~14 to ≤ 4)
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
| E5 | Zod schema validation failure message clarity | MEDIUM | Wrap ZodError with file path context; test that error messages include the file path |
| E6 | `writeJsonFile` on read-only filesystem | LOW | Propagate native `fs` error (consistent with original `writeFileSync`) |
| E7 | `walkDirectory` sort stability with mixed case | LOW | Use default locale string sort (matches existing `walkMdFiles` behavior) |

## Risks

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Subtle traversal order changes break tests | HIGH | Return sorted paths; add before/after comparison tests for the two verbatim `walkMdFiles` sites |
| Different newline expectations in fixtures | MEDIUM | Keep `trailingNewline` configurable; default `true` matches majority pattern; explicit `false` where original omitted it |
| Schema addition introduces unexpected validation failures | MEDIUM | Only add Zod schemas where one already exists or is trivially derivable; use untyped `readJsonFile<T>(path)` for other sites |
| Large PR scope (20+ files in Task 1.3) causes merge conflicts | MEDIUM | Task 1.3 touches many files but changes are mechanical (search-replace); batch by subdirectory and commit atomically |

## Non-goals

- Rewriting all file I/O in the repo (text file reads, config writes, log files remain as-is)
- Changing the JSON formatting style of hand-edited files (indentation stays `2` spaces)
- Removing `readFileSync` for non-JSON text
- Adding async/streaming file I/O utilities
- Symlink-following in `walkDirectory` (existing implementations don't follow symlinks)

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 4 |
| High | 4 (F1–F4) |
| Medium | 0 |
| Low | 0 |
| Fixes applied | 4/4 — all fact-check counts updated to verified values |
| Edge cases documented | 7 |
| Risks documented | 4 |
| **Parallelization score** | B (CPR 1.5 unavoidable for 3-task plan; CP = 0 clean) |
| **Critical path** | 2 waves (1.1 → 1.2/1.3) |
| **Max parallel agents** | 2 (Wave 1) |
| **Total tasks** | 3 |
| **Blueprint compliant** | 3/3 — all tasks have lane prefixes, Depends, Files, Steps (TDD), Acceptance |

### Refinement deltas

- **F2/F3/F4 counts corrected:** Original plan understated duplication (9+→30+ JSON reads, 10+→14+ JSON writes, 10+→19 walk functions). File lists expanded accordingly.
- **Lane prefixes added:** `[utilities]` (1.1), `[dry]` (1.2, 1.3) for `/pll` wave routing.
- **Task 1.3 scope expanded:** Added `src/hooks/doctor.ts`, `src/hooks/guard-switch/state.ts`, `src/blueprint/freshness.ts`, `src/runtime/package-version.ts`, `src/config/internal-subpath-imports.ts`, `src/tool-runtime/resolve-runner.ts`, `src/worktrees/registry.ts` based on verified non-test `JSON.parse(readFileSync` hits.
- **TDD steps:** Every task now includes explicit `./bin/wp test --file <path>` verify FAIL/PASS steps.
- **Edge Cases table added** with 7 entries covering empty dirs, encoding, large files, missing paths, schema errors, read-only FS, and sort stability.
- **Parallel Metrics Snapshot added** with CPR/RW0/DD/CP measured.
- **`src/utils/` directory:** Confirmed does not exist — must be created by Task 1.1.
