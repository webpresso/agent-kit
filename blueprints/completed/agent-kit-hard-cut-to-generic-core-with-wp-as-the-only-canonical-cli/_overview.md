---
type: blueprint
title: Agent-Kit hard cut to generic core with `wp` as the only canonical CLI
status: completed
complexity: L
owner: agent-kit
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
created: 2026-05-27T00:00:00.000Z
last_updated: 2026-05-29T00:00:00.000Z
progress: >-
  100% (11/11 tasks done; hard-cut surface, downstream verification, docs,
  tarball checks, and breaking-release contract all completed by 2026-05-29)
depends_on: []
tags:
  - public-package
  - hard-cut
  - agent-kit
  - generic-presets
  - pll
---

## Product wedge anchor

- **Stage outcome:** `@webpresso/agent-kit` becomes a separately publishable
  package for any TypeScript repo that bootstraps and maintains built-in agent
  workflows, hooks, and quality guardrails.
- **Consuming surface:** global `wp` CLI plus package subpaths such as
  `@webpresso/agent-kit/vitest/node`, `.../vitest/react`,
  `.../vitest/workers`, `.../stryker`, and `.../workers-test`.
- **New user-visible capability:** a maintainer can install one package and get
  generic TypeScript repo bootstrap + guardrails without inheriting legacy
  dual-brand command surfaces or Webpresso-specific preset baggage.

## Summary

This is a **hard cut** blueprint.

Keep:

- `wp` as the only canonical CLI surface
- generic test/guardrail/preset surfaces in `agent-kit`

Remove:

- `webpresso` bin from `agent-kit`
- branded preset exports:
  - `vitest/webpresso/*`
  - `tsconfig/webpresso*`
  - `stryker/webpresso`

Refactor:

- keep package-import policy in `agent-kit`
- convert Webpresso-specific rule logic into an explicit opt-in profile instead
  of default generic-core behavior

Fact-checked constraints:

| ID | Severity | Finding | Effect |
| --- | --- | --- | --- |
| F1 | CRITICAL | `agent-kit` currently publishes `wp` and `webpresso` bins. | Hard cut must remove `webpresso` from `package.json#bin` while keeping `wp`. |
| F2 | CRITICAL | `ingest-lens` actively uses `wp` and imports generic `@webpresso/agent-kit` preset subpaths. | Generic preset paths stay; `wp` stays canonical. |
| F3 | HIGH | `uplane` actively uses global `wp` workflows but does not import agent-kit subpaths. | Removing `wp` would break a real downstream operational consumer. |
| F4 | HIGH | Branded preset exports (`vitest/webpresso/*`, `tsconfig/webpresso*`, `stryker/webpresso`) do not have the same downstream evidence as the generic canonicals. | Branded preset exports can be removed in the hard cut. |
| F5 | HIGH | `package-import-rules.ts` and `package-imports.ts` currently encode explicit `@webpresso/webpresso` advice. | Generic core must stop defaulting to Webpresso-only policy; move that behavior into an opt-in profile inside `agent-kit`. |
| F6 | MEDIUM | `tsconfig/webpresso.json` currently carries `customConditions: [\"@webpresso/source\"]` and `stryker/webpresso` ignores `/.webpresso/**`. | Those are not generic presets and should not survive as public compatibility aliases in a hard cut. |
| F7 | MEDIUM | Package best practice still favors explicit export maps and clean tarball surfaces. | Every surface removal must be verified by package/export/tarball checks. |

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Canonical CLI | `wp` only | Real downstream repos rely on `wp`; hard-cut removes dual-brand confusion without breaking active consumers. |
| Generic preset canonicals | `vitest/node`, `vitest/react`, `vitest/react-router`, `vitest/workers`, `stryker`, `workers-test`, generic `tsconfig/*` | Real downstream imports prove these are the reusable surfaces. |
| Branded preset fate | Remove completely | No downstream evidence justifies keeping compatibility aliases after a hard cut. |
| Webpresso-specific package policy | Keep in `agent-kit` as explicit opt-in profile | The rule engine belongs in `agent-kit`; only the default generic profile must stop assuming Webpresso. |
| Release posture | Breaking release with no compat shims | User explicitly wants zero legacy/backwards-compat code left. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 | None | 6 agents | XS-S |
| **Wave 1** | 2.1, 2.2, 2.3 | Wave 0 | 3 agents | S |
| **Wave 2** | 3.1, 3.2 | Wave 1 | 2 agents | S-M |
| **Wave 3** | 4.1 | Wave 2 | 1 agent | S |
| **Critical path** | 1.1 → 2.1 → 3.1 → 4.1 | — | 4 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 6 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 11 / 4 = 2.75 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 10 / 11 = 0.91 |
| CP | same-file overlaps per wave | 0 | 0 |

Parallelization score: **A**. Package surface, docs, profile extraction, and
downstream verification are deliberately separated so `/pll` can fill Wave 0
without same-file conflicts.

## Tasks

#### Task 1.1: [contract] Freeze the hard-cut surface matrix

**Status:** done
**Depends:** None
**Size:** XS
**Files:**
- Modify: `blueprints/draft/agent-kit-hard-cut-to-generic-core-with-wp-as-the-only-canonical-cli/_overview.md`

Convert this blueprint into the single source of truth for:

- canonical CLI = `wp`
- canonical generic preset exports
- removed branded exports
- profile-driven package-import policy

**Steps (TDD):**
1. Verify current published bins/exports against `package.json`.
2. Record the keep/remove matrix in this blueprint only.
3. Run docs/blueprint lint for this file.

**Acceptance:**
- [x] Keep/remove matrix is explicit.
- [x] No later task needs to guess whether a surface is canonical or removed.
- [x] Blueprint file passes targeted markdown/docs checks.

#### Task 1.2: [surface] Remove `webpresso` from the public bin contract

**Status:** done
**Depends:** None
**Size:** S
**Files:**
- Modify: `package.json`
- Modify: `src/cli/commands/config.test.ts`
- Modify: any package contract / bundle smoke tests that assert bins

Hard-cut `webpresso` from `agent-kit`’s public bin surface while keeping `wp`
and required `wp-*` operational bins.

**Steps (TDD):**
1. Add a failing contract test that `webpresso` is not present in `package.json#bin`.
2. Verify current package/bin checks fail.
3. Remove the `webpresso` bin entry and update tests/docs accordingly.
4. Re-run targeted package/bin contract checks.

**Acceptance:**
- [x] `package.json#bin` no longer exports `webpresso`.
- [x] `wp` still exists.
- [x] Targeted package contract tests pass.

#### Task 1.3: [exports] Hard-cut branded preset exports

**Status:** done
**Depends:** None
**Size:** S
**Files:**
- Modify: `package.json`
- Modify: export-resolution tests for preset subpaths

Remove:

- `./vitest/webpresso/node`
- `./vitest/webpresso/react`
- `./vitest/webpresso/react-router`
- `./vitest/webpresso/workers`
- `./tsconfig/webpresso`
- `./tsconfig/webpresso.json`
- `./stryker/webpresso`

**Steps (TDD):**
1. Add failing tests that branded paths are absent while canonical generic paths still resolve.
2. Remove the exports from `package.json`.
3. Re-run targeted export-resolution checks.

**Acceptance:**
- [x] Removed branded paths no longer resolve.
- [x] Generic canonical paths still resolve.
- [x] No compatibility aliases remain.

#### Task 1.4: [profiles] Extract generic import-policy defaults

**Status:** done
**Depends:** None
**Size:** S
**Files:**
- Modify: `src/quality-engine/package-import-rules.ts`
- Modify: `src/hooks/pretool-guard/validators/package-imports.ts`
- Create: shared profile module if needed

Keep the package-import rule engine in `agent-kit`, but make the default
profile generic. Webpresso-specific package advice becomes an explicit opt-in
profile in the same package.

**Steps (TDD):**
1. Add failing tests proving default behavior no longer suggests `@webpresso/webpresso/...`.
2. Add failing tests proving Webpresso-specific behavior is still available through an explicit profile.
3. Refactor rule tables/profile wiring with no generic-surface regressions.
4. Re-run targeted rule-engine and validator tests.

**Acceptance:**
- [x] Generic default profile contains no hardcoded Webpresso package advice.
- [x] Webpresso-specific profile still exists and is testable.
- [x] No new package dependency is introduced.

#### Task 1.5: [docs] Rewrite README and preset docs to generic canonicals

**Status:** done
**Depends:** None
**Size:** S
**Files:**
- Modify: `README.md`
- Modify: preset docs / migration docs that still teach branded paths

Docs must present:

- `wp` as the only canonical CLI
- generic preset paths only
- no branded preset paths as current guidance

**Steps (TDD):**
1. Add failing doc assertions/grep checks for removed branded guidance.
2. Rewrite README and preset docs.
3. Re-run targeted docs checks.

**Acceptance:**
- [x] Generic canonicals are the only default documented preset paths.
- [x] `webpresso` bin is not documented as a current `agent-kit` command.
- [x] Targeted docs checks pass.

#### Task 1.6: [tarball] Freeze package-surface and tarball leak checks

**Status:** done
**Depends:** None
**Size:** XS
**Files:**
- Modify: package-surface/tarball tests and config only as needed

Make the package-surface checks prove that:

- no unintended extra package manifests leak
- no framework/package dependency leaked in
- removed exports/bins are absent

**Steps (TDD):**
1. Add or update failing package-surface assertions for the hard-cut contract.
2. Re-run package-surface/tarball checks.

**Acceptance:**
- [x] Tarball/package-surface checks encode the hard-cut contract.
- [x] Removed surfaces are caught if reintroduced later.

#### Task 2.1: [downstream] Verify `ingest-lens` generic preset imports still work

**Status:** done
**Depends:** Task 1.2, Task 1.3, Task 1.4, Task 1.5, Task 1.6
**Size:** S
**Files:**
- Modify: downstream verification notes in this blueprint
- Optionally create/update consumer smoke fixture in this repo

Prove that the downstream generic preset imports still work:

- `@webpresso/agent-kit/vitest/node`
- `@webpresso/agent-kit/vitest/react`
- `@webpresso/agent-kit/vitest/workers`
- `@webpresso/agent-kit/stryker`
- `@webpresso/agent-kit/workers-test`

**Steps (TDD):**
1. Add or refresh a targeted consumer smoke check.
2. Run the generic preset smoke against real `ingest-lens` import patterns.
3. Record evidence in this blueprint.

**Acceptance:**
- [x] `ingest-lens` generic preset imports still resolve.
- [x] No removed branded path is required for the passing smoke.

**Evidence:**
- Real consumer imports are present in `ozby/ingest-lens` for:
  `@webpresso/agent-kit/vitest/node`, `.../vitest/react`,
  `.../vitest/workers`, `.../stryker`, and `.../workers-test`.
- Temporary-manifest consumer smoke resolved all five canonical specifiers via
  Node package resolution:
  `@webpresso/agent-kit/vitest/node`, `.../vitest/react`,
  `.../vitest/workers`, `.../stryker`, `.../workers-test`.
- No `vitest/webpresso/*`, `tsconfig/webpresso*`, or `stryker/webpresso`
  imports were required by the passing smoke.

#### Task 2.2: [downstream] Verify `uplane` global `wp` workflows still work

**Status:** done
**Depends:** Task 1.2, Task 1.5
**Size:** S
**Files:**
- Modify: downstream verification notes in this blueprint

Prove that `uplane` can still use:

- `wp setup`
- `wp audit ...`
- `wp sync`
- `wp config secrets ...`

with no dependency on the removed `webpresso` bin.

**Steps (TDD):**
1. Record the current `uplane` script/doc usage.
2. Run or validate the relevant `wp` command surface assumptions.
3. Record evidence in this blueprint.

**Acceptance:**
- [x] `uplane`’s real `wp` workflow remains valid.
- [x] No `webpresso` bin is needed for those flows.

**Evidence:**
- `ozby/uplane/package.json` keeps `wp setup`, `wp audit docs-frontmatter`,
  and `wp audit blueprint-lifecycle` scripts with no `webpresso` bin usage.
- `ozby/uplane/README.md` and `docs/release.md` document `wp config secrets`,
  `wp setup --yes`, and `WP_SKIP_UPDATE_CHECK=1 wp audit guardrails`.
- Current repo search found no runtime dependency on a removed `webpresso` bin
  for the active `uplane` operational workflow surface.

#### Task 2.3: [cleanup] Remove stale branded references from tests/docs/examples

**Status:** done
**Depends:** Task 1.3, Task 1.5
**Size:** S
**Files:**
- Modify: tests/docs/examples that still mention removed branded preset paths

This task removes residual stale references after the hard-cut surface changes.

**Steps (TDD):**
1. Add failing grep/test coverage for removed branded paths.
2. Rewrite the stale references.
3. Re-run targeted docs/tests.

**Acceptance:**
- [x] Removed branded preset paths no longer appear as current guidance.
- [x] Only intentional historical references remain, if any.

**Evidence:**
- Added regression coverage in `src/config/consolidation-docs.test.ts` to scan
  current guidance docs and reject `vitest/webpresso`, `tsconfig/webpresso`,
  and `stryker/webpresso`.
- Remaining hits are limited to:
  - historical/intentional blueprint records
  - tests asserting those removed exports stay absent
  - unrelated legacy `webpresso` binary wording outside preset guidance

#### Task 3.1: [release] Prepare the breaking-release package contract

**Status:** done
**Depends:** Task 2.1, Task 2.2, Task 2.3
**Size:** S
**Files:**
- Modify: release notes / changelog / package metadata docs only as needed

Prepare the release metadata and changelog for the hard cut:

- `wp` is canonical
- `webpresso` bin removed
- branded preset exports removed
- generic presets preserved

**Steps (TDD):**
1. Add/update release-note assertions if present.
2. Update package release notes/changelog.
3. Re-run targeted docs/package checks.

**Acceptance:**
- [x] Breaking release notes are explicit and correct.
- [x] No release note implies compatibility aliases still exist.

**Evidence:**
- Added `.changeset/agent-kit-hard-cut-generic-core.md` describing the hard cut
  as a breaking contract change on the pre-1.0 release line.
- Release note explicitly records:
  - `wp` is canonical
  - `webpresso` bin removed
  - branded preset exports removed
  - generic canonical presets preserved
- No current release-prep note claims compatibility aliases still exist.

#### Task 3.2: [verify] Run final package-surface and downstream verification

**Status:** done
**Depends:** Task 3.1
**Size:** M
**Files:**
- Modify: blueprint verification notes only

Run the final verification bundle:

- package-surface/tarball checks
- generic preset resolution checks
- downstream `ingest-lens` smoke
- downstream `uplane` workflow validation

**Steps (TDD):**
1. Run all targeted verification commands.
2. Record concrete evidence in the blueprint.
3. If any hard-cut assumption fails, reopen the specific earlier task instead of patching ad hoc.

**Acceptance:**
- [x] Final verification evidence is recorded.
- [x] No legacy/backwards-compat code remains in the public contract.
- [x] Hard-cut release is ready once package publication is approved.

**Evidence:**
- Package/export verification:
  - `src/config/export-resolution.test.ts` passed
  - `src/audit/package-surface.test.ts` passed
- Docs/build verification:
  - `npm run build` passed
  - `./bin/docs-lint.js ...` passed
  - `src/config/consolidation-docs.test.ts` passed
  - `src/config/docs-lint/docs-lint-cli-parity.test.ts` passed
- Blueprint governance:
  - `./bin/wp.js blueprint audit --all --strict` passed
- Downstream verification:
  - `ingest-lens` real imports confirmed for `@webpresso/agent-kit/vitest/node`,
    `.../vitest/react`, `.../vitest/workers`, `.../stryker`, and
    `.../workers-test`
  - temporary-manifest consumer smoke resolved those same canonical specifiers
  - `uplane` operational scripts/docs confirmed on `wp setup`, `wp audit ...`,
    and `wp config secrets ...` with no `webpresso` bin requirement
- Hygiene:
  - `git diff --check` passed

## Edge cases

| ID | Edge case | Mitigation | Task |
| --- | --- | --- | --- |
| E1 | Downstream repo still uses `webpresso` bin from `agent-kit` | Keep `wp` canonical and prove `uplane` does not need `webpresso` | 1.2, 2.2 |
| E2 | Downstream repo silently relies on branded preset aliases | Hard-cut branded exports only after `ingest-lens` generic import smoke passes | 1.3, 2.1 |
| E3 | Generic core still suggests `@webpresso/webpresso/...` in validators | Default profile must be generic; Webpresso profile explicit | 1.4 |
| E4 | Docs still teach removed paths after package changes | Add stale-reference checks and rewrite docs in the same batch | 1.5, 2.3 |
| E5 | Tarball still leaks removed/publicly confusing surfaces | Encode the hard-cut contract in package-surface checks | 1.6, 3.2 |

## Risks

| ID | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R1 | Removing `webpresso` bin breaks real downstream usage | CRITICAL | Fact-checked assumption is that downstream global operational surface is `wp`; verify `uplane` before release | 1.2, 2.2 |
| R2 | Removing branded preset exports breaks consumers that were not scanned | HIGH | Require downstream smoke and stale-reference checks before release | 1.3, 2.1, 2.3 |
| R3 | Generic core still contains Webpresso-specific package advice | HIGH | Split default profile vs explicit Webpresso profile inside `agent-kit` | 1.4 |
| R4 | Hard-cut release notes understate the breaking changes | HIGH | Explicit breaking-release contract and final verification notes | 3.1, 3.2 |

## Technology choices

| Component | Choice | Why |
| --- | --- | --- |
| CLI surface | `wp` only | Real downstream use exists; removes dual-brand confusion without preserving unnecessary aliasing. |
| Generic presets | keep neutral canonicals only | Real downstream imports prove value. |
| Branded presets | remove | No downstream evidence justifies keeping compatibility code after hard-cut. |
| Import policy engine | keep in `agent-kit`, but profile-driven | Engine is generic; Webpresso package advice is not. |

## Refinement Summary

| Metric | Value |
| --- | --- |
| Findings total | 7 |
| Critical | 2 |
| High | 3 |
| Medium | 2 |
| Low | 0 |
| Fixes applied | 7/7 in blueprint design |
| Cross-plans updated | 0 |
| Edge cases documented | 5 |
| Risks documented | 4 |
| **Parallelization score** | A |
| **Critical path** | 4 waves |
| **Max parallel agents** | 6 |
| **Total tasks** | 11 |
| **Blueprint compliant** | 11/11 |
## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

