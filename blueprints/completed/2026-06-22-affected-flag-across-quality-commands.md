---
type: blueprint
title: "Add --affected (and --affected --branch) scoping to all quality commands"
owner: ozby
status: completed
complexity: M
created: "2026-06-22"
last_updated: "2026-06-22"
progress: "implemented and verified (5/5 tasks done, 0 blocked, updated 2026-06-22)"
depends_on: []
cross_repo_depends_on: []
tags:
  - cli
  - dx
  - quality
  - git
---

# Add `--affected` scoping to all quality commands

## Goal

Give `wp lint`, `wp format`, `wp test`, and `wp typecheck` a uniform
`--affected` flag that scopes the run to git-changed targets:

- `wp <cmd> --affected` — **staged files only**.
- `wp <cmd> --affected --branch` — **files changed vs the base ref**, where the
  base contract is `origin/${GITHUB_BASE_REF ?? 'main'}` (default `origin/main`).

so local agent loops and the pre-commit hook can lint/format/test
only what changed instead of the whole repo.

**Scope note (post-Codex review):** this blueprint covers the three **file-based**
commands — `lint`, `format`, `test`. `typecheck --affected` is **split into a
dedicated follow-up blueprint** because it requires a reverse-dependency import-graph
closure (TS compiler API; no import-graph lib installed) and package-scoping does
not narrow anything in this single-root workspace (F4/F5). See _Out of scope_.

## Consuming surface (why now)

Direct consumers already exist — not speculative infra:

- **The pre-commit hook** (`.husky/pre-commit`, `catalog/base-kit/.husky/pre-commit.tmpl`)
  shipped in PR #234 runs `wp format` whole-repo on every commit. `wp format
--affected` lets the hook scope to the staged set it already computes
  (`$FORMAT_FILES`) without shell-side file plumbing.
- **Agent quality loops** (`wp_lint` / `wp_test` / `wp_typecheck` MCP leaves and
  the `cmd-execution.md` scoped-commands table) steer agents to `--file` /
  `--package` today. `--affected` is the "just what I touched" shortcut.

## Planning Summary — fact-checked current state

Verified against sources on this branch, 2026-06-22:

- **No `wp` command exposes `--affected` today** (`grep -rn "option('--affected'"
src/cli/` → none). The original premise "format should have `--affected` like
  the others" is **false** — no sibling has it. This adds new surface to all
  four, it does not restore consistency.
- Current scoping flags and underlying runs:

  | Command     | Scoping flags                       | Underlying run                                                                                |
  | ----------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
  | `lint`      | `--file` (repeatable)               | `vp lint --format=json [files…\|.]` (`buildLintCommand`)                                      |
  | `format`    | `--file` (repeatable)               | `oxfmt --write --ignore-path .gitignore [files…]` (`buildFormatCommand`)                      |
  | `test`      | `--file`, `--package`, `--suite`, … | `vp test …` via `buildTestCommand` (file/package target)                                      |
  | `typecheck` | **none** (`--pretty`, `--full`)     | root has **no `check-types` script** → `tsc --noEmit` whole-program (`buildTypecheckCommand`) |

- **Workspace = `[., apps/*, packages/*]`** (`pnpm-workspace.yaml`). The root `.`
  package (`@webpresso/agent-kit`) holds essentially all of `src/`. **(F4)**
- **No import-graph tooling installed** — `package.json` has `typescript` only;
  no `ts-morph` / `madge` / `dependency-cruiser` / `oxc-parser`. **(F5)**
- **Changed-files logic is already duplicated three times** — reuse, don't add a
  fourth:
  1. `src/mutation/affected.ts` → `git diff --name-only origin/${GITHUB_BASE_REF ?? 'main'}...HEAD` → maps to `apps/*`/`packages/*`. The **`--branch`** shape.
  2. `src/hooks/stop/qa-changed-files.ts::getChangedFiles` → union of unstaged + `--cached`; note its `safeGetChangedFiles` degrade wrapper.
  3. `.husky/pre-commit` → `git diff --cached --name-only --diff-filter=ACMR`. The **`--affected` (staged)** shape.

## Findings (fact-check + refinement, traceable)

| ID  | Sev          | Claim / risk                                                                  | Reality                                                                                                                                                                                                                 | Fix                                                                                                                                                                                                                                   |
| --- | ------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | MEDIUM       | Pass changed files split on `\n`                                              | Filenames may contain spaces/newlines; `\n`-split corrupts them                                                                                                                                                         | Resolve with `git diff -z --name-only` (NUL-delimited, verified available); split on `\0`; pass as argv array, never a shell string                                                                                                   |
| F2  | —            | `origin/main...HEAD` is the branch set                                        | Confirmed: three-dot = merge-base diff (what the branch added).                                                                                                                                                         | Keep                                                                                                                                                                                                                                  |
| F3  | —            | `--diff-filter=ACMR` excludes deletions                                       | Confirmed; `R` emits the new path under `--name-only`.                                                                                                                                                                  | Keep                                                                                                                                                                                                                                  |
| F4  | HIGH         | typecheck "package-scope fallback" narrows the run                            | Root `.` holds ~all `src/`, so for the common case (edits in `src/`) affected-package == whole root == whole-repo typecheck. Fallback narrows almost nothing here.                                                      | File-level reverse-dep closure is the **only** option that meaningfully narrows typecheck; package-scope is not a useful fallback in this repo                                                                                        |
| F5  | HIGH         | Reverse-dep closure is "the only net-new machinery" and cheap                 | No import-graph lib is installed; sound closure needs TS-compiler-API (typescript@6) module built from scratch — materially heavier than lint/format                                                                    | **Split `typecheck --affected` into its own follow-up blueprint**; ship lint/format/test here (see _Out of scope_)                                                                                                                    |
| F6  | —            | typecheck is whole-program                                                    | Confirmed: no root `check-types` script → `tsc --noEmit`.                                                                                                                                                               | Keep                                                                                                                                                                                                                                  |
| F7  | —            | Wiring + HELP edits conflict with docs task                                   | All four command test files exist colocated; folding each HELP edit into its own wiring task keeps one file-cluster per task                                                                                            | Fold HELP into wiring tasks; docs task only touches shared rule file                                                                                                                                                                  |
| F8  | —            | `test` can take affected files                                                | Confirmed `buildTestCommand` accepts a `file[]` target.                                                                                                                                                                 | Keep                                                                                                                                                                                                                                  |
| F9  | **CRITICAL** | Empty resolver result ⇒ skip exit 0                                           | A **degraded** resolver (no git repo / git error / missing `origin/main`) also returns zero files. Treating that as "nothing changed, skip" would **silently skip linting/formatting/testing entirely** — a false green | Resolver returns `{ files, degraded }`. Commands branch: `degraded` → fall back to **whole-repo** (current behavior) + stderr warning; `!degraded && files.length===0` → skip exit 0 with notice. Never let degraded collapse to skip |
| F10 | MEDIUM       | `test --affected` proves the change is safe                                   | It maps changed source → colocated `*.test.ts` only; integration/e2e coverage of changed code elsewhere is missed                                                                                                       | Document: `--affected` is a fast inner-loop filter, **not** a coverage gate; the bookend `wp qa` / full `wp test` remains the gate (mirrors `cmd-execution.md` BOOKEND rule)                                                          |
| F11 | LOW          | `--affected` with `--fix`/`--write`                                           | Writes only to the scoped files — intended                                                                                                                                                                              | Keep                                                                                                                                                                                                                                  |
| F12 | MEDIUM       | lint affected-set reuses the audit grep extensions                            | `wp lint` is oxlint (JS/TS only); feeding `.json`/`.yaml`/`.sh` is a no-op or error                                                                                                                                     | lint filters to oxlint-lintable extensions `ts,tsx,mts,cts,js,jsx,cjs,mjs` only; format keeps the broader oxfmt set                                                                                                                   |
| F13 | **HIGH**     | Codex: degraded **write** command (`format`, `lint --fix`) → whole-repo write | A degraded probe silently reformatting/rewriting the entire tree is a surprising, huge-diff foot-gun — unlike a read/check gate                                                                                         | Degraded **write** commands **fail closed (exit 1)** with "couldn't determine affected set; rerun explicitly or without `--affected`"; degraded **read/check** commands fall back to whole-repo + warn                                |
| F14 | MEDIUM       | Codex: no flag-precedence rule                                                | `--affected` interaction with existing `--file`/`--package`/`--suite` undefined                                                                                                                                         | `--affected` is **mutually exclusive** with explicit target flags (`--file`, `--package`); supplying both → error. `--branch` only modifies `--affected`. `--fix`/`--write`/`--full`/`--pretty` compose normally                      |
| F15 | MEDIUM       | Codex: resolver too coarse                                                    | `{files, degraded}` can't say _why_ (empty vs no-repo vs missing-ref) — hurts diagnostics and tests                                                                                                                     | Extend contract to `{ files, degraded, reason }` where `reason ∈ 'ok' \| 'empty' \| 'not-a-repo' \| 'git-error' \| 'missing-base-ref'`                                                                                                |
| F16 | MEDIUM       | Codex: untracked files invisible                                              | `--cached --diff-filter=ACMR` only sees **staged** adds; pure untracked files are absent                                                                                                                                | Correct for staged semantics, but HELP must say "`--affected` = staged; `git add` first or use `--branch`"                                                                                                                            |
| F17 | LOW          | Codex: submodules + stale base ref                                            | `--name-only` may emit a submodule path; a stale local `origin/main` (no auto-fetch) yields outdated sets                                                                                                               | Exclude submodule paths from file-scoped sets; document that the base ref is **not** auto-fetched (stale = caller's responsibility; we don't fetch — `no-timeout-as-fix`)                                                             |

## Technology Choices

| Concern                         | Choice                                                | Note                                                         |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Staged set                      | `git diff -z --cached --name-only --diff-filter=ACMR` | NUL-delimited (F1); matches pre-commit `STAGED` (F3)         |
| Branch set                      | `git diff -z --name-only origin/main...HEAD`          | merge-base diff (F2); base overridable via `GITHUB_BASE_REF` |
| Reverse-dep closure (typecheck) | TypeScript compiler API (`typescript`, already a dep) | Follow-up blueprint; no new dependency (F5)                  |
| Subprocess                      | `execFileSync('git', [...])` (argv, no shell)         | Avoids quoting/injection from filenames (F1)                 |

## Key Decisions

| Decision                                                              | Choice                                                                                                                | Rationale                                                                                                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolver contract                                                     | `{ files: string[]; degraded: boolean; reason: 'ok'\|'empty'\|'not-a-repo'\|'git-error'\|'missing-base-ref' }`        | Distinguish "nothing changed" from "couldn't tell", and record _why_ for diagnostics/tests (F9, F15)                                                    |
| Degraded — **read/check** commands (`lint`, `test`, `format --check`) | Fall back to whole-repo run + stderr warning                                                                          | Fail safe, never silently skip a quality gate (F9)                                                                                                      |
| Degraded — **write** commands (`format` write, `lint --fix`)          | **Fail closed: exit 1** with a rerun hint                                                                             | A degraded whole-repo _write_ is a huge-diff foot-gun; require an explicit rerun instead (F13)                                                          |
| Empty-but-not-degraded                                                | lint/format/test: skip, exit 0 + explicit notice ("no staged affected files")                                         | A commit touching no relevant file should pass fast — but say so, so a dirty _unstaged_ worktree isn't mistaken for "checked" (F16)                     |
| Flag precedence                                                       | `--affected` is **mutually exclusive** with `--file`/`--package`; both → error. `--branch` only modifies `--affected` | No ambiguous target merging (F14)                                                                                                                       |
| `--branch` alone                                                      | Hard error: "`--branch` requires `--affected`"                                                                        | No silent no-op flag; `--branch` only widens `--affected`                                                                                               |
| Base ref                                                              | `origin/${GITHUB_BASE_REF ?? 'main'}` (default `origin/main`); **not auto-fetched**                                   | Reuses `runAffectedMutation` convention; no new env namespace; no network fetch (`no-timeout-as-fix`) — stale base is the caller's responsibility (F17) |
| Shared resolver location                                              | `src/git/changed-files.ts` (`#git/changed-files`)                                                                     | DRY; one tested resolver behind all three commands                                                                                                      |
| Converging the 3 existing call sites                                  | Out of scope (follow-up)                                                                                              | YAGNI — design the helper so they _can_ converge; don't force-migrate now                                                                               |

## Per-command applicability

| Command  | Scoping unit     | `--affected` set                                                                                                      | Empty (not degraded)  | Degraded                                                        |
| -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------- |
| `lint`   | file             | changed files filtered to `ts,tsx,mts,cts,js,jsx,cjs,mjs` (F12) → `vp lint`                                           | skip, exit 0 + notice | read: whole-repo `.` + warn; `--fix` (write): **exit 1** (F13)  |
| `format` | file             | changed files filtered to oxfmt set (`+ json,md,mdx,sh,tmpl,ya?ml`) → `oxfmt`                                         | skip, exit 0 + notice | `--check`: whole-repo + warn; write (default): **exit 1** (F13) |
| `test`   | file → test file | changed source → colocated `*.test.ts`/`*.integration.test.ts` (reuse `findTestFiles`/`discoverTestFiles`) → `--file` | skip, exit 0 + notice | whole suite + warn (F9, F10)                                    |

> `typecheck --affected` moved to a follow-up blueprint (see _Out of scope_).

## Edge Cases (severity ≥ MEDIUM)

| Edge case                                           | Sev      | Handling                                                                                                | Finding               |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- | --------------------- |
| Not in a git repo / git error                       | CRITICAL | `degraded:true` → whole-repo fallback + warn                                                            | F9                    |
| `origin/main` unfetched (fresh/shallow checkout)    | HIGH     | `--branch` git call fails → `degraded:true` → whole-repo fallback + warn; **no network fetch**, no hang | F9, no-timeout-as-fix |
| Filename with space/newline                         | MEDIUM   | `-z` NUL-delimited resolve + argv passing                                                               | F1                    |
| Changed source has no colocated test                | MEDIUM   | contributes no test; `test --affected` is best-effort, not a coverage gate                              | F10                   |
| Renamed file (`R`)                                  | MEDIUM   | `--name-only` emits new path; treated as changed                                                        | F3                    |
| lint fed non-JS/TS changed file                     | MEDIUM   | filtered out before `vp lint`                                                                           | F12                   |
| degraded `format`/`lint --fix` (write)              | HIGH     | **exit 1** + rerun hint — never whole-repo write                                                        | F13                   |
| `--affected` + `--file`/`--package` both given      | MEDIUM   | error (mutually exclusive)                                                                              | F14                   |
| Untracked (unstaged) files under `--affected`       | MEDIUM   | invisible to `--cached`; HELP says "stage first or use `--branch`"                                      | F16                   |
| Submodule path in diff output                       | LOW      | excluded from file-scoped sets                                                                          | F17                   |
| Stale local `origin/main` (no fetch)                | LOW      | used as-is, not auto-fetched; documented limitation                                                     | F17                   |
| On `main`, `--branch` set empty despite local edits | LOW      | correct (three-dot vs base==HEAD); HELP clarifies `--affected` for local work                           | F17                   |

## Risks (severity ≥ HIGH, with mitigation)

| Risk                                                              | Sev      | Mitigation                                                                                               | Finding      |
| ----------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- | ------------ |
| Degraded resolver silently skips a quality gate (false green)     | CRITICAL | `{degraded, reason}` + whole-repo fallback (read) / fail-closed (write); regression test per command     | F9, F13, F15 |
| Degraded `--affected` triggers an unexpected whole-repo **write** | HIGH     | write commands fail closed (exit 1), never whole-repo write                                              | F13          |
| typecheck closure machinery balloons scope into this DX feature   | HIGH     | **split out** — typecheck lives in its own follow-up blueprint; this one ships the 3 file-based commands | F4/F5        |

---

## Tasks

#### [git] Task 1.1: Add a shared changed-files resolver

- [x] **Status:** done
- **Files:** `src/git/changed-files.ts`, `src/git/changed-files.test.ts`, `package.json`, `tsconfig.json`
- **Acceptance:** One shared `#git/changed-files` module now returns `{ files, degraded, reason }`, uses NUL-delimited git output, preserves odd filenames, recognizes `missing-base-ref` / `not-a-repo`, and filters submodule gitlinks from file-scoped runs.

#### [cli] Task 1.2: Wire `wp lint --affected [--branch]`

- [x] **Status:** done
- **Files:** `src/cli/commands/lint.ts`, `src/cli/commands/lint.test.ts`
- **Acceptance:** `wp lint` now accepts `--affected` / `--affected --branch`, errors on `--branch` alone or `--affected` + `--file`, filters to oxlint-lintable files only, falls back to whole-repo lint on degraded read resolution, and fails closed for degraded `--fix` writes.

#### [cli] Task 1.3: Wire `wp format --affected [--branch]`

- [x] **Status:** done
- **Files:** `src/cli/commands/format.ts`, `src/cli/commands/format.test.ts`
- **Acceptance:** `wp format` now accepts `--affected` / `--affected --branch`, errors on `--branch` alone or `--affected` + `--file`, filters to the oxfmt-supported extension set, falls back to whole-repo `--check` on degraded read resolution, and fails closed for degraded write-mode runs.

#### [cli] Task 1.4: Wire `wp test --affected [--branch]`

- [x] **Status:** done
- **Files:** `src/cli/commands/test.ts`, `src/cli/commands/test.test.ts`
- **Acceptance:** `wp test` now accepts `--affected` / `--affected --branch`, errors on `--branch` alone or `--affected` mixed with explicit targets, reuses `discoverTestFiles` from `qa-changed-files.ts`, skips when no colocated tests are found, and falls back to the full test surface on degraded resolution.

#### [docs] Task 1.5: Document and sync the `--affected` contract

- [x] **Status:** done
- **Files:** `catalog/agent/rules/cmd-execution.md`
- **Acceptance:** The shared command-execution rule now documents `--affected`, `--affected --branch`, degraded read/write behavior, mutual-exclusion with explicit targets, and staged-vs-branch semantics; `wp sync` and `wp sync --check` both ran cleanly after the rule update.

## Quick Reference (Execution Waves)

| Wave              | Tasks       | Dependencies | Parallelizable | Effort |
| ----------------- | ----------- | ------------ | -------------- | ------ |
| **Wave 0**        | 1, 5        | None         | 2 agents       | XS / S |
| **Wave 1**        | 2, 3, 4     | Task 1       | 3 agents       | S      |
| **Critical path** | 1 → {2,3,4} | —            | 2 waves        | S      |

No two tasks in the same wave share a file (Task 1 → `src/git/*`; Tasks 2–4 →
disjoint `src/cli/commands/<cmd>.{ts,test.ts}`; Task 5 → `cmd-execution.md`). CP
= 0 every wave.

### Parallel Metrics Snapshot

| Metric | Meaning                                 | Target     | Actual                       |
| ------ | --------------------------------------- | ---------- | ---------------------------- |
| RW0    | ready tasks in Wave 0                   | ≥ agents/2 | 2                            |
| RW1    | ready tasks in Wave 1                   | ≥ 6 ideal  | 3 (bounded by command count) |
| CPR    | total_tasks / critical_path_len = 5 / 2 | ≥ 2.5      | 2.5 ✓                        |
| DD     | edges / tasks = 3 / 5                   | ≤ 2.0      | 0.6 ✓                        |
| CP     | same-file overlaps per wave             | 0          | 0 ✓                          |

**Parallelization score: A** (CPR 2.5, CP 0). Wave 1 width is capped at 3 by the
number of file-based commands — inherent, not a structural defect. All tasks are
S-sized after splitting typecheck out (F5).

## Acceptance criteria (overall)

- [x] `lint`, `format`, `test` accept `--affected` and `--affected --branch`;
      `--branch` alone errors; `--affected` + `--file`/`--package` errors (F14).
- [x] `--affected` = staged `ACMR` set; `--affected --branch` =
      `origin/${GITHUB_BASE_REF ?? 'main'}...HEAD`.
- [x] **Degraded read commands never skip** — fall back to whole-repo + warning
      (regression-tested), per F9.
- [x] **Degraded write commands fail closed** (`format` write, `lint --fix` →
      exit 1 + rerun hint), never a surprise whole-repo write, per F13.
- [x] Empty-but-not-degraded: skip exit 0 with an explicit "no staged affected
      files" notice (F16).
- [x] One shared `#git/changed-files` resolver (`{files, degraded, reason}`)
      backs all three commands.
- [x] `wp audit tph`, `wp sync --check`, and `wp typecheck` green.

## Verification Evidence

- `WP_FORCE_SOURCE=1 ./bin/wp test --file src/git/changed-files.test.ts --file src/cli/commands/lint.test.ts --file src/cli/commands/format.test.ts --file src/cli/commands/test.test.ts` → passed.
- `WP_FORCE_SOURCE=1 ./bin/wp lint --file src/git/changed-files.ts --file src/git/changed-files.test.ts --file src/cli/commands/lint.ts --file src/cli/commands/lint.test.ts --file src/cli/commands/format.ts --file src/cli/commands/format.test.ts --file src/cli/commands/test.ts --file src/cli/commands/test.test.ts` → passed.
- `WP_FORCE_SOURCE=1 ./bin/wp format --check --file src/git/changed-files.ts --file src/git/changed-files.test.ts --file src/cli/commands/lint.ts --file src/cli/commands/lint.test.ts --file src/cli/commands/format.ts --file src/cli/commands/format.test.ts --file src/cli/commands/test.ts --file src/cli/commands/test.test.ts --file package.json --file tsconfig.json --file catalog/agent/rules/cmd-execution.md` → passed after one targeted `wp format` apply.
- `WP_FORCE_SOURCE=1 ./bin/wp typecheck` → passed.
- `WP_FORCE_SOURCE=1 ./bin/wp sync` updated generated surfaces; `WP_FORCE_SOURCE=1 ./bin/wp sync --check` then passed clean.
- `WP_FORCE_SOURCE=1 ./bin/wp audit tph` → passed.
- `WP_FORCE_SOURCE=1 ./bin/wp audit docs-frontmatter` → passed.

## Out of scope (follow-up blueprints)

- **`typecheck --affected`** — split to a dedicated blueprint (F4/F5). It needs a
  reverse-dependency import-graph closure on the TS compiler API: typecheck the
  changed files **plus every file that transitively imports them** (a naive
  `tsc <changed>` misses importers → false green), since package-scoping ≈
  whole-repo in this single-root workspace and no import-graph lib is installed.
  The shared `#git/changed-files` resolver from Task 1 is its input.
- Converging `src/mutation/affected.ts`, `qa-changed-files.ts`, and the
  `.husky/pre-commit` shell onto the shared resolver (separate blueprint).
- Rewiring the pre-commit hook to `wp format --affected` (follow-up once Task 3
  lands).
- A standalone `--package`-style affected mode.

## Policy gates

- **Engineering principles:** PASS — one shared resolver (DRY), no speculative
  abstraction; typecheck deferred under YAGNI/KISS rather than over-built now.
- **Public package safety:** N/A — no change to `package.json`/`files`/`bin`/
  `exports`/release surface; CLI flags + internal module + one docs row only.

## Refinement Summary

| Metric                     | Value                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Findings total             | 17 (F1–F17; F13–F17 from the `/codex` pass)                                                    |
| Critical                   | 1 (F9 degraded≠empty)                                                                          |
| High                       | 3 (F4, F5, F13 degraded-write)                                                                 |
| Medium                     | 8 (F1, F10, F12, F14, F15, F16, + edge cases)                                                  |
| Low                        | 2 (F11, F17)                                                                                   |
| Fixes applied to blueprint | 17/17                                                                                          |
| Cross-plan references      | PR #234 pre-commit (downstream), 3 existing changed-files impls, typecheck follow-up blueprint |
| Parallelization score      | **A** (CPR 2.5, CP 0)                                                                          |
| Critical path              | 2 waves                                                                                        |
| Total tasks                | 5 (all Blueprint-format compliant)                                                             |

**Refinement deltas vs draft (plan-refine):** (1) `{degraded}` contract so a
failed probe can't silently skip a gate (F9); (2) demoted typecheck package-scope
fallback — useless in this single-root workspace (F4); (3) NUL-delimited resolve
for odd filenames (F1); (4) lint extension set oxlint-only (F12); (5) folded
per-command HELP into wiring tasks for file-conflict-free waves (F7).

**`/codex` outside-voice deltas (gpt-5.5, read-only):** (6) **split `typecheck
--affected` out** to a follow-up blueprint — Codex concurred it's a
"compiler-analysis project," not a DX flag (F4/F5); (7) **degraded write
commands fail closed** instead of a surprise whole-repo write (F13, HIGH —
Codex's strongest catch); (8) resolver gains a `reason` field (F15); (9) flag
precedence: `--affected` ⟂ `--file`/`--package` (F14); (10) base-ref contract is
`origin/${GITHUB_BASE_REF ?? 'main'}`, not hard-coded `main`, and not
auto-fetched (F17); (11) untracked-invisible + submodule + stale-base + on-main
edge cases documented (F16/F17).

**Codex points considered but not applied:** "parallelization metrics are
over-engineered" — kept, because the plan-refine methodology mandates the Quick
Reference + Metrics section; it shrank naturally once typecheck was split.

**Net:** this blueprint now scopes the three file-based commands (all-sound,
all-S, fully parallel, complexity **M**), delivering the pre-commit + agent-loop
wins immediately; `typecheck --affected` is a named follow-up.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                      |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-22-affected-flag-across-quality-commands.md |

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
