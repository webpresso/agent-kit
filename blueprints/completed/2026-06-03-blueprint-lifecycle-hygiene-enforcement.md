---
type: blueprint
title: Blueprint lifecycle hygiene enforcement
owner: ozby
status: completed
completed_at: '2026-06-04'
complexity: L
created: '2026-06-03'
last_updated: '2026-06-04'
progress: '100% (all remaining lifecycle-hygiene tasks verified on 2026-06-04; ready to finalize truthfully)'
review_target: internal agent-kit governance
depends_on: []
cross_repo_depends_on: []
tags:
  - agent-kit
  - blueprint
  - audit
  - lifecycle
  - governance
  - doc-drift
---

# Blueprint lifecycle hygiene enforcement

**Goal:** Make the blueprint lifecycle *self-policing*. Today a blueprint can be
fully done yet sit in `in-progress/`, claim `progress: 100%` while half its
tasks are open, drift its `last_updated` out of sync with reality, reach
`completed` through a tool that skips the open-task guard, and the
`blueprints/README.md` that documents all of this has zero protection against
going stale. This blueprint closes those gaps by consolidating enforcement into
the existing `wp audit blueprint-lifecycle` surface (plus two narrow net-new
surfaces) so that honest status, fresh metadata, legal transitions, a
non-stale README, and "no done work left in-progress" are all checked in CI and
at edit time — not left to discipline.

> **Execution note:** Produced from a three-agent investigation, then hardened
> through plan-refine (fact-check + adversarial + cross-plan), a `/codex review`
> second opinion, and a deep-interview that **resolved all 9 open questions** (see
> the **Decisions** section). No design questions remain open — execution has
> started on the foundation audit rewrite and progress-rollup slice; the
> remaining work is completing the task graph below.

## Product wedge anchor

- **Stage outcome:** Strengthen the agent-kit governance surface that the two
  reference consumers (`ozby/ingest-lens`, `ozby/edge-matte`) and the agent-kit
  repo itself gate CI on — the "does the toolchain keep a 3rd-party repo honest"
  bar in the workspace `CLAUDE.md`. Blueprint hygiene is part of the dev-workflow
  product agent-kit ships.
- **Consuming surface:** `wp audit blueprint-lifecycle` (CLI + the `wp_audit`
  MCP tool) run in `.github/workflows/ci.webpresso.yml`, and the canonical
  pretool-guard hook (`wp-pretool-guard`) that fires on every agent `git mv` /
  blueprint edit.
- **New user-visible capability:** a maintainer (or agent) running `wp audit
  blueprint-lifecycle` gets told, with a fixable message, when a blueprint is
  done-but-stuck, lying about progress, stale, illegally moved, or when the
  README index no longer matches the `blueprints/` tree — instead of those
  failures being invisible until someone notices by hand.

## Background — verified findings (2026-06-03)

Confirmed by reading source (file:line cited so Phase 0 can re-verify):

1. **`progress_pct` is dead.** `src/blueprint/db/ingester.ts:200` writes
   `null, // progress_pct`. The SQL audit's check #4
   (`src/audit/blueprint-lifecycle-sql.ts:156-172`, "completed but
   `progress_pct < 100`") is guarded by `progress_pct IS NOT NULL` and so
   **never fires**. The trustworthy progress signal lives in the `tasks` table
   (`deriveStatusFromCheckboxes`, `src/blueprint/db/parser/blueprint-db-parser.ts:169`).
2. **Double registration.** Both `blueprint-lifecycle` and
   `blueprint-lifecycle-sql` dispatch to the *same* `auditBlueprintLifecycleSql`
   (`src/cli/commands/audit.ts:37-38` and `:109-110`) → the `guardrails`
   aggregate runs it twice.
3. **`blueprint-lifecycle-sql` is not a first-class kind.** It is absent from
   `src/mcp/tools/_shared/audit-kinds.ts` (`AUDIT_KINDS`), so it is not a
   `wp_audit` MCP kind.
4. **`wp_blueprint_transition` can reach `completed` with open tasks.**
   `assertBlueprintCanComplete` is called only from `handlePromote`
   (`src/mcp/blueprint-server.ts:1295`) and `handleFinalize` (`:1399`), **not**
   from the transition handler.
5. **Markdown fallback is far weaker than the SQL path.** When no projection DB
   exists, `auditBlueprintLifecycleSql` falls back to `auditBlueprintLifecycle`
   (`src/audit/repo-guardrails.ts:302`), which has *none* of the four SQL checks
   — so CI strength depends on whether a `.blueprints.db` is present at audit time.
6. **Three divergent validators, none of the richest in CI.** MCP `runValidate`
   (requires `owner`, `Acceptance`, `Product wedge anchor`), the docs-linter
   `validateBlueprintPlan` (`src/docs-linter/blueprint-plan.ts` — `**Status:**`
   required, `completed`-requires-all-done, accepts `in_progress` *underscore*),
   and the markdown audit (`type`, `status===folder`) disagree on required
   fields and on the task-status spelling (`in_progress` vs DB `in-progress`).
   The docs-linter and `runValidate` are **not wired into CI**; the pretool-guard
   blueprint validator (`src/hooks/shared/validators/blueprint.ts:84-88`) is a
   **no-op** that always returns `valid: true`.
7. **No staleness, no WIP-limit, no README-drift, no `last_updated` freshness,
   and no "all tasks done but still in-progress" check exist anywhere.**

## Architecture Overview

```text
BEFORE
  wp audit blueprint-lifecycle ─┬─ (DB present) 4 SQL checks; #4 dead (null progress_pct)
                                └─ (no DB)      markdown fallback: 2 checks only
  docs-linter (richest)  ── only via `wp docs lint <file>`, NOT in CI
  runValidate            ── only via MCP / some transitions
  pretool-guard validator── NO-OP
  blueprints/README.md   ── hand-maintained prose, zero drift protection
  wp_blueprint_transition── can reach completed with open tasks

AFTER
  ingester computes progress_pct from task roll-up  → progress is DERIVED, honest
  wp audit blueprint-lifecycle (one first-class kind, in AUDIT_KINDS + guardrails)
     ├─ existing: 0-tasks, status≠dir, blocked-deps, completed<100%  (now live)
     ├─ NEW: all-tasks-done-but-in-progress         (concern 3)
     ├─ NEW: status vs task-state truthfulness       (concern 4)
     ├─ NEW: WIP limit — ≤ N files in in-progress/   (concern 3)
     ├─ NEW: staleness (git mtime, active states)    (concern 3, warn-first)
     ├─ NEW: last_updated ≥ git last-commit date     (concern 4, warn-first)
     └─ NEW: frontmatter zod schema (type/status/complexity/last_updated enums)
  blueprint-readme-drift audit (marker-block index + --check/--fix)  (concern 1)
  pretool-guard: transition-legality matrix on git mv between state dirs (concern 2)
  wp_blueprint_transition: calls assertBlueprintCanComplete (hole closed)
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Where new checks live | Extend the existing `blueprint-lifecycle` (SQL) audit for concerns 3 + 4; add exactly **two** net-new surfaces (`blueprint-readme-drift` audit, pretool-guard transition matrix). | KISS/YAGNI (`engineering-principles.md`): the SQL audit already has DB plumbing, fallback, and 3 of the needed checks. Avoid a 3rd/4th overlapping audit kind. |
| Progress source of truth | **Derive `progress_pct` from the `tasks` roll-up**; stop trusting any hand-entered `progress` field. Recompute-and-flag any divergence. | The checkboxes/`tasks` table are the SSOT; a duplicated hand-maintained field is the exact thing concern 4 distrusts. (DRY) |
| Staleness + `last_updated` ground truth | Use **git mtime** (`git log -1 --format=%cI -- <file>`), not the self-reported `last_updated` frontmatter. | Auditing the claim against itself is circular. Git is tamper-resistant. Bound the git call + degrade gracefully when not in a git tree (`no-timeout-as-fix.md`). |
| README enforcement shape | **Marker-block generated index** (per-state live counts + state list) with `--check`/`--fix`; leave the authoring/transition prose hand-editable. | Only the volatile part (counts, state list) drifts; full generation would force valuable prose into a template with one user (YAGNI). Mirrors doctoc `--dryrun` + the existing audit `--fix` precedent. |
| Risk of CI-blocking false positives | Land staleness + `last_updated` freshness **warn-first** (separate non-aggregate kind or severity flag), promote to blocking after a soak. | git-mtime misfires on rebases/squash/bulk-reformat; clock skew on `last_updated`. Phase them in (per architect risk #4). |
| Exemptions | `draft/` exempt from required-field/section checks; `archived/` + `completed/` exempt from staleness/transition-out/progress; `parked/` exempt from staleness (optionally require a `parked_reason`). | Draft is where churn lives; terminal/paused states are intentionally static. **(F7)** Do **not** reuse `ACTIVE_BLUEPRINT_STATUSES` (`repo-guardrails.ts:102`) for staleness scoping — verified it equals `{draft, planned, in-progress, parked}`, which *includes* the two states staleness must exempt. Define a dedicated `STALENESS_SCOPE = {in-progress}` (optionally `+planned`). Mirror the docs-linter draft-exemption (`EXECUTABLE_BLUEPRINT_STATUSES`, `blueprint-plan.ts:31`) for the field/section checks. |
| Threshold storage **(F1)** | The existing `_budgets.ts` schema (`budgetEntrySchema`, `:12`) and `DEFAULT_BUDGETS` `satisfies Record<string, {max_bytes; suggest_compact_at?}>` (`:22`) only accept **byte** budgets. WIP-count / day-threshold values do **not** fit. Extend `BudgetEntry`/`budgetEntrySchema`/the `satisfies` type to admit a generic numeric (`max?: number`, `max_days?: number`) **before** Tasks 1.3/3.1 — that's the new Task 0.5. | Verified: a `{ max: 3 }` or `{ max_days: 14 }` entry fails both the zod validation and the `satisfies` typecheck today. Reusing `_budgets.ts` is still right (one override surface), but it needs the schema widened first. |
| Validator consolidation | Converge the three validators on **one** required-field set + **one** task-status spelling (`in-progress`, hyphen). Promote the richest checks (`completed`-requires-all-done) into the CI audit path. | Three divergent validators is the root of the "validation" gap; pick one contract. |
| Walker hygiene | Every new walker skips `.claude/worktrees`, `.omc`, `.omx`, `_sandbox`. | Worktree copies pollute results; precedent in `no-first-party-mjs.ts:8`. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| **Wave 0a (gate)** | 0.0 | None — **CRITICAL prerequisite (A1)** | 1 agent | S |
| **Wave 0b (Phase 0)** | 0.1, 0.3, 0.4, 0.5 ‖ 0.2 (after 0.0) | 0.0 for 0.2 | 4-5 agents | XS-S |
| **Wave 1** | 1.1, 2.1, 2.2, 4.1, 4.2 | Wave 0 (0.1/0.2/0.5) | 5 agents | S-M |
| **Wave 2** | 1.2, 1.3 ‖ 0.6 (after 2.1) | Wave 0/1 + 1.1 (shared-file lane) | serialized after 1.1 | XS-S |
| **Wave 3** | 3.1 (staleness, warn-first) | 0.5, 1.1 | 1 agent | M |
| **Critical path** | 0.0 → 0.2 → 1.1 → 1.2/1.3 → 3.1 | — | 5 waves | L |

**15 tasks** (added 0.0, 0.5, 0.6, 4.2 during refinement; **3.2 dropped** by
deep-interview decision). 0.6 backfill depends on 2.1 (spelling/field
convergence); the self-audit gate depends on 0.6.

> **(F-graph) Shared-file lane — `CP > 0` honestly flagged.** Fact-checking the
> `**Files:**` targets revealed that **1.1, 1.2, 1.3, 2.2 (audit half), 3.1, 3.2
> all edit `src/audit/blueprint-lifecycle-sql.ts`**. Those cannot run as truly
> independent parallel agents — they must be **serialized in one owner-lane** (or
> merged) to avoid edit conflicts. The genuine parallelism here is *across files*
> (ingester `0.2`, registration `0.1`, `_budgets` `0.5`, transition guard `0.3`,
> CI `0.4`, `repo-guardrails`+docs-linter `2.1`, README `4.1`, pretool Bash
> `2.2`-half), not within the audit file. Wave numbers above reflect that
> serialization. **Refinement delta:** consider merging 1.1+1.2+1.3 into one
> "status-truthfulness checks" task if the per-check granularity isn't worth the
> handoff — decide at `planned`.

T-shirt sizing per task below (XS/S/M/L/XL). No day/week estimates.

### Parallel Metrics Snapshot

| Metric | Meaning | Target | Actual |
| ------ | ------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ agents/2 | 5 |
| CPR | total_tasks / critical_path_length = 13 / 5 | ≥ 2.5 | 2.6 |
| DD | dependency_edges / total_tasks ≈ 13 / 13 | ≤ 2.0 | ~1.0 |
| CP | same-file overlaps per wave | 0 | **>0 on `blueprint-lifecycle-sql.ts`** — resolved by serializing that lane (see note) |

**Parallelization score: B** — RW0 and CPR/DD meet target, but the
`blueprint-lifecycle-sql.ts` contention forces a serial sub-lane. Acceptable for
a governance plan where most checks land in one audit file; revisit (merge 1.x)
before `/pll`.

**Lifecycle:** Blueprint frontmatter `status` ∈ `draft|planned|parked|in-progress|completed|archived`. Task **Status:** ∈ `todo|in-progress|blocked|done`; use a `**Blocked:**` line with a reason for blocked tasks.

---

### Phase 0: Foundation — decouple the audit from the persistent DB [Complexity: M]

> **REVISED 2026-06-03 (plan-eng-review, Option B).** The audit no longer reads a
> persistent on-disk projection. The single `blueprint-lifecycle` audit now parses
> `blueprints/**` markdown and builds an **ephemeral in-memory SQLite projection**
> (`:memory:`, via the existing ingester), runs the SQL checks, and discards it —
> deterministic, zero persistent files, identical in CLI / MCP / CI. SQLite stays
> the MCP query store (settled). Root cause this fixes: the audit died opening a
> per-worktree persistent DB read-only (`blueprint-lifecycle-sql.ts:66`), and that
> keying minted **126 ungc'd `blueprints.db` files across 87 repoKeys** under
> `~/Library/Application Support/webpresso/`.
>
> **Phase 0 task changes vs the pre-fold version:**
> - **0.1 = the core**: markdown → ephemeral `:memory:` projection audit; delete the persistent-DB read path **and** the markdown-fallback (`auditBlueprintLifecycle`); unify CLI+MCP on it; remove the `-sql` double-registration.
> - **0.4 replaced**: was "DB-in-CI vs markdown-parity BLOCKER" (now moot) → **delete legacy migration** (`legacy-migration.ts`, `LEGACY_*`, `.agent/.blueprints.db`).
> - **0.2 reframed**: `progress_pct` from task roll-up lives in the shared ingester → benefits both the ephemeral audit projection and the persistent MCP projection.
> - **0.7 (new)**: persistent MCP projection → **per-repo keying** (not per-worktree) + GC + one-time prune of the 126 strays.
> - **0.0 simplified**: slug-uniqueness is a **file-level** check (the ephemeral ingest also surfaces collisions); keep the persistent-ingester dup guard for the MCP side.
>
> **(A1, reframed.)** Slug is derived from filename only (`document-paths.ts:48`);
> the repo currently has `2026-06-02-…toolchain-isolation.md` in **both**
> `in-progress/` and `planned/`. Two files → one slug still collides in the
> ephemeral projection's ingest, so the file-level slug-uniqueness check (0.0)
> remains a real gate. Resolve the live duplicate before relying on any per-slug logic.

#### [infra] Task 0.0: De-duplicate blueprint slugs + add a `slug-uniqueness` check (A1)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** None

Resolve the existing duplicate. **Decision (deep-interview):** the work is shipped
(the `planned/` copy's own frontmatter says "ALREADY SHIPPED … Superseded by
master plan"), so **consolidate to one canonical copy in `completed/`** and
**delete the duplicate** (`git mv` the surviving copy to `completed/`, set
`status: completed`, remove the other).
Then add a check (markdown-side, in `auditBlueprintLifecycle` so it works before
the DB is built) that fails when two blueprint files anywhere under `blueprints/`
share a derived slug. **(C6 — audit alone is insufficient; codex finding.)** The
audit only catches dupes *when it runs*, but the projection **ingester upserts by
slug** (`ingester.ts:114`, slug derived without state at `:34`) and would corrupt
the projection *before* any audit. So **also harden the ingester to detect/refuse
a duplicate DB slug** (fail or warn-loudly on the second insert for the same
slug) rather than silently `ON CONFLICT DO UPDATE`-overwriting. Note the
`scanner.ts:111` dupe check is **not** equivalent — its slugs are state-qualified
(`state/slug`), so it never sees this collision.

**Files:**

- Remove/Move: the stale duplicate `…toolchain-isolation.md` (one of the two)
- Modify: `src/audit/repo-guardrails.ts` (`auditBlueprintLifecycle`) + test (two files, same slug → violation)
- Modify: `src/blueprint/db/ingester.ts` (detect/refuse duplicate DB slug on upsert — C6) + test

**Steps (TDD):** failing tests (two same-slug files → audit violation; ingesting a second same-slug file → refused/warned, not silent overwrite) → implement → green; then de-dupe the live pair and confirm green.

**Acceptance:**

- [x] Two blueprints with the same derived slug → violation naming both paths
- [x] Ingester refuses/flags a duplicate DB slug instead of silently overwriting (C6)
- [x] The live `…toolchain-isolation.md` duplicate is resolved (one canonical copy)
- [x] Scoped lint + tests pass

#### [infra] Task 0.1: CORE — one markdown→ephemeral-`:memory:` audit; delete persistent read path + markdown fallback; unify CLI/MCP (Option B)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** None

The single source of the breakage and the divergence. Build a
`buildEphemeralProjection(cwd)` that parses `blueprints/**` markdown (existing
parser) and ingests into a `new Database(':memory:')` via the **existing
ingester** (shared code → no schema drift), returns the DB. Rewrite the
`blueprint-lifecycle` audit to call it, run the SQL checks, and close it. Then:

- **Delete the persistent-DB read path** (`blueprint-lifecycle-sql.ts:66`
  `new Database(dbFile,{readonly:true})`, the `existsSync(dbFile)` gate, and the
  `resolveBlueprintProjectionDbPath`-for-audit usage). No on-disk projection is
  read by the audit ever again — kills the CANTOPEN/stale/WAL-readonly failure.
- **Delete the markdown fallback** (`auditBlueprintLifecycle` in
  `repo-guardrails.ts`) — there is now ONE audit, not a SQL-path + weaker-markdown
  fallback. (C1/divergence + the non-determinism die together.)
- **Unify dispatch**: CLI (`audit.ts:37`) and MCP (`src/mcp/tools/audit.ts:160-162`,
  which today calls the markdown audit) both point at the one audit. Remove the
  `blueprint-lifecycle-sql` double-registration (`audit.ts:109-110`,
  `audit-core.ts:32`); grep consumer repos (`ingest-lens`/`edge-matte` CI) before
  dropping the alias (A8).

`'blueprint-lifecycle'` is already in `AUDIT_KINDS` (committed `9494eced`).
Re-verify `file:line` after the in-flight `no-first-party-mjs-audit-rollout` lands.

**Files:**

- Create: `buildEphemeralProjection` helper (next to the ingester) + tests
- Rewrite: `src/audit/blueprint-lifecycle-sql.ts` → ephemeral-projection audit (or rename to `blueprint-lifecycle.ts`)
- Delete: the persistent-read path + `auditBlueprintLifecycle` markdown fallback in `src/audit/repo-guardrails.ts`
- Modify: `src/cli/commands/audit.ts`, `src/cli/commands/audit-core.ts`, `src/mcp/tools/audit.ts` (unify dispatch, drop `-sql`)
- Tests: audit runs identically with **no** persistent DB present; CLI + MCP exercise the same checks; runs once in `guardrails`

**Steps (TDD):** failing test (audit green/red identically with zero host state, CLI==MCP) → build ephemeral projection + rewrite audit + delete fallback/persistent-read → green.

**Acceptance:**

- [x] Audit builds an in-memory projection from markdown each run; reads **no** on-disk DB
- [x] CLI `wp audit blueprint-lifecycle` and MCP `wp_audit(blueprint-lifecycle)` run the **same** single audit
- [x] Deterministic on a fresh checkout with zero `~/Library/.../webpresso` state (CANTOPEN gone; no fallback)
- [x] `guardrails` runs it exactly once; no stray `blueprint-lifecycle-sql` kind
- [x] Scoped lint + tests pass

#### [infra] Task 0.2: Compute `progress_pct` from the task roll-up at ingest

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** Task 0.0

`src/blueprint/db/ingester.ts:200` hard-codes `null` for `progress_pct`,
making the SQL audit's check #4 dead. Replace with a value computed from the
parsed task roll-up. **(A6 — `dropped`/`blocked` semantics, found in Phase 3.)**
The seed CHECK allows task status `todo|in-progress|blocked|done|dropped`
(`0001_seed.sql:43`), but the parser's `deriveStatusFromCheckboxes` only emits
`todo|in-progress|done`. **Decided (deep-interview):** **terminal = `done ∪ dropped`** for the
"is it finished" question, while `progress_pct` displays honest `done`-only
progress. Without this, a blueprint legitimately closed with one de-scoped
(`dropped`) task can never reach 100% and deadlocks against check #4. **Also
decided:** the hand-entered `progress:` frontmatter field is **dropped entirely**
— `progress_pct` is **derive-only** (SSOT = the `tasks` roll-up), so there is no
manual field to diverge and no divergence check needed.

**(A3 — activating dead check #4 reddens CI; sequencing trap.)** Flipping
`progress_pct` from `null` to a real value **activates** check #4 (`completed`
AND `progress_pct < 100`) against all **49 existing completed blueprints** at
once — any whose task checkboxes aren't fully checked (prose-completed,
future-work checklists, appendix items) goes red in `guardrails`, which CI runs.
**Mitigations:** (a) first MEASURE — run the roll-up over the completed
blueprints and record the distribution before flipping; (b) make
check #4 ignore completed blueprints with **0 parsed `#### Task` sections**
(prose-completed) and land it **warn-first**, decoupled from backfill.
**(C2 — cycle break, codex finding.)** Task 0.2 must NOT depend on the backfill
(0.6): 0.6 depends on 2.1, which depends on 0.2 — requiring 0.6 here created a
`0.2 → 0.6 → 2.1 → 0.2` cycle (graph is unexecutable as written). Resolution:
0.2 ships check #4 **warn-only** and stays `Depends: 0.0` only; the backfill
(0.6) is what later **promotes the check to blocking**.

**Files:**

- Modify: `src/blueprint/db/ingester.ts` (around `:116-127`, `:200`)
- Modify/Create: ingester tests (0 tasks → null; mixed → rounded %; a `dropped` task counts terminal but not toward displayed `done`)

**Steps (TDD):** failing ingester test for the roll-up (incl. a `dropped`-task fixture) → implement → green. Then confirm check #4 fires on a `completed`+genuinely-open fixture but NOT on a prose-completed (0-task) one.

**Measured 2026-06-04:** parser-true completed corpus = **51 files total**,
**8 zero-task**, **43 task-bearing**, **43/43 task-bearing all-terminal**,
**0** with `progress_pct < 100`.

**Acceptance:**

- [x] `progress_pct` reflects `done/total` rounded; 0 tasks → `null`
- [x] Terminal = `done ∪ dropped` used for completion checks; `dropped` does not deadlock
- [x] Check #4 fires on genuinely-incomplete completed blueprints, skips prose-completed (0-task)
- [x] Measured distribution over the completed corpus recorded before flip
- [x] Scoped lint + tests pass

#### [backend] Task 0.3: Close the `wp_blueprint_transition` → completed hole

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** None

`assertBlueprintCanComplete` guards `handlePromote` (`blueprint-server.ts:1295`)
and `handleFinalize` (`:1399`) but not the transition handler, so
`wp_blueprint_transition` can move a blueprint to `completed` with open tasks.
Call `assertBlueprintCanComplete` from the transition handler whenever the
target state is `completed` (mirror the `handlePromote` guard).

**(C3 — reconcile `dropped` with the terminal definition, codex finding.)**
Verified `assertBlueprintCanComplete` (`blueprint-server.ts:1454`) rejects every
task with `status !== 'done'` — so it rejects `dropped`. That directly
**contradicts** Task 0.2's `terminal = done ∪ dropped` and would preserve the
de-scope deadlock this plan claims to fix. Fix in the **same change**: relax the
filter to `status !== 'done' && status !== 'dropped'` so the gate matches the
terminal definition (note: `handleFinalize`'s DB precheck at `:1370` already
allows `dropped`, so this aligns the two). Also keep the
`assertAllTasksHaveCanonicalPassingEvidence` requirement scoped to non-dropped
tasks. **Decided:** `dropped` is terminal (deep-interview).

**Files:**

- Modify: `src/mcp/blueprint-server.ts` (transition handler + `assertBlueprintCanComplete:1454` filter)
- Modify/Create: `src/mcp/blueprint-server.transition.test.ts` — transition→completed with an open task rejected; with a `dropped` (terminal) task allowed

**Steps (TDD):** failing tests (open task → throw; all-`done`-or-`dropped` → allowed) → add guard + relax filter → green.

**Acceptance:**

- [x] `wp_blueprint_transition` to `completed` with any non-terminal (not `done`/`dropped`) task is rejected
- [x] A blueprint with all tasks `done`/`dropped` can complete (no deadlock)
- [x] `assertBlueprintCanComplete`, finalize, promote, and transition agree on terminal = `done ∪ dropped`
- [x] Existing transition tests stay green; scoped lint + tests pass

#### [infra] Task 0.4: Delete the legacy `.agent/.blueprints.db` migration machinery

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** Task 0.1

**(Replaces the old "DB-in-CI vs markdown-parity BLOCKER" — moot under Option B:
the audit builds its projection in memory, so there's no CI build step and no
markdown fallback to keep at parity.)** With the audit decoupled, the
pre-worktree-scoping legacy path is dead weight (pre-1.0, no external consumers).
Delete it outright — no back-compat shim:

- Delete `src/blueprint/db/legacy-migration.ts` + `migrateLegacyAgentDb` call sites.
- Delete `LEGACY_AGENT_DIR` / `LEGACY_DB_FILENAME` / `LEGACY_LOCK_FILENAME` and the `.agent/.blueprints.db` fallbacks in `src/blueprint/db/paths.ts`.
- A non-git directory now resolves to a single explicit temp/in-memory path, not `.agent/`.

**Files:**

- Delete: `src/blueprint/db/legacy-migration.ts` (+ its test)
- Modify: `src/blueprint/db/paths.ts` (drop `LEGACY_*` + legacy fallbacks), `blueprint-lifecycle-sql.ts` (drop the `migrateLegacyAgentDb` call), any other call sites
- Tests: removal doesn't break non-git resolution

**Acceptance:**

- [x] `legacy-migration.ts` and all `LEGACY_*` constants/`.agent/.blueprints.db` handling are gone
- [x] No remaining reference to `migrateLegacyAgentDb`
- [x] Scoped lint + tests pass

#### [infra] Task 0.7: Persistent MCP projection — per-repo keying + GC + prune strays

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** Task 0.1

**(The sprawl fix for the MCP-side persistent projection — the audit no longer
reads it, but MCP query/list/FTS still does.)** Verified: keying is
`sha256(realpath(git-common-dir))[:16]/worktree/sha256(realpath(toplevel))[:8]`
(`state-root.ts:57-70`) → **126 `blueprints.db` files across 87 repoKeys**, several
repoKeys with 12–16 per-worktree DBs, zero GC, under `~/Library/Application
Support/webpresso/`. Re-key the persistent projection to **per-repo** (drop the
per-worktree segment for this surface; worktrees of one repo share the markdown
anyway), add a GC pass (prune DBs whose repo path no longer exists / LRU TTL), and
a one-time cleanup of the existing strays.

**Files:**

- Modify: `src/blueprint/db/paths.ts` / `src/paths/state-root.ts` (per-repo keying for the projection surface)
- Create: GC routine + one-time prune + tests

**Acceptance:**

- [x] Persistent projection path is per-repo, not per-worktree
- [x] GC prunes orphaned/stale projection DBs; one-time prune clears the 126 strays
- [x] MCP `wp_blueprint_list/get/query` still resolve the projection correctly
- [x] Scoped lint + tests pass

#### [qa] Task 0.6: Backfill existing blueprints to the new contract (A2/A4)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** Task 2.1

**(A2 — the "self-audit green" gate is unachievable without this.)** The
Verification Gates demand `wp audit blueprint-lifecycle` be green on this repo,
but verified day-one violations exist across the ~67-file backlog: three
in-progress/planned blueprints use `**Status:** in_progress` (underscore) and one
uses non-canonical `**Status:** pending` (`no-first-party-mjs-audit-rollout/_overview.md`);
most `planned/`+`in-progress/` blueprints lack `last_updated`; three
`parent-roadmap` blueprints have 0 tasks. Backfill them in lockstep with the
checks that would flag them: convert `in_progress`→`in-progress` and `pending`→a
valid status, add `last_updated`, tag/normalize parent-roadmaps. The self-audit
gate **depends on this task**. Alternative if backfill is too large: grandfather
pre-cutoff files via a one-time waiver list — pick one and document it.

**Files:**

- Modify: existing blueprint markdown under `blueprints/{planned,in-progress,parked}/` failing the new checks
- (the live `no-first-party-mjs-audit-rollout/_overview.md` is a concrete instance)

**Acceptance:**

- [x] `wp audit blueprint-lifecycle` is green on this repo after backfill (or documented waiver list)
- [x] No existing blueprint uses `in_progress`/`pending` after migration
- [x] Scoped lint + tests pass

#### [infra] Task 0.5: Widen the budget schema to admit non-byte thresholds (F1)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** None

**(F1 — fact-check finding)** Tasks 1.3 (WIP limit) and 3.1 (staleness) both want
to store an integer threshold in `src/audit/_budgets.ts`, but the existing
`budgetEntrySchema` (`_budgets.ts:12`) requires `max_bytes: z.number().int().positive()`
and `DEFAULT_BUDGETS` is typed `... satisfies Record<string, { max_bytes: number; suggest_compact_at?: number }>`
(`:22`). A `{ max: 3 }` / `{ max_days: 14 }` entry fails *both* the zod parse and
the `satisfies` typecheck. Widen `BudgetEntry`, `budgetEntrySchema`, and the
`satisfies` constraint to also admit optional `max?: number` and `max_days?: number`
(keep `max_bytes` optional, not required, so byte and count budgets coexist).
This is the shared prerequisite for 1.3 and 3.1.

**Files:**

- Modify: `src/audit/_budgets.ts` (schema + `BudgetEntry` type + `satisfies` constraint)
- Modify/Create: `src/audit/_budgets.test.ts` — a `{ max_days }` and a `{ max }` entry parse + resolve

**Steps (TDD):** failing test (count/day budget rejected today) → widen schema → green; assert existing byte budgets still validate.

**Acceptance:**

- [x] `{ max: N }` and `{ max_days: N }` entries parse and resolve
- [x] Existing `max_bytes` budgets unaffected
- [x] Scoped lint + tests pass

---

### Phase 1: "No done work left in-progress" + status truthfulness [Complexity: S]

#### [backend] Task 1.1: "All tasks done but still in-progress" check

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** Task 0.1, Task 0.2

Add a check to `blueprint-lifecycle-sql.ts` deriving progress from the `tasks`
table (not `progress_pct`). **(A6)** Use **terminal = `done ∪ dropped`** (not
strictly `done`) so a de-scoped task doesn't keep a finished blueprint pinned in
`in-progress/` forever:

```sql
SELECT b.slug, b.file_path, COUNT(*) AS total,
       SUM(CASE WHEN t.status IN ('done','dropped') THEN 1 ELSE 0 END) AS terminal
FROM blueprints b JOIN tasks t ON t.blueprint_slug = b.slug
WHERE b.status = 'in-progress'
GROUP BY b.slug HAVING total > 0 AND terminal = total
```
**(A7 + C5 — needs a parser change, not SQL-only.)** Exclude illustrative
`#### Task` blocks inside `## Appendix`/superseded sections. **codex verified**
`parseTasks` (`blueprint-db-parser.ts:255`) scans *all* `#### Task` headers across
the body with **no phase-section metadata**, so the SQL layer cannot tell an
appendix task from a real one. The fix must record provenance at parse/ingest
time (e.g. tag each task with its enclosing `### Phase N` / `## Appendix` and skip
non-phase tasks) — **modify the parser + ingester**, not just the SQL query. Add a
fixture with an appendix `#### Task` that must NOT count.

Violation: `Blueprint '<slug>' has all <total> tasks done but is still in 'in-progress/' — move to completed/ (git mv + transition) or reopen a remaining task`.

**Files:**

- Modify: `src/audit/blueprint-lifecycle-sql.ts`
- Modify: `src/blueprint/db/parser/blueprint-db-parser.ts` + `src/blueprint/db/ingester.ts` (record task phase-provenance so SQL can exclude appendix tasks — C5)
- Modify: `src/audit/blueprint-lifecycle-sql.test.ts` + parser/ingester tests

**Steps (TDD):** fixture (in-progress blueprint, all tasks done) must violate; partial fixture + appendix-task fixture must pass → implement → green.

**Acceptance:**

- [x] Fully-done in-progress blueprint flagged; partial one passes
- [x] Message names the slug, file, and remedy
- [x] Scoped lint + tests pass

#### [backend] Task 1.2: Status vs task-state truthfulness (DB mirror of docs-linter rule)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** Task 0.2, Task 1.1 (shared file `blueprint-lifecycle-sql.ts` — serialize)

Add the symmetric DB-side check the docs-linter only does at markdown level:
`status='completed'` (or in `completed/`) but any task ≠ `done` is a violation.
This catches the dishonest "marked complete, checkboxes open" case even when the
docs-linter is not invoked. (The in-progress side is Task 1.1; status≠dir is the
existing SQL check #2 — keep it.)

**Files:**

- Modify: `src/audit/blueprint-lifecycle-sql.ts` + test

**Acceptance:**

- [x] `completed` blueprint with an open task is flagged
- [x] Scoped lint + tests pass

#### [backend] Task 1.3: WIP-limit check — at most N blueprints in `in-progress/`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** Task 0.1, Task 0.5, Task 1.2 (shared file `blueprint-lifecycle-sql.ts` — serialize)

Count blueprints whose status/dir is `in-progress`; if `> N`, violate. **Decided
(deep-interview): N = 3**, stored in `src/audit/_budgets.ts` as
`'blueprint-wip-in-progress-max': { max: 3 }` (requires the widened schema from
Task 0.5 — **F1**), overridable per repo. **(A4 resolved.)** The README's
"Exactly one blueprint per lane" prose is **wrong for this repo** (it already
runs 2 in-progress) — so **update `blueprints/README.md` in the same change** to
"at most 3 active blueprints per lane" so the Task 4.1 drift gate and this cap
agree. **(F6)** Count by walking `blueprints/in-progress/` (`readdirSync`, as
`auditBlueprintLifecycle` does at `repo-guardrails.ts:316`), **not** `git ls-files`
— an untracked new blueprint must still count.

**Files:**

- Modify: `src/audit/_budgets.ts` (`{ max: 3 }` default; schema already widened in 0.5)
- Modify: `blueprints/README.md` ("exactly one" → "at most 3" per lane) — keep README + cap in sync
- Modify: `src/audit/blueprint-lifecycle-sql.ts` + test

**Acceptance:**

- [x] More than 3 in-progress blueprints → violation citing the count and the budget key
- [x] An untracked (not-yet-`git add`ed) in-progress blueprint is counted
- [x] Budget override respected; `blueprints/README.md` prose matches the cap (≤3)
- [x] Scoped lint + tests pass

---

### Phase 2: Validation consolidation + transition legality [Complexity: M]

#### [backend] Task 2.1: Zod frontmatter schema in the lifecycle audit

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** Task 0.2

`blueprint.yaml` (`docs/templates/blueprint.yaml:10-21`) declares required
frontmatter (`type`, `status`, `complexity` enum, `last_updated: date`) and
`sections.required: []` (`:36`, deliberately empty), but the markdown audit only
checks `type` and `status`-vs-folder, so `complexity` enum and `last_updated`
go unenforced. Add a zod schema (precedent: zod is already used in the audit
layer — `_budgets.ts:10,12`) validating the required keys + enums in the
per-file loop of `auditBlueprintLifecycle`. Keep it in the markdown audit (must
work before the DB is built). **Exempt `draft/`** from the strict-field subset
(mirror `EXECUTABLE_BLUEPRINT_STATUSES`, `blueprint-plan.ts:31`).

**(F4 — reconcile the three divergent required-field sets first.)** Verified the
three existing validators require *different* fields and there is no canonical
set:
- `runValidate` (`blueprint-server.ts:680`): `type, title, status, complexity, owner` (+ tasks, `**Acceptance:**`, `## Product wedge anchor`) — **no `last_updated`**.
- `blueprint.yaml` schema: `type, status, complexity, last_updated` — **no `owner`/`title`**.
- markdown audit: `type`, `status`-vs-folder only.
**Decided (deep-interview): the canonical required set is `type, title, status, complexity, owner, last_updated`** (the superset). Make all three validators agree on it for non-draft blueprints.

**(F3 — task-status spelling convergence is a breaking change; do the migration in this task.)** Verified the spelling is split, **opposite** to the obvious guess:
- docs-linter `TASK_STATUSES` (`blueprint-plan.ts:39`) and its error message (`:367`) require **underscore** `in_progress`.
- the SQLite `tasks.status` CHECK (`0001_seed.sql:43`) and the parser canonical (`blueprint-db-parser.ts:36,162`) use **hyphen** `in-progress`.
- the docs-linter's *blueprint-level* status message (`:343`) already uses hyphen — internal inconsistency.
Converge on **hyphen** `in-progress` (matches the DB + parser, which is the SSOT). Update `TASK_STATUSES` + the `:367` message, **and** migrate any existing blueprint markdown that uses `in_progress` and the task template, in this same task — otherwise those blueprints start failing the linter. (The parser already accepts both at `:162`, so the DB side is safe.)

**Files:**

- Modify: `src/audit/repo-guardrails.ts` (`auditBlueprintLifecycle` loop, `:302`)
- Modify: `src/docs-linter/blueprint-plan.ts` (`TASK_STATUSES:39`, message `:367`, required-field set)
- Modify: `src/mcp/blueprint-server.ts` (`runValidate:680` required-field set) — converge
- Modify: `docs/templates/blueprint.md` + any existing blueprint using `in_progress`
- Modify/Create: tests for each enum/required-field violation + draft exemption

**Acceptance:**

- [x] One canonical required-field set enforced by all three validators
- [x] `complexity` not in `XS|S|M|L|XL` → violation (non-draft)
- [x] Missing/malformed `last_updated` → violation (non-draft)
- [x] `draft/` blueprints exempt from the strict subset
- [x] Task-status spelling unified on hyphen `in-progress` across docs-linter, template, and existing blueprints
- [x] Scoped lint + tests pass

#### [infra] Task 2.2: Transition-legality matrix (audit-primary, hook-assist)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** Task 0.1

**(F2 — the original "extend the pretool-guard file validator" integration point
is wrong; corrected here.)** Verified: `validateBlueprint(filePath, options)`
(`src/hooks/shared/validators/blueprint.ts:62`) is invoked on **single-file
Write/Edit** and receives exactly one path — it can never see a rename's
`(source, dest)`. Blueprints move via `git mv` (the README's documented path),
which is a **Bash** command, not an Edit, so the file-write validator never fires
for a move. Therefore transition legality cannot live in that validator. Use two
correct surfaces instead:

- **Primary (CI-gated): an audit check.** For each blueprint, recover its
  *previous* lifecycle dir and compare `from → to` against the matrix. Lives in
  `blueprint-lifecycle-sql.ts` (or a sibling helper) reusing the Task 3.1 git
  helper. **(A5 — two reliability hazards, found in Phase 3; both make a naive
  version fail OPEN silently.)** (1) The CI `wp-audits` job checkout
  (`ci.webpresso.yml:134`) sets **no `fetch-depth`** → shallow depth-1 clone →
  the `git mv` commit isn't in history → rename recovery returns empty. **This
  task must add `fetch-depth: 0` to that checkout step.** (2) git rename
  detection is a similarity heuristic; a blueprint edited heavily during the move
  won't register as `R`, so `--diff-filter=R` misses it. **More robust:** recover
  the prior state by diffing the frontmatter `status:` field across history
  (`git log -p -- <file>`) rather than relying on rename detection. **State the
  policy explicitly: fail-open** (best-effort detective control, not a hard
  gate) — and downgrade the plan's own language from "reliable gate" accordingly
  (Open Question #7).
- **Assist (fast feedback, best-effort): a Bash-guard parse.** In the
  pretool-guard *forbidden-commands*/Bash validator (which already inspects Bash
  commands), parse `git mv blueprints/<from>/… blueprints/<to>/…` and reject an
  illegal move before it happens. This only covers agent-issued `git mv` (not
  plain `mv` or out-of-tool git), so it is an early-warning, not the gate.

The no-op `validateBlueprint` is **not** the home for this; leave it (or wire its
real implementation as separate future work). **Decided matrix (deep-interview)**
— note `completed → in-progress` (reopen) is **allowed**:

| from → to | legal targets |
| --------- | ------------- |
| draft | planned, archived |
| planned | in-progress, parked, archived |
| in-progress | completed, parked, archived |
| parked | in-progress, planned, archived |
| completed | **in-progress (reopen)**, archived |
| archived | (terminal) |

**Files:**

- Create: transition matrix + `from→to` legality helper (shared module) + tests
- Modify: `src/audit/blueprint-lifecycle-sql.ts` (audit-primary check via frontmatter-history)
- Modify: `.github/workflows/ci.webpresso.yml` (`wp-audits` checkout → `fetch-depth: 0`) (A5)
- Modify: pretool-guard Bash/forbidden-commands validator (`src/hooks/pretool-guard/validators/forbidden-commands.ts`) for the `git mv` early-warning + tests — **re-read first; `9494eced` just expanded this file with config-driven guard routing** (Phase 4)

**Acceptance:**

- [x] Audit flags an illegal `from → to` move, with a message naming legal targets
- [x] CI checkout uses `fetch-depth: 0` so history is present (A5)
- [x] Bash-guard rejects an illegal agent-issued `git mv` before it runs
- [x] Legal moves pass on both surfaces; non-blueprint edits/commands unaffected
- [x] Recovery is bounded, fails **open** outside a git tree / on missing history (documented)
- [x] Scoped lint + tests pass

---

### Phase 3: Staleness + `last_updated` freshness (warn-first) [Complexity: M]

#### [backend] Task 3.1: Staleness check for active-state blueprints (git mtime)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** Task 0.5, Task 1.1

**Decided (deep-interview): `in-progress` only, 14 days.** Flag `in-progress`
blueprints whose last git commit touch (`git log -1 --format=%cI -- <file>`, same
`execFileSync('git', …)` precedent as `no-first-party-mjs.ts:1,82`) is older than
14 days. Threshold in `_budgets.ts` as
`'blueprint-stale-in-progress-days': { max_days: 14 }` (requires the widened
schema from Task 0.5 — **F1**). `planned` is **not** in scope. **(F7)** Scope to a
dedicated `STALENESS_SCOPE = {in-progress}` set — do **not** reuse
`ACTIVE_BLUEPRINT_STATUSES` (`repo-guardrails.ts:102`), which *includes* `draft`
and `parked` (the states this check must exempt). Exempt
`draft`, `parked`, `completed`, `archived`. Bound the git call and **degrade
gracefully** (skip with a notice) when not in a git tree — never raise a timeout
to dodge a hang (`no-timeout-as-fix.md`). **Land warn-only first** (separate
non-aggregate kind or a severity flag) so a rebase/squash misfire does not block
CI; promote to blocking after a soak.

**Files:**

- Modify: `src/audit/_budgets.ts` (threshold default; schema widened in 0.5)
- Modify: `src/audit/blueprint-lifecycle-sql.ts` (+ shared git-mtime helper)
- Create: tests (stale → warn; fresh → ok; non-git → graceful skip)

**Acceptance:**

- [x] Stale in-progress blueprint warned; fresh one passes
- [x] `draft/parked/completed/archived` never flagged
- [x] Non-git environment degrades with a notice, does not hang or error
- [x] Warn-only severity initially; documented promotion criteria
- [x] Scoped lint + tests pass

> **~~Task 3.2: `last_updated` freshness vs git mtime~~ — DROPPED (deep-interview, 2026-06-03).**
> Task 2.1 already makes `last_updated` a required, audited frontmatter field; the
> git-mtime cross-check is the false-positive-prone half (bulk reformat / `git mv` /
> squash all reset `%cI`) and would add alert-fatigue for little gain. Both the
> adversarial reviewer and codex flagged it as YAGNI. Phase 3 is now Task 3.1 only.

---

### Phase 4: `blueprints/README.md` drift gate [Complexity: S]

#### [docs] Task 4.1: `blueprint-readme-drift` audit — marker-block index + `--check`/`--fix`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** Task 0.1

Wrap a generated index block in `blueprints/README.md` with HTML-comment
markers and add an audit that regenerates it in-memory and diffs:

```
<!-- BEGIN: blueprint-index (generated by `wp audit blueprint-readme-drift --fix`) -->
| State | Count | Description |
| ... live per-state counts + the canonical state list ... |
<!-- END: blueprint-index -->
```

The hand-written authoring/transition prose stays outside the markers,
hand-editable. Mismatch → violation `blueprints/README.md index block is stale —
run 'wp audit blueprint-readme-drift --fix'`. **(F5)** `--fix` rewrites the block
mirroring the existing fix precedent in **`auditDocsFrontmatter`** —
`applyDocsFrontmatterFix` (`repo-guardrails.ts:670`, applied at `:256`); note
`auditBlueprintLifecycle` itself has **no** fix path, so it is not the precedent
to cite. **(F6)** Source the counts by **filesystem walk** (`readdirSync` per
state dir, as `auditBlueprintLifecycle` does at `:316`) or the DB — **not**
`git ls-files` — so untracked drafts are counted. **(A9 — keep the block tiny to
avoid churn/conflicts.)** Generate **per-state counts only** (6 rows), never
per-blueprint rows: counts change on every blueprint add/move, so per-blueprint
tables inside the markers would conflict on every concurrent PR and make every
blueprint PR also touch the README or fail `--check`. The existing README's
detailed "active work" tables (if any) stay **outside** the markers,
hand-maintained. Register the new kind in `audit-kinds.ts`, the CLI dispatch,
the `guardrails` aggregate, **and the MCP tool's hand-written dispatch switch +
`kind` description (`src/mcp/tools/audit.ts:160`-style case and `:354`
description)** — **(C1)** `AUDIT_KINDS` alone does NOT expose a kind over
`wp_audit`; the MCP switch and description are hand-maintained.

**Files:**

- Create: `src/audit/blueprint-readme-drift.ts` + test
- Modify: `src/mcp/tools/_shared/audit-kinds.ts`, `src/cli/commands/audit.ts`, `src/cli/commands/audit-core.ts`
- Modify: `src/mcp/tools/audit.ts` (dispatch case + description) **(C1)**
- Modify: `blueprints/README.md` (insert marker block)

**Steps (TDD):** failing test (stale block → violation; `--fix` rewrites; in-sync → ok) → implement → green.

**Acceptance:**

- [x] Drifted index block → violation; `--fix` regenerates it
- [x] Authoring prose outside markers is preserved
- [x] New kind in `AUDIT_KINDS`, CLI, MCP, and `guardrails`
- [x] Scoped lint + tests pass

#### [docs] Task 4.2: Add a changeset (Phase 4 cross-plan finding)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"blueprint-lifecycle","command":"bun src/cli/cli.ts audit blueprint-lifecycle","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"audit_kind":"hook-surface","command":"bun src/cli/cli.ts audit hook-surface","kind":"audit","passed":true,"result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.test.ts src/blueprint/db/ingester.test.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts src/mcp/blueprint-server.transition.test.ts src/blueprint/freshness.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp test src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp lint src/audit/blueprint-lifecycle-sql.ts src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/gc.ts src/blueprint/db/gc.test.ts src/blueprint/db/cold-start.ts src/blueprint/projection-ready.ts src/blueprint/freshness.ts src/hooks/pretool-guard/validators/forbidden-commands.ts src/hooks/pretool-guard/validators/forbidden-commands.test.ts .github/workflows/ci.webpresso.yml src/cli/commands/blueprint/mutations.ts src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"},{"command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-04T08:42:00.000Z"}]
```

**Depends:** None

`CONTRIBUTING.md` mandates a `.changeset/*.md` for any change to published
`@webpresso/agent-kit` behavior. This blueprint adds a new audit kind
(`blueprint-readme-drift`), changes the `progress_pct` ingest contract, widens
the `_budgets` schema, changes the canonical task-status spelling, and adds
frontmatter validation — all public-behavior changes. Add the changeset (name
pattern per repo precedent, e.g. `.changeset/blueprint-lifecycle-hygiene.md`).

**Files:**

- Create: `.changeset/blueprint-lifecycle-hygiene-enforcement.md`

**Acceptance:**

- [x] Changeset present describing the audit/contract changes at the right semver bump

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | repo typecheck recipe | Zero errors |
| Lint | repo lint recipe (scoped) | Zero violations |
| Tests | repo test recipe (scoped) | All pass |
| Full QA | repo full-QA recipe (`wp_qa`) | All pass |
| Self-audit | `wp audit blueprint-lifecycle` on this repo | Green — **only after Task 0.6 backfill** (A2); not achievable on the raw backlog |
| Mutation | repo mutation recipe | No drop vs baseline (extraction-parity tolerance) |

## Cross-Plan References

| Type | Blueprint / state | Relationship |
| ---- | ----------------- | ------------ |
| **Sequencing** | `in-progress/no-first-party-mjs-audit-rollout` (67%) | **Lands first** — it owns `audit.ts`/`audit-core.ts`/`audit.test.ts`/`server.integration.test.ts`; re-verify this plan's `file:line` citations after it merges. Its overview uses `in_progress`/`pending` → a concrete Task 0.6/2.1 migration target. |
| Disjoint | `planned/2026-06-02-…wp-deploy-orchestrator-toolchain-isolation` | File-disjoint except both add entries to the multi-entry `audit.ts` dispatch (additive, no clash). |
| Disjoint | `~/.claude/plans/for-all-glistening-moon.md` (master) + native-runtime/vitest-launcher plans | No overlap; this plan's work is genuinely net-new. `forbidden-commands.ts` was expanded by `9494eced` — re-read before Task 2.2. |
| Downstream | consumer repos (`ingest-lens`, `edge-matte`) | Inherit the stricter audit on next agent-kit bump; check they don't pin `blueprint-lifecycle-sql` by name before Task 0.1 removes it (A8). Tighter CI once released. |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Rebase/squash changes git mtime | Staleness false positive | Warn-first; git is still better than the self-reported field | 3.1 |
| No `.blueprints.db` in CI | Core checks silently vanish | Build-DB-first or markdown-parity fallback | 0.4 |
| `draft/` intentionally incomplete | Frontmatter/section false positives | Exempt `draft/` from the strict subset | 2.1 |
| `parked/` intentionally idle | Staleness false positive | Exempt `parked/`; optionally require `parked_reason` | 3.1 |
| Worktree copies (`.claude/worktrees`, `.omc`, `.omx`, `_sandbox`) | Duplicate/false matches | Shared skip-list (precedent `no-first-party-mjs.ts:8`) | all walkers |
| Blueprints with progress not expressible as checkboxes (e.g. research) | Derived progress wrong | Keep an opt-in manual-progress escape hatch only if a real case appears (YAGNI) | 0.2 |
| **(F6)** Untracked new blueprint (not yet `git add`ed) | `git ls-files`-based walkers miss it → undercount / missed violation | Count/scan via `readdirSync` (filesystem), reserve git only for mtime/rename history | 1.3, 4.1, all walkers |
| **(F2)** Move done via plain `mv` / editor / out-of-tool git | Bash-guard assist won't fire | Audit-layer history check is the gate (fail-open); Bash-guard is early-warning only | 2.2 |
| **(A1)** Two blueprint files share a filename → same slug → DB PK collision | One silently overwrites the other; all derivations corrupt | De-dupe + `slug-uniqueness` check (hard prerequisite) | 0.0 |
| **(A3)** Activating dead check #4 reddens CI on 49 completed blueprints | CI red before remediation lands | Measure first; skip prose-completed (0-task); warn-first; depend on backfill | 0.2, 0.6 |
| **(A6)** Task `dropped` (de-scoped) never counts toward `done` | Finished blueprint can't reach 100% → deadlock | Terminal = `done ∪ dropped` for completion checks | 0.2, 1.1 |
| **(A5)** Shallow CI clone (no `fetch-depth`) | Transition history absent → gate fails open silently | `fetch-depth: 0`; prefer frontmatter-history over rename detection; documented fail-open | 2.2 |

## Non-goals

- Adopting Astro/remark/`adr-tools`/a kanban tool — the existing `wp audit` +
  `tasks` table + git history are sufficient SSOT.
- Auto-archiving or auto-moving stale blueprints (warn only — "stalebot
  considered harmful": a stale blueprint is still a real plan).
- A configurable per-lane WIP system — one integer budget is enough.
- Rewriting the blueprint DB schema or the MCP tool surface.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| New checks block CI on legitimate edge cases | Contributor friction | Warn-first for staleness/freshness; phased rollout; budget overrides |
| Transition matrix too strict | Blocks valid workflow moves | Matrix decided (deep-interview), incl. `completed → in-progress` reopen; budget-overridable, fail-open |
| Markdown fallback divergence persists | CI weaker than expected | Task 0.4 forces parity-or-build-first decision |
| git dependency for mtime | Fails in non-git contexts | Bounded call + graceful skip (`no-timeout-as-fix.md`) |

## Decisions (resolved 2026-06-03 via deep-interview)

All 9 open questions are answered. The blueprint is now in active execution
from `in-progress/` (pending the execution of Task 0.0 de-dup + Task 0.6 backfill, which the plan
already sequences).

| # | Question | Decision | Affects |
| - | -------- | -------- | ------- |
| 1/9 | WIP cap + README reconciliation (A4) | **Cap = 3**, overridable via budget; **update the README prose** ("at most 3 per lane") so the drift gate stays truthful — do not keep "exactly one". | 1.3, 4.1, README |
| 2 | Staleness scope/threshold | **14 days, `in-progress` only**; `draft/planned/parked/completed/archived` exempt. Warn-first. | 3.1 |
| 3/7 | Transition matrix + fail policy (A5) | Use the matrix but **allow `completed → in-progress` (reopen)**; **fail-open** best-effort + add **`fetch-depth: 0`** to the `wp-audits` CI job. | 2.2 |
| 4 | Manual `progress` frontmatter field | **Drop it — derive-only SSOT** from the `tasks` roll-up. No hand-entered progress field; no divergence check needed. | 0.2, 2.1 |
| 5 | Canonical required-field set (F4) | **`type, title, status, complexity, owner, last_updated`** enforced by all three validators (non-draft). | 2.1 |
| 6 | Terminal-task semantics (A6/C3) | **terminal = `done ∪ dropped`** for completion/`all-done` checks; `progress_pct` displays `done`-only. | 0.2, 0.3, 1.1 |
| 8 | Duplicate `…toolchain-isolation.md` (A1) | **Consolidate to one canonical copy in `completed/`** (its content says shipped) and **delete the duplicate**. | 0.0 |
| — | Task 3.2 (`last_updated` vs git) | **Dropped** — overlaps 2.1's required+audited field; the git-mtime cross-check is the noisier half. | 3.2 (removed) |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Frontmatter validation | zod | repo current | Already used in the audit layer (`_budgets.ts:14`); no new dep |
| Progress / status SSOT | SQLite projection `tasks` table | existing | Trustworthy task roll-up vs self-reported fields |
| Staleness / freshness ground truth | `git log` via bounded `execFileSync` | system git | Tamper-resistant; precedent `no-first-party-mjs.ts` |
| README drift | marker-block + `--check`/`--fix` | n/a | Models doctoc `--dryrun`; reuses existing audit `--fix` pattern |

## Refinement Ledger (plan-refine `fact check`, 2026-06-03)

Phase 1 (technology) + Phase 2 (codebase) of `plan-refine`. Every `file:line`
claim in this blueprint was verified against the actual source. All 7 background
findings confirmed; 8 new findings (F1-F8) surfaced and applied.

| ID | Sev | Claim / assumption | Reality (verified) | Fix applied |
| -- | --- | ------------------ | ------------------ | ----------- |
| F1 | HIGH | Store WIP/staleness thresholds in `_budgets.ts` as `{max}`/`{max_days}` | `budgetEntrySchema` (`_budgets.ts:12`) requires `max_bytes`; `DEFAULT_BUDGETS satisfies Record<…,{max_bytes;suggest_compact_at?}>` (`:22`) — `{max}`/`{max_days}` fails zod + typecheck | Added **Task 0.5** (widen schema); 1.3 & 3.1 now depend on it |
| F2 | HIGH | Add transition matrix to the pretool-guard file validator (`shared/validators/blueprint.ts`) | `validateBlueprint(filePath)` (`:62`) gets one Write/Edit path; `git mv` is a Bash command it never sees | Rewrote Task 2.2: audit-primary (git rename history) + Bash-guard assist; not the file validator |
| F3 | MED | "Converge task-status on hyphen; fix docs-linter" (implied trivial) | docs-linter requires **underscore** `in_progress` (`blueprint-plan.ts:39,367`); DB CHECK (`0001_seed.sql:43`) + parser (`:162`) use **hyphen** — converging is a breaking change | Task 2.1 now includes migrating existing markdown + template in the same task |
| F4 | MED | One frontmatter schema closes the validation gap | Three validators require *different* sets (`runValidate`: type/title/status/complexity/owner; `blueprint.yaml`: type/status/complexity/last_updated; audit: type/status) | Task 2.1 reconciles all three; canonical set added to Open Questions #5 |
| F5 | LOW | `--fix` mirrors `auditBlueprintLifecycle`'s `options.fix` | `auditBlueprintLifecycle` (`:302`) has **no** fix path; the precedent is `auditDocsFrontmatter`/`applyDocsFrontmatterFix` (`:256`/`:670`) | Corrected Task 4.1 citation |
| F6 | MED | Walkers can use git to enumerate blueprints | `no-first-party-mjs` uses `git ls-files` (tracked only); untracked drafts would be invisible | Tasks 1.3/4.1 specify `readdirSync` for counting; git reserved for mtime/rename. Edge-case row added |
| F7 | LOW | Reuse `ACTIVE_BLUEPRINT_STATUSES` for staleness exemptions | It equals `{draft,planned,in-progress,parked}` (`repo-guardrails.ts:102`) — *includes* the states staleness must exempt | Key Decisions + Task 3.1: use a dedicated `STALENESS_SCOPE` |
| F8 | INFO | `complexity` enum unenforced | Already DB-CHECK-constrained at ingest (`0001_seed.sql:6`); markdown check is for *earlier* feedback, not a missing guard | Noted; Task 2.1 framing unchanged (pre-DB feedback still valuable) |

**Confirmed-as-stated (no change needed):** dead `progress_pct` (`ingester.ts:200`);
double-registration (`audit.ts:37-38`/`:109-110`); `blueprint-lifecycle-sql` absent
from `AUDIT_KINDS`; `assertBlueprintCanComplete` only at `blueprint-server.ts:1295`/`:1399`
(transition hole real); markdown fallback weaker (`repo-guardrails.ts:302`);
pretool validator no-op (`shared/validators/blueprint.ts`); docs-linter + `runValidate`
not in CI (`ci.webpresso.yml:152-156` runs only `audit guardrails`);
`completed-requires-all-done` (`blueprint-plan.ts:421`); `sections.required: []`
deliberate (`blueprint.yaml:36`).

### Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 8 (F1-F8) |
| HIGH | 2 (F1, F2) |
| MEDIUM | 3 (F3, F4, F6) |
| LOW/INFO | 3 (F5, F7, F8) |
| Fixes applied | 8/8 |
| Background claims verified | 10/10 confirmed |
| Tasks (was → now) | 12 → 13 (added 0.5) |
| Parallelization score | B (CP>0 on `blueprint-lifecycle-sql.ts` → serialized lane) |
| Critical path | 5 waves |
| Open Questions | 5 (must resolve before `draft → planned`) |
| Phases run | 1 (Technology), 2 (Codebase), 5 (Graph), 6 (Apply) |

**Not yet run (at fact-check time):** Phase 3 + Phase 4 — now completed below.

## Adversarial & Cross-Plan Ledger (plan-refine Phase 3 + 4, 2026-06-03)

Phase 3 (adversarial architecture review, `oh-my-claudecode:critic`) + Phase 4
(cross-plan alignment). Verdict from Phase 3: **REVISE** — strong fact-checking,
but one CRITICAL and several MAJOR design hazards block promotion until resolved.
All applied or routed to Open Questions below.

| ID | Sev | Hazard (verified) | Fix applied |
| -- | --- | ----------------- | ----------- |
| A1 | **CRITICAL** | slug = filename only (`document-paths.ts:48`); `slug` is PK with `ON CONFLICT DO UPDATE` (`ingester.ts:115-119`). Repo **currently** has `…toolchain-isolation.md` in BOTH `in-progress/` and `planned/` → one row silently overwrites the other → all DB-derived checks read corrupt data | Added **Task 0.0** (de-dupe + `slug-uniqueness` check); gates rest of Phase 0. OQ#8 |
| A2 | MAJOR | "self-audit green" gate is unachievable: existing blueprints use `in_progress`/`pending`, lack `last_updated`, parent-roadmaps have 0 tasks | Added **Task 0.6** backfill; self-audit gate now depends on it |
| A3 | MAJOR | Task 0.2 activates dead check #4 → reddens CI on 49 completed blueprints with unchecked boxes | Task 0.2: measure-first + skip prose-completed (0-task) + warn-first; depends on 0.6 |
| A4 | MAJOR | WIP default 3 contradicts README "exactly one per lane"; repo has 2 in-progress now | Task 1.3 reconcile-in-same-change; OQ#9 |
| A5 | MAJOR | `wp-audits` CI checkout has no `fetch-depth` (`ci.webpresso.yml:134`) → shallow clone → transition history absent → gate fails open silently; rename detection also heuristic | Task 2.2: add `fetch-depth: 0`, prefer frontmatter-history over rename, documented fail-open; OQ#7 |
| A6 | MAJOR | `done = total` ignores `dropped`/`blocked` (seed allows `dropped`, `0001_seed.sql:43`) → de-scope deadlock | Tasks 0.2/1.1: terminal = `done ∪ dropped`; OQ#6 |
| A7 | MINOR | Appendix/illustrative `#### Task` blocks inflate `total` | Task 1.1: scope counts to `### Phase N` descendants + fixture |
| A8 | MINOR | Removing `blueprint-lifecycle-sql` may break consumer-repo CI that pins it | Task 0.1: grep must span `ingest-lens`/`edge-matte`; Cross-Plan row |
| A9 | MINOR | README index regeneration → per-PR churn + merge conflicts | Task 4.1: counts-only marker block (6 rows), no per-blueprint rows |
| — | MAJOR (exec) | CI runs `audit guardrails` with no `.blueprints.db` → all new SQL checks **inert in CI** | **Elevated Task 0.4** to a blocker |
| — | MINOR (skeptic) | Task 3.2 (`last_updated` vs git) overlaps the required+audited field from 2.1 and is the noisier check | Task 3.2 flagged as drop/merge candidate |

**Phase 4 cross-plan findings (applied):**
- Premise correction: the audit files were **committed** (`9494eced`), not in-flight; Task 0.1's "add to `AUDIT_KINDS`" sub-goal is already done → re-scoped to the double-dispatch removal only.
- **Sequence after** `in-progress/no-first-party-mjs-audit-rollout` (owns the audit-registration files; 67%); re-verify `file:line` citations after it lands. Cross-Plan row added.
- `forbidden-commands.ts` was expanded by `9494eced` → re-read before Task 2.2.
- **Needs a changeset** (CONTRIBUTING.md) → added **Task 4.2**.
- No conflict with deploy-orchestrator, native-runtime, vitest-launcher, or the `for-all-glistening-moon` master plan (genuinely net-new).

## Codex Independent Review Ledger (`/codex review`, 2026-06-03)

Independent second opinion from the Codex CLI (read-only, verified against source).
Three P1s — **two genuinely new** (C1, C2) that the internal passes missed — plus
three P2s. All applied.

| ID | Sev | Finding (verified against source) | Fix applied |
| -- | --- | --------------------------------- | ----------- |
| C1 | **P1** | CLI and MCP run **different** audits: CLI `audit.ts:37` → SQL; MCP `src/mcp/tools/audit.ts:160-162` → markdown `auditBlueprintLifecycle`. The plan's Product wedge anchor wrongly treated them as one surface — new SQL checks would be invisible to `wp_audit`. | Task 0.1: align MCP dispatch with CLI + parity test. Task 4.1: register the new kind in the MCP switch + description, not just `AUDIT_KINDS` |
| C2 | **P1** | **Dependency cycle** `0.2 → 0.6 → 2.1 → 0.2` (I introduced it: 0.2's body required backfill 0.6, 0.6 deps 2.1, 2.1 deps 0.2). Graph unexecutable. | Task 0.2 decoupled: ships check #4 **warn-only**, `Depends: 0.0` only; 0.6 later promotes it to blocking |
| C3 | **P1** | `terminal = done ∪ dropped` contradicts `assertBlueprintCanComplete:1454` (rejects any non-`done`) and Task 0.3's "any non-done rejected" → preserves the deadlock. `handleFinalize:1370` already allows `dropped`. | Task 0.3: relax `assertBlueprintCanComplete` filter to allow `dropped`; align transition/finalize/promote on the terminal definition |
| C4 | P2 | Parser already normalizes explicit `**Status:** dropped` (`blueprint-db-parser.ts:159`, type at `:32`) — only *checkbox*-derived status omits it. | Tasks 0.2/0.3 tests cover explicit `dropped`, not just checkbox-derived |
| C5 | P2 | Appendix-task exclusion can't be SQL-only: `parseTasks:255` scans all `#### Task` headers with no phase metadata. | Task 1.1: record phase-provenance in the **parser + ingester**, not just the SQL query |
| C6 | P2 | Slug de-dupe via audit is insufficient — ingester upserts by slug (`ingester.ts:114`) and corrupts the projection *before* any audit runs; `scanner.ts:111` dupe-check is state-qualified, so it never sees it. | Task 0.0: also harden the **ingester** to refuse/flag a duplicate DB slug |

Codex also flagged the **highest risk** as "false enforcement coverage" — MCP calls
the markdown audit, CI falls back without DB parity, and duplicate-slug ingestion
corrupts before any audit. This unifies C1 + C6 + the elevated Task 0.4 into one
theme: **make sure the checks actually run on every surface.** Codex agreed Task 3.2
is YAGNI (already flagged drop/merge).

### Final Summary (post Phases 1-6 + codex review)

| Metric | Value |
| ------ | ----- |
| Findings total | 8 fact-check (F1-F8) + 9 adversarial (A1-A9) + 6 codex (C1-C6) + exec/skeptic/cross-plan |
| CRITICAL / P1 | 1 (A1) + 3 codex P1 (C1-C3) |
| Tasks (orig → now) | 12 → 15 (added 0.0, 0.5, 0.6, 4.2; dropped 3.2) |
| Verdict | **IN EXECUTION** — all 9 open questions were resolved via deep-interview (2026-06-03), and the foundation implementation slice is underway. Remaining work is completing the task graph and backfill, not resolving design ambiguity. |
| Highest risk | False enforcement coverage (C1/C6/0.4): a check that's registered but doesn't actually run on the MCP/CI/pre-ingest surface |
| Reviews run | plan-refine Phases 1-6 + `/codex review` + deep-interview — three review passes + decision interview |
