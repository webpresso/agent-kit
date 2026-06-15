---
type: blueprint
title: Shared filesystem I/O utilities
owner: ozby
status: parked
complexity: M
created: '2026-06-14'
last_updated: '2026-06-15'
progress: "Implemented in PR #139; parked for legal lifecycle transition from planned pending finalization"
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

## Implementation Update (2026-06-15)

Implemented in PR #139 on branch `work/ultragoal-9-blueprints-20260614221933`.
Task status and acceptance checkboxes below were reconciled from the landed code paths and focused verification evidence in this PR. The file is parked because CI enforces the legal first transition from `planned`; finalization can move parked/resumed work through the lifecycle after merge.


**Goal:** Eliminate duplicated directory walking and JSON file read/write patterns across `src/audit/`, `src/cli/`, `src/blueprint/`, and `src/hooks/` without changing graceful-degradation semantics at call sites that intentionally swallow read/parse failures.

## Product wedge anchor

- **Stage outcome:** Determinism + reliability of the `wp audit` surface (per `engineering-principles.md` DRY filter — remove real duplication after the second concrete use). The two verbatim `walkMdFiles` copies and inconsistent JSON writers are a direct source of traversal-order and trailing-newline churn in audit outputs.
- **Consuming surface:** `wp audit` CLI verbs (`wp audit broken-refs`, `wp audit tech-debt`, `wp audit architecture-drift`, `wp audit repo-guardrails`) and the `wp_audit` MCP tool — every one of them walks directories or serializes JSON through helpers this plan consolidates.
- **New user-visible capability:** Audit outputs and JSON state files written by migrated sites become byte-deterministic (sorted traversal, single trailing-newline convention) across machines, so `wp audit` diffs stop flapping on traversal order and newline style.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality | Blueprint Fix |
| -- | -------- | ----- | ---------------- | ------------- |
| F1 | HIGH | `walkMdFiles` is duplicated verbatim. | Confirmed at `src/audit/broken-refs.ts:55` and `src/audit/tech-debt.ts:24` — same recursive closure pattern. | Task 1.2 replaces both with `walkDirectory(dir, { extensions: ['.md'] })` and keeps targeted regression tests. |
| F2 | HIGH | 10+ directory-walking implementations exist. | Confirmed: current grep finds 20+ walk-like functions in non-test `src/` (`walkMdFiles`, `walkMarkdownFiles`, `walkFiles`, inner `walk`, `walkDir`, `walkDirectories`, `walkSkillDirs`, plus callback/AST variants). Not all are safe utility migrations. | Task 1.2 migrates only straightforward filesystem traversal sites; callback visitors, violation accumulators, and AST walks stay out of scope. |
| F3 | HIGH | `JSON.parse(readFileSync(...))` is repeated 9+ times. | Confirmed live count: `rg 'JSON\.parse\(\s*readFileSync' src --glob '!*.test.ts' \| wc -l` = **47**. | Tasks 1.3, 1.4, and 1.5 split the migration by non-overlapping file clusters and target a ≥70% reduction to **≤14** remaining single-call sites. |
| F4 | HIGH | `writeFileSync(...JSON.stringify(...))` is repeated 10+ times with inconsistent trailing newlines. | Confirmed live rough count: direct non-test `src/` `writeFileSync` + `JSON.stringify` grep = **15**. Formats vary between no newline, `+ '\n'`, template newline, and compact JSON. | `writeJsonFile` defaults to `JSON.stringify(data, null, 2) + '\n'`; callers must opt out with `trailingNewline: false` or `indent: 0` where compact/no-newline output is intentional. |
| F5 | INFO | A shared `readJsonFile<T>` does not exist yet. | False — a local `readJsonFile<T>(path): T` exists at `src/audit/agents.ts:411`, consumed at `agents.ts:35` and `agents.ts:241`. `src/wp-extension/index.ts` also has an injected local seam. | Task 1.1 promotes the `agents.ts` helper into `src/utils/read-json-file.ts`; Task 1.3 removes the local copy. |
| F6 | MEDIUM | Zod is unused in `src/`, so schema validation is unnecessary. | Corrected: Zod is used in `src/blueprint/aggregate.ts`, `src/blueprint/tracked-document/schema.ts`, `src/e2e/config.ts`, `src/runners/types.ts`, and `src/symlinker/overlay-loader.ts`. However, the listed `JSON.parse(readFileSync(...))` migration sites do not currently validate through Zod. | Keep `readJsonFile<T>(path)` type-assertion-only for KISS/YAGNI; schema validation is a future helper if a migrated site already validates. |
| F7 | HIGH | All JSON read sites can migrate mechanically to a throwing helper. | False for graceful-degradation readers. `src/blueprint/freshness.ts:108/114` deliberately returns `null` on read/parse failure. | Exclude graceful-degradation reads from `readJsonFile`; migrate `freshness.ts` write-only through `writeJsonFile` in Task 1.4. |

## Cross-plan alignment

| Related blueprint | Relationship | Required coordination |
| ----------------- | ------------ | --------------------- |
| `blueprints/planned/2026-06-14-add-atomic-file-write-helper.md` | Downstream dependency on the `writeJsonFile` helper created here. It expects state-bearing writes (`freshness.ts`, `blueprint-server.ts`, `config.ts`, `guard-switch/state.ts`, installer writes) to be routed through the shared helper once, then upgraded with an `atomic` option downstream. | This blueprint now includes `src/blueprint/freshness.ts` as **write-only** migration and keeps state-bearing write sites in one JSON migration sweep. Do not add atomic behavior here; leave that to the downstream blueprint to avoid scope creep. |
| `blueprints/planned/2026-06-14-audit-dynamic-regexp-construction.md` | Both plans touch `src/audit/architecture-drift.ts` and `src/audit/package-surface.ts`. | If both execute concurrently, serialize same-file tasks or run this plan after the regexp helper consolidation to avoid merge conflicts. No semantic dependency. |
| `blueprints/planned/2026-06-14-fix-stream-resource-leaks.md` | Overlaps `src/cli/commands/compile.ts` and `src/cli/commands/quality-log-store.ts`; that blueprint verified the resource fixes and tests already exist. | Preserve `compile.test.ts` no-`openSync` coverage and `quality-log-store.test.ts` pre-`finalize()` stream-error coverage when migrating JSON/walk helpers in those files. Serialize implementation if either plan is actively editing the same files. |
| `blueprints/planned/2026-06-14-type-safe-sqlite-and-json-parsing.md` | Both plans touch `src/mcp/blueprint-server.ts`; this plan only owns eligible filesystem JSON I/O, while the type-safety plan owns SQLite row schemas/casts and unsafe JSON value validation. | Serialize `src/mcp/blueprint-server.ts` edits. During Task 1.4 pre-flight, skip any `blueprint-server.ts` site that is part of SQLite row validation or has no filesystem JSON read/write migration; do not mix helper migration with schema/cast refactors. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1 | None | 1 agent | S |
| **Wave 1** | 1.2, 1.3, 1.4 | 1.1 | 3 agents (no same-file overlap) | S, S, M |
| **Wave 2** | 1.5 | 1.2 | 1 agent | S |
| **Critical path** | 1.1 → 1.2 → 1.5 | — | 3 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 1 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.67 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.8 |
| CP | same-file overlaps per wave | 0 | 0 |

> **Refinement delta:** The previous 3-task shape falsely put same-file walk and JSON edits in one wave. The plan is now split into five file-cluster tasks: non-overlap audit JSON and CLI/MCP JSON work can run beside walk migration, while the three overlap files (`architecture-drift.ts`, `repo-guardrails.ts`, `compile.ts`/`omx/index.ts`) are serialized into Task 1.5. CPR remains below target because helper creation is a true first step, but CP is now zero for planned waves.

**Parallelization score:** C — small utility-extraction plan with a narrow true setup step, but no planned same-file conflicts remain.

## Tasks

#### [utilities] Task 1.1: Create shared filesystem I/O utilities (promoting the existing `readJsonFile`)

**Status:** done

**Depends:** None

Create shared utility modules under a new `src/utils/` directory to replace duplicated walking, JSON reading, and JSON writing patterns. `readJsonFile<T>` is not greenfield: promote the existing local helper at `src/audit/agents.ts:411` (`JSON.parse(readFileSync(path, 'utf8')) as T`) into the shared module, then improve its thrown error context with the file path. Keep the API deliberately small: no schema validation, no async variants, no symlink traversal, and no atomic write behavior in this blueprint.

**Files:**

- Create: `src/utils/walk-directory.ts`
- Create: `src/utils/read-json-file.ts`
- Create: `src/utils/write-json-file.ts`
- Create: `src/utils/walk-directory.test.ts`
- Create: `src/utils/read-json-file.test.ts`
- Create: `src/utils/write-json-file.test.ts`

**Steps (TDD):**

1. Write failing tests for sorted traversal, extension filtering, skipped directories, and missing root behavior in `src/utils/walk-directory.test.ts`.
2. Run: `./bin/wp test --file src/utils/walk-directory.test.ts` — verify FAIL.
3. Implement `walkDirectory(root, opts?)` as sync traversal returning sorted file paths with options `{ extensions?: string[]; skipDirs?: string[]; filter?: (entry) => boolean; absolute?: boolean }`.
4. Run: `./bin/wp test --file src/utils/walk-directory.test.ts` — verify PASS.
5. Write failing tests for successful parse and parse-failure path context in `src/utils/read-json-file.test.ts`.
6. Run: `./bin/wp test --file src/utils/read-json-file.test.ts` — verify FAIL.
7. Implement `readJsonFile<T>(path): T` by promoting the `src/audit/agents.ts:411` body and wrapping failures so messages include the file path.
8. Run: `./bin/wp test --file src/utils/read-json-file.test.ts` — verify PASS.
9. Write failing tests for default pretty newline output, compact output, and explicit no-newline output in `src/utils/write-json-file.test.ts`.
10. Run: `./bin/wp test --file src/utils/write-json-file.test.ts` — verify FAIL.
11. Implement `writeJsonFile(path, data, opts?)` with deterministic formatting: default `{ indent: 2, trailingNewline: true }`; support `indent: 0` for existing compact JSON sites; do not add `atomic` here.
12. Run: `./bin/wp test --file src/utils/write-json-file.test.ts` — verify PASS.
13. Run: `./bin/wp lint` and `./bin/wp typecheck`.

**Acceptance:**

- [x] `walkDirectory` returns sorted paths, filters by extension, respects skip directories, and does not follow symlinks.
- [x] `readJsonFile<T>(path): T` parses JSON and throws on read/parse failure with the file path in the message.
- [x] `writeJsonFile` serializes with `JSON.stringify(data, null, 2)` and appends `\n` by default.
- [x] `writeJsonFile` supports `trailingNewline: false` and `indent: 0` for sites that intentionally wrote compact or no-newline JSON.
- [x] Utility tests pass with `./bin/wp test --file src/utils/walk-directory.test.ts --file src/utils/read-json-file.test.ts --file src/utils/write-json-file.test.ts`.
- [x] `./bin/wp lint` and `./bin/wp typecheck` pass.

---

#### [dry] Task 1.2: Replace duplicated markdown and simple directory walks

**Status:** done

**Depends:** Task 1.1

Replace the two duplicated `walkMdFiles` implementations and selected simple filesystem walks with `walkDirectory` from `src/utils/walk-directory.ts`. This task deliberately excludes callback visitor walks, violation-accumulator walks, and AST node walks because they are not drop-in file-list traversals.

**Files:**

- Modify: `src/audit/broken-refs.ts`
- Modify: `src/audit/tech-debt.ts`
- Modify: `src/audit/repo-guardrails.ts` *(walk-only edits; JSON edits move to Task 1.5)*
- Modify: `src/audit/architecture-drift.ts` *(walk-only edits; JSON edits move to Task 1.5)*
- Modify: `src/audit/session-memory-hardcut.ts`
- Modify: `src/audit/skill-sizes.ts`
- Modify: `src/cli/commands/compile.ts` *(walk-only edits; JSON edits move to Task 1.5)*
- Modify: `src/cli/commands/init/scaffolders/omx/index.ts` *(walk-only edits; JSON edits move to Task 1.5)*

**Steps (TDD):**

1. Add/adjust regression assertions for deterministic sorted markdown traversal in `src/audit/broken-refs.test.ts` and `src/audit/tech-debt.test.ts`.
2. Run: `./bin/wp test --file src/audit/broken-refs.test.ts --file src/audit/tech-debt.test.ts` — verify FAIL if ordering assumptions are not already covered.
3. Replace `walkMdFiles(dir)` with `walkDirectory(dir, { extensions: ['.md'] })` in `broken-refs.ts` and `tech-debt.ts`.
4. Replace `walkMarkdownFiles(root)` in `repo-guardrails.ts` with `walkDirectory(root, { extensions: ['.md'] })`.
5. Replace simple `walkFiles(root)` usage in `architecture-drift.ts` and `session-memory-hardcut.ts` with `walkDirectory(root)` while preserving existing extension/filter logic.
6. Replace `walkSkillDirs(dir)` in `skill-sizes.ts` only if its directory-only behavior can be expressed without changing output; otherwise leave it and document the reason in a code comment.
7. Replace simple inner `walk` closures in `compile.ts` and `walkDirectories(root)` in `omx/index.ts` with `walkDirectory` only for file-list/directory-list behavior that matches the helper.
8. Run: `./bin/wp test --file src/audit/broken-refs.test.ts --file src/audit/tech-debt.test.ts` — verify PASS.
9. Run: `./bin/wp lint` and `./bin/wp typecheck`.

**Acceptance:**

- [x] No `function walkMdFiles` remains in non-test `src/`.
- [x] Migrated walk functions produce sorted deterministic output.
- [x] Callback visitor, violation-accumulator, and AST walks are not force-migrated.
- [x] `./bin/wp test --file src/audit/broken-refs.test.ts --file src/audit/tech-debt.test.ts` passes.
- [x] `./bin/wp lint` and `./bin/wp typecheck` pass.
- [x] Spot-check 2-3 affected audit commands for identical findings before/after, with ordering normalized.

---

#### [dry] Task 1.3: Replace audit JSON I/O in non-overlap files

**Status:** done

**Depends:** Task 1.1

Migrate audit-package JSON read/write sites that do not overlap Task 1.2's walk files. Remove `src/audit/agents.ts`'s local `readJsonFile<T>` copy and import the promoted shared helper. Before each replacement, confirm the existing read is a throwing single-call `JSON.parse(readFileSync(...))`; do not migrate catch-and-default readers.

**Files:**

- Modify: `src/audit/agents.ts`
- Modify: `src/audit/compile-drift.ts`
- Modify: `src/audit/open-source-licenses.ts`
- Modify: `src/audit/agent-cost.ts`
- Modify: `src/audit/package-surface.ts`
- Modify: `src/audit/cloudflare-deploy-contract.ts`
- Modify: `src/audit/toolchain-isolation.ts`

**Steps (TDD):**

1. Pre-flight each listed file: identify `JSON.parse(readFileSync(...))` and `writeFileSync(...JSON.stringify(...))` sites and confirm failures currently propagate.
2. Run relevant focused tests where present (for example `./bin/wp test --file src/audit/agents.test.ts --file src/audit/agent-cost.test.ts --file src/audit/package-surface.test.ts`) — record baseline.
3. In `src/audit/agents.ts`, delete the local `readJsonFile<T>` definition and import from `src/utils/read-json-file.ts`; keep call sites unchanged.
4. Replace throwing single-call JSON reads with `readJsonFile<T>(path)`.
5. Replace JSON writes with `writeJsonFile(path, data, options)` preserving compact/no-newline behavior via options where needed.
6. Run the focused tests from step 2 — verify PASS.
7. Run: `./bin/wp lint` and `./bin/wp typecheck`.

**Acceptance:**

- [x] `src/audit/agents.ts` no longer defines a local `readJsonFile`; it imports the shared one.
- [x] Listed audit files use shared JSON helpers for eligible throwing read/write sites.
- [x] No catch-and-default read site was migrated to the throwing helper.
- [x] Existing compact/no-newline JSON output remains compact/no-newline via explicit helper options.
- [x] Focused audit tests pass where present; otherwise affected audit commands are spot-checked.
- [x] `./bin/wp lint` and `./bin/wp typecheck` pass.

---

#### [dry] Task 1.4: Replace CLI/MCP/blueprint/hooks JSON I/O in non-overlap files

**Status:** done

**Depends:** Task 1.1

Migrate non-audit JSON I/O sites that do not overlap the walk migration. Include `src/blueprint/freshness.ts` as a write-only migration: keep its split read/parse `null` semantics intact, but route the sidecar write through `writeJsonFile`. Preserve file modes and compact JSON output where existing callers intentionally used them.

**Files:**

- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/cli/auto-update/installer.ts`
- Modify: `src/cli/commands/config.ts`
- Modify: `src/cli/commands/quality-log-store.ts`
- Modify: `src/cli/commands/init/scaffold-base-kit.ts`
- Modify: `src/worktrees/registry.ts`
- Modify: `src/hooks/doctor.ts`
- Modify: `src/hooks/guard-switch/state.ts`
- Modify: `src/runtime/package-version.ts`
- Modify: `src/config/internal-subpath-imports.ts`
- Modify: `src/tool-runtime/resolve-runner.ts`
- Modify: `src/blueprint/freshness.ts` *(write-only; keep read path returning `null` on failure)*

**Steps (TDD):**

1. Pre-flight each listed file: classify each JSON read as throwing vs graceful-degradation and each JSON write as pretty/newline, pretty/no-newline, compact, or mode-sensitive.
2. Run relevant focused tests where present (for example `./bin/wp test --file src/hooks/guard-switch/state.test.ts --file src/runtime/package-version.test.ts`) — record baseline; if no focused test exists, identify the smallest owning command smoke test.
3. Replace eligible throwing JSON reads with `readJsonFile<T>(path)`.
4. Replace JSON writes with `writeJsonFile(path, data, options)` while preserving compact output (`indent: 0`), no-newline output (`trailingNewline: false`), and file modes (for example config `0o600`).
5. In `src/blueprint/freshness.ts`, migrate only `recordProjectionMetadata`'s sidecar write; do not change `readProjectionMetadata`.
6. Run the focused tests or smoke tests from step 2 — verify PASS.
7. Run: `./bin/wp lint` and `./bin/wp typecheck`.

**Acceptance:**

- [x] `src/blueprint/freshness.ts` keeps `readProjectionMetadata(...): ProjectionMetadata | null` graceful behavior and migrates only the JSON sidecar write.
- [x] Mode-sensitive config writes preserve their mode (for example `0o600`).
- [x] Compact JSON writes in installer/guard state remain compact only where intentional.
- [x] State-bearing writes are routed through `writeJsonFile`, ready for the downstream atomic-write blueprint to extend.
- [x] Focused tests or command smoke tests pass for changed modules.
- [x] `./bin/wp lint` and `./bin/wp typecheck` pass.

---

#### [dry] Task 1.5: Replace JSON I/O in files that also had walk migration

**Status:** done

**Depends:** Task 1.2

After Task 1.2 lands, migrate JSON I/O in files that were already touched for directory walking. This serialization avoids same-file conflicts while still keeping the JSON changes small and mechanical.

**Files:**

- Modify: `src/audit/architecture-drift.ts`
- Modify: `src/audit/repo-guardrails.ts`
- Modify: `src/cli/commands/compile.ts`
- Modify: `src/cli/commands/init/scaffolders/omx/index.ts`

**Steps (TDD):**

1. Pre-flight each listed file after Task 1.2: confirm no local walk edits are pending and classify JSON read/write sites by throwing/default and formatting behavior.
2. Run relevant focused tests or command smoke tests for each file's owning surface — record baseline.
3. Replace eligible throwing JSON reads with `readJsonFile<T>(path)`.
4. Replace JSON writes with `writeJsonFile(path, data, options)` preserving compact/no-newline behavior.
5. Run the focused tests or smoke tests from step 2 — verify PASS.
6. Run: `./bin/wp lint` and `./bin/wp typecheck`.

**Acceptance:**

- [x] `architecture-drift.ts`, `repo-guardrails.ts`, `compile.ts`, and `omx/index.ts` use shared JSON helpers for eligible sites.
- [x] No same-file conflict remains with Task 1.2 because this task depends on it.
- [x] Output formatting and newline behavior are preserved or intentionally normalized with tests/spot checks.
- [x] Focused tests or command smoke tests pass for changed modules.
- [x] `./bin/wp lint` and `./bin/wp typecheck` pass.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Unit tests (utils) | `./bin/wp test --file src/utils/walk-directory.test.ts --file src/utils/read-json-file.test.ts --file src/utils/write-json-file.test.ts` | Pass |
| Regression tests (walk) | `./bin/wp test --file src/audit/broken-refs.test.ts --file src/audit/tech-debt.test.ts` | Pass |
| JSON migration count | `rg 'JSON\.parse\(\s*readFileSync' src --glob '!*.test.ts' \| wc -l` and direct `writeFileSync`+`JSON.stringify` grep | Record the measured before/after eligible-site delta. Target ≥70% reduction of eligible throwing single-call reads/writes; if graceful-degradation or non-filesystem sites are excluded, document the residual count instead of forcing a hard ≤14/≤4 threshold. |
| Full test suite | `./bin/wp test --suite all` | Pass |
| Type safety | `./bin/wp typecheck` | Zero errors |
| Lint | `./bin/wp lint` | Zero violations |
| Blueprint lifecycle | `./bin/wp audit blueprint-lifecycle` | This blueprint remains lifecycle-valid |

## Edge Cases

| ID | Edge Case | Severity | Mitigation |
| -- | --------- | -------- | ---------- |
| E1 | Empty directory passed to `walkDirectory` | LOW | Return empty array (natural behavior of `readdirSync`) |
| E2 | JSON file with BOM or non-UTF-8 encoding | MEDIUM | Use `readFileSync(path, 'utf8')`; non-UTF-8 remains out of scope |
| E3 | Very large JSON files (memory pressure) | LOW | Out of scope — existing pattern already loads full file; streaming JSON is a separate concern |
| E4 | `walkDirectory` on missing/non-directory path | MEDIUM | Propagate native `ENOENT` / `ENOTDIR` with path context; test missing-root behavior |
| E5 | `readJsonFile` parse-failure message clarity | MEDIUM | Wrap read/parse errors with file path context; test that messages include the file path |
| E6 | `writeJsonFile` on read-only filesystem | LOW | Propagate native `fs` error, consistent with original `writeFileSync` |
| E7 | `walkDirectory` sort stability with mixed case | LOW | Use deterministic lexical sort; document if case-sensitive order differs by platform |
| E8 | Swallow-and-return-null read sites (for example `src/blueprint/freshness.ts:108/114`) | HIGH | Do not migrate graceful-degradation reads to throwing `readJsonFile`; migrate write-only when safe |
| E9 | Compact JSON files become pretty-printed by default | MEDIUM | Add `indent: 0` option and require callers to opt in where compact output is intentional |
| E10 | File mode changes when replacing config writes | HIGH | `writeJsonFile` must pass through write options such as `{ mode: 0o600 }`; Task 1.4 acceptance explicitly checks mode-sensitive config writes |
| E11 | Downstream atomic-write plan expects state-bearing writes to use this helper | MEDIUM | Route state-bearing JSON writes through `writeJsonFile` here, but do not implement atomic semantics until the downstream blueprint |

## Risks

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Subtle traversal order changes break tests | HIGH | Return sorted paths; add before/after comparison tests for the two duplicated `walkMdFiles` sites |
| Migrating a swallow-and-return-null read to the throwing helper introduces a silent behavior regression | HIGH | Exclude graceful-degradation reads; pre-flight every JSON-read site before replacing |
| Config write permissions change during helper migration | HIGH | `writeJsonFile` supports/pass-throughs write options; verify `src/cli/commands/config.ts` preserves `0o600` |
| Compact JSON output changes to pretty JSON unexpectedly | MEDIUM | Support `indent: 0` and require explicit options for compact writers such as guard state/installer config where compactness is intentional |
| Same-file overlap between walk and JSON tasks causes merge conflicts | MEDIUM | Split Task 1.5 after Task 1.2; Wave 1 tasks have CP = 0 |
| Cross-plan conflict with atomic write helper blueprint | MEDIUM | This blueprint performs one helper migration sweep; downstream blueprint extends helper options and marks state-bearing sites atomic without remigrating raw writes |
| Large PR scope causes review fatigue | MEDIUM | Five file-cluster tasks with focused tests; batch commits by task and keep replacements mechanical |

## Non-goals

- Rewriting all file I/O in the repo (text file reads, config writes that are not JSON, log files, and binary files remain as-is)
- Migrating callback visitor walks, violation-accumulator walks, AST walks, or traversal code whose behavior is not a drop-in file list
- Removing `readFileSync` for non-JSON text
- Adding async/streaming file I/O utilities
- Adding Zod (or any) schema-validation parameter to `readJsonFile` in this blueprint; existing Zod use elsewhere does not justify changing these migration sites
- Migrating graceful-degradation JSON reads (for example `freshness.ts`) to a throwing helper
- Adding atomic write behavior; `2026-06-14-add-atomic-file-write-helper.md` owns that follow-up
- Symlink-following in `walkDirectory` (existing targeted implementations do not follow symlinks)

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 7 |
| High | 5 (F1-F4, F7) |
| Medium | 1 (F6) |
| Low | 0 |
| Info | 1 (F5 — existing `readJsonFile` to promote) |
| Fixes applied | 7/7 — counts refreshed, Zod claim corrected, graceful reads excluded, compact/mode options added, downstream atomic dependency reconciled |
| Cross-plans updated | 2 alignment rows added here for resource-leak and type-safe SQLite invariants; 4 related plans noted for execution coordination |
| Edge cases documented | 11 |
| Risks documented | 7 |
| **Parallelization score** | C (5 tasks, CP = 0; CPR 1.67 due true helper setup step) |
| **Critical path** | 3 waves (1.1 → 1.2 → 1.5) |
| **Max parallel agents** | 3 in Wave 1 |
| **Total tasks** | 5 |
| **Blueprint compliant** | 5/5 — all tasks have lane prefixes, Status, Depends, Files, Steps (TDD), and Acceptance |

### Refinement deltas

- **Live counts refreshed:** JSON single-call read baseline is **47** (not 49); direct JSON write rough baseline is **15**.
- **Parallelization improved honestly:** split the previous large JSON migration into non-overlap audit, non-overlap CLI/MCP/blueprint/hooks, and overlap-after-walk tasks. Planned same-file conflict pressure is now CP = 0.
- **Cross-plan dependency reconciled:** `freshness.ts` is now included as a write-only migration so the downstream atomic helper plan can extend one shared helper path; its read-side `null` behavior remains protected.
- **Zod claim corrected:** Zod is present in `src/`, but not used by the target JSON parse sites; schema validation remains out of scope for KISS/YAGNI.
- **Formatting/mode preservation hardened:** `writeJsonFile` must support compact output, no trailing newline, and pass-through write options for mode-sensitive config files.
- **Scope clarified:** broad walk grep includes callback visitors, violation accumulators, and AST walkers that should not be force-migrated.
- **Blueprint task format enforced:** all five tasks have explicit dependencies, file lists, TDD steps, and testable acceptance criteria.
