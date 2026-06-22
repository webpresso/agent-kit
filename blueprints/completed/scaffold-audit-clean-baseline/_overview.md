---
type: blueprint
title: "Scaffold an Audit-Clean Baseline"
owner: agent-kit
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
status: completed
complexity: M
created: '2026-04-25'
last_updated: '2026-05-06'
progress: '100% (completed 2026-05-06; audit-clean baseline narrowed, shipped, and verified against current setup/doctor surfaces)'
depends_on: []
tags:
  - agent-kit
  - scaffolder
  - audit
  - dogfooding
  - dx
---

# Scaffold an Audit-Clean Baseline
## Product wedge anchor

- **Stage outcome:** the completed Scaffold an Audit-Clean Baseline work remains truthfully represented in the blueprint lifecycle and continues to describe the shipped outcome of this lane.
- **Consuming surface:** the repo-local agent-kit surfaces and docs touched by this completed lane.
- **New user-visible capability:** none new in this cleanup pass; the capability shipped already, and this blueprint now stays structurally valid as a completed record.


**Goal:** Make `wp setup` leave a consumer repo at an audit-clean baseline without manual cleanup, and tighten the remaining gaps between setup, audits, and post-install diagnostics.

## Status snapshot — current repo reality (2026-05-06)

This blueprint was drafted before several setup/tooling slices landed. It should now be treated as a **remaining-gaps cleanup blueprint**, not a net-new umbrella initiative.

### Already landed / no longer primary scope

- **Blueprint lifecycle audits include `draft/`.** Landed in `src/audit/repo-guardrails.ts` (`DEFAULT_BLUEPRINT_STATUSES` includes `draft`) with regression coverage in `src/audit/repo-guardrails.test.ts`.
- **OMX + gstack setup chaining already exists.** `src/cli/commands/init/index.ts` now ships presets for `omx` and `gstack`, and they are in `DEFAULT_PRESETS`.
- **RTK setup/doctor slice also landed elsewhere.** `rtk` preset, `.agent/.rtk-requested` marker, and `runHooksDoctor()` RTK row are already implemented; that work belongs to `blueprints/completed/integrate-rtk-as-peer-plugin/_overview.md`.
- **Dry-run guardrails are substantially in place.** `runInit()` passes `dryRun` through scaffolders; dedicated dry-run coverage exists in `src/cli/commands/init/init.integration.test.ts`, `init.presets.test.ts`, merge tests, and individual scaffolder tests.
- **Claude plugin hint exists, but in a newer form.** `wp setup` now prints a `claude --plugin-dir ...` hint, not the older `claude install-plugin @webpresso/agent-kit` wording from this draft.
- **Top-level `wp doctor` did not land.** Current shipped surface is still **`wp hooks doctor`**, not an audit-layer umbrella command.

### Stale assumptions in the original draft

- The blueprint's **Task 1.1** and **Task 4.1** are stale as written; those slices are already merged.
- The old toolchain plan for **`bun` / `vp` / `--all-tools`** is stale. Current setup presets are `gstack`, `lore-commits`, `omx`, `playwright-mcp`, `rtk`, and `vision`.
- The old idea that OMX should be a tracer-bullet follow-up is stale; OMX setup is now default-on via `DEFAULT_PRESETS`.
- The older Claude install UX is stale relative to the repo's plugin-dir/marketplace direction.

## Why this blueprint still matters

The original dogfood problem statement still holds in narrower form:

1. **`wp setup` should remediate more of what `wp audit *` later complains about.**
2. **Single-package consumers should not need fake workspace/catalog surfaces just to appease audits.**
3. **Setup should converge cleanly on rerun.**
4. **Audit and doctor surfaces are still split:** repo audits live under `wp audit ...`; post-install hook/plugin verification lives under `wp hooks doctor`.

## Refined scope

### 1) Finish the audit-clean baseline gaps

#### A. Single-package `catalog-drift` should pass cleanly

Current `auditCatalogDrift()` returns success when `pnpm-workspace.yaml` is missing, but the original motivation should be re-verified against current lifecycle expectations and messaging. The remaining gap is **product clarity + regression locking**, not the original hard failure.

Refined target:

- Preserve current pass behavior for repos with **no** `pnpm-workspace.yaml`.
- Add/confirm explicit test coverage that this is an intentional **single-package/no-workspace** pass path.
- If the output is ambiguous, improve wording at the CLI layer rather than reintroducing a failure.

#### B. Docs-frontmatter still needs a real remediation path

This remains the largest unresolved user-facing gap from the original dogfood pass.

Target behavior:

- Add a **safe, idempotent fixer** for missing docs frontmatter on existing docs.
- Prefer `wp audit docs-frontmatter --fix` (or equivalent CLI affordance) over hidden setup mutation.
- `wp setup` may optionally chain the fixer, but only via an explicit, documented path.
- Never overwrite existing frontmatter.

#### C. Setup reruns should converge without churn

This blueprint still owns the convergence/idempotency cleanup:

- Re-check whether any tracked config still churns on rerun. (`lastInit` timestamp churn has been removed; the current narrowed rerun diff is `.claude/settings.json`.)
- Re-check whether repeated `.new` sidecars still accumulate for expected consumer-customized files.
- Re-check whether any scaffolded catalog/workspace content still fights later cleanup passes.

### 2) Unify audit remediation discoverability

The original `wp doctor` concept is still valid, but should now be reframed as:

- **Do not replace `wp hooks doctor`.** Keep it as the plugin/hook health verifier.
- Add a new **audit-layer aggregator** only if it clearly composes with the existing hooks doctor and does not duplicate its logic.
- The minimum acceptable outcome may be a thinner surface than the original draft: e.g. a command that runs selected repo audits and prints remediation hints, while deferring hook/plugin health to `wp hooks doctor`.

### 3) Keep toolchain/setup scope narrow

OMX/gstack/rtk/setup chaining is **not** the main work here anymore.

For this blueprint, toolchain/setup follow-up scope is limited to:

- documenting any remaining convergence issues caused by default presets,
- confirming dry-run behavior stays correct as presets evolve,
- avoiding duplicate work already tracked by completed OMX/RTK/plugin blueprints.

`bun`, `vp`, and any broad "install every sister tool" expansion are **not current blueprint scope** unless repo evidence reopens them in a separate plan.

## Out of scope

- Re-implementing OMX, gstack, or RTK scaffolders already shipped elsewhere.
- Replacing `wp hooks doctor` with a different hook/plugin health system.
- New toolchain preset expansion for `bun`, `vp`, or a revived `--all-tools` umbrella.
- Plugin marketplace / install-flow redesign already covered by completed Claude-plugin work.
- New audit categories unrelated to the audit-clean baseline.

## Tasks (updated)

#### [agent-kit] Task 1.1: Keep `draft/` lifecycle coverage documented here, but no code work

**Status:** done

**Why retained:** historical dependency marker only; this blueprint should not reopen it.

**Acceptance:**

- [x] This historical dependency marker remains documented without reopening already-landed `draft/` lifecycle support.

**Evidence (2026-05-06):** `src/audit/repo-guardrails.ts` includes `draft` in `DEFAULT_BLUEPRINT_STATUSES`; draft coverage exists in `src/audit/repo-guardrails.test.ts`.

#### [agent-kit] Task 1.2: Lock intentional single-package `catalog-drift` behavior

**Status:** done

**Depends:** None

Shift from "make it stop failing" to "prove and communicate the intended pass path."

**Files:**

- Modify: `src/audit/repo-guardrails.ts` or CLI formatting layer if wording is unclear
- Modify: catalog-drift tests under `src/audit/`

**Acceptance:**

- [x] Missing `pnpm-workspace.yaml` in a single-package repo is explicitly covered by tests.
- [x] Workspace repos still enforce catalog drift normally.
- [x] User-facing output makes the skip/pass reason obvious if current messaging is too implicit.

**Evidence (2026-05-06):** `auditCatalogDrift()` now returns `Catalog drift — single package (no workspace file)` for repos without `pnpm-workspace.yaml`; `src/audit/repo-guardrails.test.ts` asserts the wording; `pnpm exec vitest run src/audit/repo-guardrails.test.ts --reporter=dot` passed (104 tests), and `pnpm run typecheck` passed.

#### [agent-kit] Task 2.1: Add an idempotent docs-frontmatter fixer

**Status:** done

**Depends:** None

This remains the core unfinished remediation path from the original dogfood pass.

**Files:**

- Modify: docs-frontmatter audit implementation
- Modify: audit CLI surface
- Create/modify: docs-frontmatter fixer tests

**Acceptance:**

- [x] Existing frontmatter is never overwritten.
- [x] Missing docs receive valid frontmatter in fix mode.
- [x] Fix mode is idempotent.
- [x] The remediation path is discoverable from audit output.

**Evidence (2026-05-06):** `auditDocsFrontmatter()` now accepts `fix: true` and safely inserts missing `type` / `last_updated` fields without overwriting existing frontmatter; `src/audit/repo-guardrails.test.ts` has bare-doc, partial-frontmatter, and idempotency coverage; `pnpm exec vitest run src/audit/repo-guardrails.test.ts --reporter=dot` passed (107 tests), and `pnpm run typecheck` passed.

#### [agent-kit] Task 2.2: Re-verify true `wp setup --dry-run`; fix only if a remaining leak is found

**Status:** done

**Depends:** None

This task should now start with repo verification, not assumption. Current tests suggest the original bug is already fixed.

**Files (only if reopened by evidence):**

- Modify: `src/cli/commands/init/index.ts`
- Modify: init command tests

**Acceptance:**

- [x] If a dry-run leak still exists, it is reproduced by a focused regression test first.
- [x] No files/directories are created in dry-run.
- [x] External preset installers do not spawn in dry-run.

**Evidence (2026-05-06):** a remaining dry-run leak was confirmed in `scaffoldAgentHooks() -> ensureGstackHooks()` creating `.claude/hooks/`; the leak is now fixed by guarding `ensureGstackHooks()` with `options.dryRun`; `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts` now covers dry-run directly, and `src/cli/commands/init/init.integration.test.ts` asserts `.claude/hooks` is absent after `runInit({ 'dry-run': true })`; `pnpm exec vitest run src/cli/commands/init/scaffolders/agent-hooks/index.test.ts src/cli/commands/init/init.integration.test.ts src/cli/commands/init/init.presets.test.ts --reporter=dot` passed (34 tests), and `pnpm run typecheck` passed.

#### [agent-kit] Task 2.3: Make setup reruns converge cleanly

**Status:** done

**Depends:** Task 2.2 only if new dry-run regressions are found

**Files:**

- Modify: `src/cli/commands/init/index.ts`
- Modify: init scaffold/merge helpers
- Modify: init idempotency tests

**Acceptance:**

- [x] Second setup run is clean or clearly limited to intentional state.
- [x] No repeated `.new` sidecar storm for stable consumer customizations.
- [x] No avoidable tracked-file churn remains on second run.

**Evidence (2026-05-06):** `.agent-kitrc.json` no longer churns because `runInit()` stopped rewriting `lastInit`; a remaining rerun diff in `.claude/settings.json` was narrowed to nondeterministic Stop-hook ordering and fixed by making `ak-stop-qa` sort after skill-managed Stop hooks; `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts` now covers second-run preservation of the `verify` Stop hook; `src/cli/commands/init/init.integration.test.ts` now proves the second `runInit()` result reaches `overwritten: 0` with `identical: 106`; `pnpm exec vitest run src/cli/commands/init/scaffolders/agent-hooks/index.test.ts src/cli/commands/init/init.integration.test.ts --reporter=dot` passed (18 tests), and `pnpm run typecheck` passed.

#### [agent-kit] Task 3.1: Design a repo-audit aggregator that composes with `wp hooks doctor`

**Status:** done

**Depends:** Tasks 1.2, 2.1

Reframe the old top-level `wp doctor` idea around the repo's current doctor surface.

**Files:**

- Create: new audit/doctor command only if warranted
- Modify: CLI routing as needed
- Modify: focused tests

**Acceptance:**

- [x] Repo audits can be run from one discoverable surface with remediation hints.
- [x] `wp hooks doctor` remains intact for plugin/hook health.
- [x] Command naming/help makes the split between repo audits and hook/plugin checks obvious.

**Evidence (2026-05-06):** added `src/cli/commands/doctor.ts` + `doctor.test.ts`, registered `doctor` in `src/cli/cli.ts`, and surfaced it in `README.md`; `wp doctor` now runs `catalog-drift`, `docs-frontmatter`, and `blueprint-lifecycle`, prints remediation hints, supports safe `--fix` for docs frontmatter, and explicitly defers hook/plugin health to `wp hooks doctor`; `pnpm exec vitest run src/cli/commands/doctor.test.ts src/cli/cli.test.ts --reporter=dot` passed, and `pnpm run typecheck` passed.

#### [agent-kit] Task 4.1: Mark legacy OMX/gstack tracer-bullet work as complete/stale

**Status:** done

**Why retained:** prevents duplicate implementation. OMX/gstack preset work already lives in `src/cli/commands/init/index.ts`; RTK extension already landed in the completed RTK blueprint.

**Acceptance:**

- [x] Legacy OMX/gstack tracer-bullet scope is explicitly marked complete/stale so it does not re-enter the active backlog.

#### [agent-kit] Task 5.1: Reconcile Claude setup guidance with current plugin-dir flow

**Status:** done

**Depends:** Task 3.1 optional

The old `claude install-plugin @webpresso/agent-kit` wording is stale. This task is now about making the **current** hint accurate and discoverable across setup/docs/doctor surfaces.

**Files:**

- Modify: `src/cli/commands/init/index.ts`
- Modify: related docs/doctor/help surfaces if needed

**Acceptance:**

- [x] Setup prints one accurate Claude plugin registration hint.
- [x] Wording matches the current plugin-dir / marketplace flow actually supported by the repo.
- [x] No obsolete install command is reintroduced.

**Evidence (2026-05-06):** `src/cli/commands/init/index.ts` now prints the `claude --plugin-dir <repo>/node_modules/@webpresso/agent-kit` hint plus a marketplace note; `README.md` documents both the per-session `--plugin-dir` flow and the persistent marketplace flow; no remaining `claude install-plugin @webpresso/agent-kit` wording exists in the checked setup/docs surfaces.

#### [agent-kit] Task 6.1: End-to-end audit-clean baseline verification

**Status:** done

**Depends:** Tasks 2.1, 2.3, 3.1, 5.1

**Files:**

- Create/modify: focused e2e or integration coverage
- Create/modify: fixtures as needed

**Acceptance:**

- [x] Fresh setup reaches the intended baseline without manual edits.
- [x] Re-run convergence is covered.
- [x] Audit/doctor remediation guidance matches the actual shipped command surfaces.

**Evidence (2026-05-06):** fresh-setup, dry-run, and rerun-convergence coverage live in `src/cli/commands/init/init.integration.test.ts` and `init.presets.test.ts`; direct repo-audit remediation coverage lives in `src/cli/commands/doctor.test.ts`; `scaffoldAgentHooks()` dry-run and second-run convergence are locked by `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts`; focused verification passed via `pnpm exec vitest run src/cli/commands/init/scaffolders/agent-hooks/index.test.ts src/cli/commands/init/init.integration.test.ts src/cli/commands/init/init.presets.test.ts src/cli/commands/doctor.test.ts src/cli/cli.test.ts --reporter=dot`, and `pnpm run typecheck` passed.

## Quick Reference (updated waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| --- | --- | --- | --- | --- |
| Wave 0 | 1.2, 2.1, 2.2 | None | yes | S-M |
| Wave 1 | 2.3, 3.1, 5.1 | Wave 0 subset | yes | S-M |
| Wave 2 | 6.1 | Tasks 2.1, 2.3, 3.1 | limited | M |

Critical path now: **2.1 -> 2.3 -> 6.1**, with doctor/guidance work parallel after the baseline remediation path is defined.

## Verification gates (updated)

- `wp audit docs-frontmatter` on a seeded legacy-doc repo exposes a one-command remediation path.
- `wp setup` on a fresh repo reaches the intended baseline without manual edits that setup/audit should own.
- `wp setup` rerun is convergent: no avoidable `.new` storm, no timestamp-only churn.
- `wp hooks doctor` continues to verify plugin/hook health.
- If a new repo-audit doctor/aggregator lands, it clearly complements rather than replaces `wp hooks doctor`.
- `wp setup --dry-run` remains write-free and spawn-free.

## Related

- Original trigger: dogfood pass on 2026-04-25 (`webpresso/agent-kit` commit `8eb6c8a`)
- Completed sibling with overlapping setup/toolchain work: `blueprints/completed/integrate-rtk-as-peer-plugin/_overview.md`
- Completed sibling for plugin/install-flow evolution: `blueprints/completed/agent-kit-claude-plugin-marketplace/_overview.md`
- Completed sibling for hook/plugin doctor surface: `blueprints/completed/ak-hooks-doctor-post-install-verification-skill-for-plugin-hook-health/_overview.md`
- Related planned work: `blueprints/planned/promote-parent-roadmaps/_overview.md`
## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/scaffold-audit-clean-baseline/_overview.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
