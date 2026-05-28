---
type: blueprint
status: in-progress
complexity: M
created: '2026-05-12'
last_updated: '2026-05-28'
progress: '100% (hardcut pivot applied on 2026-05-28; release contract locked to @webpresso/agent-kit with no legacy cutover shim)'
depends_on: []
tags:
  - consolidation
  - dx
  - package-design
---

# Consolidate `@webpresso/agent-*` sub-packages into `@webpresso/agent-kit` subpath exports

**Goal:** consumers replace 6–8 pinned `@webpresso/agent-*` devDependencies with
one install: `@webpresso/agent-kit`. Configs, presets, runtime helpers, and
docs-lint APIs are exposed as `@webpresso/agent-kit/*` subpaths while existing
hook bins and `wp_*` MCP tool routing remain unchanged.

This plan is a **prep + release-gate** blueprint:

- **ready lane:** source folds, tests, docs, manifest/package-surface validation.
- **prep-only lane:** final deprecated package metadata and migration guidance.
- **sibling repo lane:** consumer proof in a separate repo/PR; do not edit a
  sibling repo from this blueprint unless the operator explicitly checks it out.
- **release gate:** release-contract lock and evidence updates after QA passes.

## Verified Context

| Claim | Verification | Blueprint impact |
| --- | --- | --- |
| Canonical package identity is `@webpresso/agent-kit` | Root `package.json` name is `@webpresso/agent-kit`; README/getting-started install path also points to `@webpresso/agent-kit`. | Keep one package identity; do not route this blueprint through unscoped `webpresso` cutover assumptions. |
| Release workflow publishes scoped package from repo root | `.github/workflows/release.yml` publishes via `pnpm publish --no-git-checks` with GitHub Packages scope wiring. | Keep release gate aligned to current package/release contract; verify package surface with `npm pack --dry-run`. |
| `@webpresso/agent-*` packages exist locally | 9 packages live under `packages/agent-*`; `agent-vitest`, `agent-stryker`, `agent-oxlint`, and `agent-tsconfig` are not uniformly `src/`-based. | Each fold task names its source layout; do not assume a `src/` directory exists. |
| TypeScript config inheritance from packages is supported, but JSON config files must be physically present for the target path. | TypeScript docs describe `extends` resolving package configs from `node_modules`; TS module docs separately scope `exports` handling to module resolution. | Ship literal `src/config/tsconfig/*.json` files and verify staged-package filesystem paths. Do not rely on `package.json#exports` alone for `tsconfig extends`. |
| Oxlint package-based shared config requires `oxlint.config.ts`. | Oxlint docs say `.oxlintrc.json` extends paths are relative and package imports are not supported there; TypeScript config files support imported config objects and require Node v22.18+ or v24+. | Migrate consumers from `.oxlintrc.json` to `oxlint.config.ts`; repo already requires Node `>=24`. |
| `npm deprecate` is registry state, not a workspace file-only change. | npm docs specify `npm deprecate <package-spec> <message>`, owner permission, and note the command is unaware of workspaces. | Split deprecated metadata prep from the final credential-gated registry deprecation gate. |
| Prior public-npm `webpresso` cutover assumptions are stale for this hardcut | Current repo state no longer includes a local `scripts/publish-webpresso.ts` surface; release/docs are converging on `@webpresso/agent-kit` as the single package contract. | Replace the old cutover gate with a release-contract lock task (docs/rules/workflow parity evidence). |

Sources checked: TypeScript docs via Context7, Oxlint config docs, Node package
exports docs, npm deprecate docs, local `package.json`, release workflow, and
package source layouts.

## Architecture Overview

```text
BEFORE (consumer)                         AFTER (consumer)
──────────────────────────────────────    ────────────────────────────────────
devDependencies:                          devDependencies:
  @webpresso/agent-tsconfig                 @webpresso/agent-kit
  @webpresso/agent-vitest
  @webpresso/agent-stryker                 tsconfig.json:
  @webpresso/agent-oxlint                    "extends": "@webpresso/agent-kit/tsconfig/base.json"
  @webpresso/agent-workers-test
  @webpresso/agent-docs-lint               vitest.config.ts:
                                             import { nodeConfig } from
                                               "@webpresso/agent-kit/vitest/node"
tsconfig.json:
  "extends":                               oxlint.config.ts:
    "@webpresso/agent-tsconfig/base.json"    import { config } from "@webpresso/agent-kit/oxlint"

vitest.config.ts:                          stryker.config.ts:
  import { nodeConfig } from                 import base from "@webpresso/agent-kit/stryker"
    "@webpresso/agent-vitest/node"
                                           workers tests:
.oxlintrc.json                               import { BaseWorkerEnv } from
  package imports unsupported                  "@webpresso/agent-kit/workers-test"
```

## Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Package source | Continue editing repo-root `@webpresso/agent-kit` and keep it as the canonical release package identity. | Hardcut decision favors role clarity and removes dual package identity drift. |
| `tsconfig` delivery | Copy literal JSON files into `src/config/tsconfig/*.json`; include them in packed files and optionally expose `./tsconfig/*`. | `tsconfig extends` must work from physical package paths. |
| Config/runtime folds | Copy source into root `src/config/*`; avoid `../../packages/*` re-export shims. | New code must not introduce parent-relative imports, and archived sub-packages must not remain runtime dependencies. |
| Manifest integration | One task owns root `package.json`, `package.json#tshy.exports`, `package.json#exports`, `files`, `bin`, and `tsconfig.json` aliases. | Prevents same-file conflicts in parallel Wave 0 tasks. |
| Oxlint migration | Consumers move from `.oxlintrc.json` to `oxlint.config.ts`. | Package imports are supported in the TypeScript config form, not JSON extends. |
| Sub-package lifecycle | Keep sub-packages installable, publish one final notice version, then run `npm deprecate` in the release gate. | Avoids breaking old consumers and keeps irreversible registry operations isolated. |
| Consumer proof | Treat `ozby/ingest-lens` or another dogfood consumer as a sibling repo PR. | This repo can prepare the recipe; sibling repos are referenced, not silently edited. |

## Refinement Findings

| ID | Severity | Finding | Applied fix |
| --- | --- | --- | --- |
| F1 | HIGH | Original Wave 0 had multiple tasks modifying `package.json`, causing parallel file conflicts. | Centralized manifest/export/bin work in Task 2.6. |
| F2 | HIGH | Original examples used `../../packages/*` re-export shims, violating the no-parent-relative-import convention and keeping archived packages on the runtime path. | Fold source or inline config; use package-local `#` aliases if imports are needed. |
| F3 | HIGH | Original plan mixed reversible prep with publish/deprecation release operations. | Split prep tasks from Task 4.2 release gate. |
| F4 | HIGH | `agent-vitest`, `agent-stryker`, `agent-oxlint`, and `agent-tsconfig` source layouts differ; not all have `src/`. | Each task names exact source package layout and parity checks. |
| F5 | MEDIUM | `ingest-lens` was not present locally during refinement. | Consumer migration is a sibling repo lane with a generated checklist and external PR proof. |
| F6 | MEDIUM | Docs-lint is large (~12k source lines); one coarse task would be hard to review. | Split docs-lint into API/schema fold and CLI/template fold. |
| F7 | MEDIUM | `tsconfig extends` and `package.json#exports` claims needed sharper wording. | Plan now requires literal filesystem JSON plus a fixture against `@webpresso/agent-kit` packed output. |
| F8 | MEDIUM | `npm deprecate` cannot be represented solely by a package file diff. | Add explicit registry deprecation release step with owner/OTP requirements. |
| F9 | HIGH | Legacy cutover assumptions can survive after package-identity decisions changed. | Replace the old public-npm cutover gate with a hardcut release-contract lock task and explicit docs/rules evidence. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5 | None | 10 agents | XS-S |
| **Wave 1** | 2.6 | Wave 0 source/config folds except 1.5 | 1 agent | S |
| **Wave 2** | 3.1, 3.2, 3.3 | 2.6 | 3 agents | XS-S |
| **Wave 3** | 4.1 | 1.5, 3.1, 3.2, 3.3 | 1 agent | S |
| **Wave 4** | 4.2 | 4.1 | 1 operator | XS release gate |
| **Critical path** | Wave 0 fold → 2.6 → 3.x proof/prep → 4.1 → 4.2 | — | 5 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 10 |
| CPR | total tasks / critical path length | ≥ 2.5 | 16 / 5 = 3.2 |
| DD | dependency edges / total tasks | ≤ 2.0 | 17 / 16 = 1.06 |
| CP | same-file overlaps per wave | 0 | 0 |

**Parallelization score:** A. The manifest fan-in is intentional and isolated in
Task 2.6 to avoid `package.json` contention.

---

## Phase 1: Config package folds [Complexity: S]

#### [config] Task 1.1: Fold `@webpresso/agent-tsconfig`

**Status:** done

**Depends:** None

Copy the six published JSON config files from `packages/agent-tsconfig/` into
literal package paths under `src/config/tsconfig/`. This task does not edit the
manifest; Task 2.6 owns `package.json` and staged publish validation.

**Files:**

- Create: `src/config/tsconfig/base.json`
- Create: `src/config/tsconfig/cloudflare.json`
- Create: `src/config/tsconfig/library.json`
- Create: `src/config/tsconfig/react-library.json`
- Create: `src/config/tsconfig/react-router.json`
- Create: `src/config/tsconfig/webpresso.json`
- Create: `src/config/tsconfig/tsconfig-parity.test.ts`

**Steps (TDD):**

1. Write a failing parity test that byte-compares each new JSON file with its
   source in `packages/agent-tsconfig/`.
2. Run `wp_test` scoped to `src/config/tsconfig/tsconfig-parity.test.ts` — verify FAIL.
3. Copy the JSON files without semantic edits.
4. Run `wp_test` scoped to `src/config/tsconfig/tsconfig-parity.test.ts` — verify PASS.
5. Refactor only if needed; preserve byte parity.
6. Run `wp_lint` and `wp_typecheck` for the changed files.

**Acceptance:**

- [x] Six JSON configs exist at literal `src/config/tsconfig/*.json` paths.
- [x] Parity test proves byte-identical content against `packages/agent-tsconfig/`.
- [x] No `package.json` edit in this task.
- [x] `wp_lint` and `wp_typecheck` pass for changed files.
#### [config] Task 1.2: Fold `@webpresso/agent-vitest`

**Status:** done

**Depends:** None

Fold the `agent-vitest` package root files into `src/config/vitest/`. This
package does not use a `src/` directory; source files live at package root.
Preserve existing exports such as `node`, `react`, `react-router`, `workers`,
`react-setup`, and `flakiness-reporter`. Branded `vitest/webpresso/*` aliases
are intentionally removed in the hardcut package contract. Do not implement
this as a parent-relative re-export into `packages/`.

**Files:**

- Create: `src/config/vitest/node.ts`
- Create: `src/config/vitest/react.ts`
- Create: `src/config/vitest/react-router.ts`
- Create: `src/config/vitest/workers.ts`
- Create: `src/config/vitest/react-setup.ts`
- Create: `src/config/vitest/flakiness-reporter.ts`
- Create: `src/config/vitest/version-guard.ts`
- Create: `src/config/vitest/vitest-parity.test.ts`

**Steps (TDD):**

1. Write failing tests that import the new local modules and compare key exports
   with `packages/agent-vitest/*`.
2. Run `wp_test` scoped to `src/config/vitest/vitest-parity.test.ts` — verify FAIL.
3. Copy/fold the package root source files, updating only import paths needed
   for the new root package.
4. Run the scoped `wp_test` — verify PASS.
5. Refactor to use package-local aliases instead of parent-relative imports.
6. Run `wp_lint` and `wp_typecheck` for changed files.

**Acceptance:**

- [x] All current `@webpresso/agent-vitest` subpath behaviors have local equivalents.
- [x] New files do not import from `../../packages/*`.
- [x] Parity tests pass.
- [x] `wp_lint` and `wp_typecheck` pass for changed files.
#### [config] Task 1.3: Fold `@webpresso/agent-stryker`

**Status:** done

**Depends:** None

Fold the Stryker base and webpresso configs into `src/config/stryker/`, keeping
default export behavior compatible with current consumers.

**Files:**

- Create: `src/config/stryker/index.ts`
- Create: `src/config/stryker/webpresso.ts`
- Create: `src/config/stryker/stryker-parity.test.ts`

**Steps (TDD):**

1. Write failing tests that import `src/config/stryker/index.ts` and
   `src/config/stryker/webpresso.ts` and compare normalized config output with
   `packages/agent-stryker/`.
2. Run `wp_test` scoped to `src/config/stryker/stryker-parity.test.ts` — verify FAIL.
3. Fold the config source without changing Stryker semantics.
4. Run the scoped `wp_test` — verify PASS.
5. Remove parent-relative imports introduced during the fold.
6. Run `wp_lint` and `wp_typecheck` for changed files.

**Acceptance:**

- [x] `@webpresso/agent-kit/stryker` maps former `@webpresso/agent-stryker` usage; branded `stryker/webpresso` alias is intentionally absent.
- [x] Parity tests pass.
- [x] `wp_lint` and `wp_typecheck` pass for changed files.
#### [config] Task 1.4: Fold `@webpresso/agent-oxlint`

**Status:** done

**Depends:** None

Fold the Oxlint config/plugin modules into `src/config/oxlint/`. The consumer
API must be usable from `oxlint.config.ts` by importing config objects from
`@webpresso/agent-kit/oxlint`; `.oxlintrc.json` package imports are out of
scope.

**Files:**

- Create: `src/config/oxlint/index.ts`
- Create: `src/config/oxlint/import-hygiene.ts`
- Create: `src/config/oxlint/monorepo-paths.ts`
- Create: `src/config/oxlint/foundation-purity.ts`
- Create: `src/config/oxlint/tier-boundaries.ts`
- Create: `src/config/oxlint/query-patterns.ts`
- Create: `src/config/oxlint/graphql-conventions.ts`
- Create: `src/config/oxlint/testing-quality.ts`
- Create: `src/config/oxlint/code-safety.ts`
- Create: `src/config/oxlint/oxlint-parity.test.ts`

**Steps (TDD):**

1. Write failing tests that import the folded config and assert the same rule
   keys as `packages/agent-oxlint/src/index.js`.
2. Run `wp_test` scoped to `src/config/oxlint/oxlint-parity.test.ts` — verify FAIL.
3. Fold the modules into TypeScript-compatible source, preserving exported names.
4. Run the scoped `wp_test` — verify PASS.
5. Add a fixture `oxlint.config.ts` import smoke test if one does not already exist.
6. Run `wp_lint` and `wp_typecheck` for changed files.

**Acceptance:**

- [x] `@webpresso/agent-kit/oxlint` can export an object usable from `oxlint.config.ts`.
- [x] `.oxlintrc.json` package-import support is not promised.
- [x] Parity tests pass.
- [x] `wp_lint` and `wp_typecheck` pass for changed files.
#### [docs] Task 1.5: Update routing block and agent rules for new import paths

**Status:** done

**Depends:** None

Update agent-facing docs and injected routing context so future agents do not
recommend adding the retired `@webpresso/agent-*` packages. MCP tool names and
hook bin names stay unchanged; only package import/install guidance changes.

**Files:**

- Modify: `src/hooks/shared/routing-block.ts`
- Modify: `catalog/agent/rules/package-conventions.md`
- Modify: `catalog/agent/rules/changeset-release.md`
- Modify: `AGENTS.md`

**Steps (TDD):**

1. Write or update a text assertion test that searches routing/rule surfaces for
   stale `@webpresso/agent-` install guidance.
2. Run `wp_test` scoped to that assertion — verify FAIL if stale references exist.
3. Replace stale package guidance with `@webpresso/agent-kit/*` subpath
   guidance, keeping `wp_test`, `wp_lint`, `wp_typecheck`, `wp_qa`, and
   `wp_audit` names unchanged.
4. Run the scoped assertion — verify PASS.
5. Refactor wording for clarity only.
6. Run `wp_lint` and `wp_typecheck` for changed files.

**Acceptance:**

- [x] No routing/rule surface tells consumers to install `@webpresso/agent-*`.
- [x] `wp_*` MCP tool names are unchanged.
- [x] Hook bin names in `package.json#bin` are unchanged.
- [x] `wp_lint` and `wp_typecheck` pass for changed files.

---

## Phase 2: Runtime package folds and manifest integration [Complexity: M]
#### [runtime] Task 2.1: Fold `@webpresso/agent-workers-test`

**Status:** done

**Depends:** None

Fold the Cloudflare Workers test helper runtime from
`packages/agent-workers-test/src/` into `src/config/workers-test/`. Preserve
runtime behavior and tests; only import paths should change.

**Files:**

- Create: `src/config/workers-test/index.ts`
- Create: `src/config/workers-test/**/*.ts`
- Create: `src/config/workers-test/workers-test-parity.test.ts`

**Steps (TDD):**

1. Write a failing parity test that imports the folded `BaseWorkerEnv` and key
   helpers from `src/config/workers-test/index.ts`.
2. Run `wp_test` scoped to `src/config/workers-test/workers-test-parity.test.ts` — verify FAIL.
3. Copy/fold source from `packages/agent-workers-test/src/`.
4. Run the scoped `wp_test` — verify PASS.
5. Refactor only import paths; keep logic diffs minimal.
6. Run `wp_lint` and `wp_typecheck` for changed files.

**Acceptance:**

- [x] Workers-test parity test passes.
- [x] Diff against source package is empty or import-path-only.
- [x] `wp_lint` and `wp_typecheck` pass for changed files.
#### [runtime] Task 2.2: Fold docs-lint API, schemas, parsers, and generator

**Status:** done

**Depends:** None

Fold the reusable `@webpresso/agent-docs-lint` library surface into
`src/config/docs-lint/` without moving CLI entrypoints yet. This task owns
schemas, parsers, generator APIs, validators, and their fixtures/tests.

**Files:**

- Create: `src/config/docs-lint/index.ts`
- Create: `src/config/docs-lint/schemas/**`
- Create: `src/config/docs-lint/parsers/**`
- Create: `src/config/docs-lint/generator/**`
- Create: `src/config/docs-lint/__fixtures__/**`
- Create: `src/config/docs-lint/docs-lint-api-parity.test.ts`

**Steps (TDD):**

1. Write failing API parity tests for `schemas`, `generator`, and main
   docs-lint exports.
2. Run `wp_test` scoped to `src/config/docs-lint/docs-lint-api-parity.test.ts` — verify FAIL.
3. Fold the API/schema/parser/generator source.
4. Run the scoped `wp_test` — verify PASS.
5. Refactor path imports without changing lint semantics.
6. Run `wp_lint` and `wp_typecheck` for changed files.

**Acceptance:**

- [x] Public docs-lint APIs resolve locally.
- [x] Existing docs-lint unit tests have folded equivalents or are moved intact.
- [x] `wp_lint` and `wp_typecheck` pass for changed files.
#### [runtime] Task 2.3: Fold docs-lint CLI, templates, and bin entrypoints

**Status:** done

**Depends:** None

Fold docs-lint CLI entrypoints, command helpers, and templates into
`src/config/docs-lint/cli/` and `src/config/docs-lint/templates/`. This task
does not edit `package.json#bin`; Task 2.6 wires bins after all CLI files exist.

**Files:**

- Create: `src/config/docs-lint/cli/**`
- Create: `src/config/docs-lint/templates/**`
- Create: `src/config/docs-lint/docs-lint-cli-parity.test.ts`

**Steps (TDD):**

1. Write failing CLI smoke tests for the folded CLI modules using the current
   `packages/agent-docs-lint` behavior as oracle.
2. Run `wp_test` scoped to `src/config/docs-lint/docs-lint-cli-parity.test.ts` — verify FAIL.
3. Fold CLI and template files into the new paths.
4. Run the scoped `wp_test` — verify PASS.
5. Refactor only path/import wiring.
6. Run `wp_lint` and `wp_typecheck` for changed files.

**Acceptance:**

- [x] Folded CLI modules run help/validation smoke tests.
- [x] Templates are included for package staging by Task 2.6.
- [x] `wp_lint` and `wp_typecheck` pass for changed files.
#### [runtime] Task 2.4: Fold `@webpresso/agent-launch`

**Status:** done

**Depends:** None

Fold `packages/agent-launch/src/` into `src/config/launch/`, preserving launch
APIs and tests.

**Files:**

- Create: `src/config/launch/index.ts`
- Create: `src/config/launch/**/*.ts`
- Create: `src/config/launch/launch-parity.test.ts`

**Steps (TDD):**

1. Write failing parity tests for the launch public API.
2. Run `wp_test` scoped to `src/config/launch/launch-parity.test.ts` — verify FAIL.
3. Fold source from `packages/agent-launch/src/`.
4. Run the scoped `wp_test` — verify PASS.
5. Refactor import paths only.
6. Run `wp_lint` and `wp_typecheck` for changed files.

**Acceptance:**

- [x] Launch parity tests pass.
- [x] Logic diff is empty or justified in the task notes.
- [x] `wp_lint` and `wp_typecheck` pass for changed files.
#### [runtime] Task 2.5: Fold test and e2e presets

**Status:** done

**Depends:** None

Fold the small preset packages into `src/config/test-preset/` and
`src/config/e2e-preset/`. Keep `./vitest` and `./playwright` equivalents
available for Task 2.6 to expose.

**Files:**

- Create: `src/config/test-preset/index.ts`
- Create: `src/config/test-preset/vitest.ts`
- Create: `src/config/test-preset/test-preset-parity.test.ts`
- Create: `src/config/e2e-preset/index.ts`
- Create: `src/config/e2e-preset/playwright.ts`
- Create: `src/config/e2e-preset/e2e-preset-parity.test.ts`

**Steps (TDD):**

1. Write failing parity tests for both preset packages.
2. Run `wp_test` scoped to the new preset parity tests — verify FAIL.
3. Fold source from `packages/agent-test-preset/src/` and
   `packages/agent-e2e-preset/src/`.
4. Run the scoped `wp_test` — verify PASS.
5. Refactor path imports only.
6. Run `wp_lint` and `wp_typecheck` for changed files.

**Acceptance:**

- [x] Test-preset and e2e-preset parity tests pass.
- [x] `@webpresso/agent-kit/test-preset/vitest` and `@webpresso/agent-kit/e2e-preset/playwright` can be mapped.
- [x] `wp_lint` and `wp_typecheck` pass for changed files.
#### [package] Task 2.6: Wire manifest, exports, bins, and staging package

**Status:** done

**Depends:** Task 1.1, Task 1.2, Task 1.3, Task 1.4, Task 2.1, Task 2.2, Task 2.3, Task 2.4, Task 2.5

Own the shared manifest files after all source folds exist. Update
`package.json#tshy.exports`, generated/public `package.json#exports` source map,
`files`, docs-lint bin entries, and `tsconfig.json` aliases. Validate the
published `@webpresso/agent-kit` package surface through `npm pack --dry-run`.

**Files:**

- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `src/config/export-resolution.test.ts`

**Steps (TDD):**

1. Write failing export-resolution tests that stage or link the package and
   import/resolve `@webpresso/agent-kit/tsconfig/base.json`,
   `@webpresso/agent-kit/vitest/node`, `@webpresso/agent-kit/stryker`,
   `@webpresso/agent-kit/oxlint`, `@webpresso/agent-kit/workers-test`,
   `@webpresso/agent-kit/docs-lint`, `@webpresso/agent-kit/launch`,
   `@webpresso/agent-kit/test-preset`, and `@webpresso/agent-kit/e2e-preset`.
2. Run `wp_test` scoped to `src/config/export-resolution.test.ts` — verify FAIL.
3. Update `package.json#tshy.exports`, `package.json#files`, `package.json#bin`,
   and `tsconfig.json` aliases.
4. Run the scoped `wp_test` — verify PASS.
5. Run `npm pack --dry-run` and inspect that `@webpresso/agent-kit` includes
   JSON files, templates, and bin targets.
6. Run `pnpm lint:pkg`, `wp_typecheck`, and `wp_lint`.

**Acceptance:**

- [x] All expected `@webpresso/agent-kit/*` subpaths resolve from the package manifest.
- [x] `package.json` is modified only in this task for the fold.
- [x] Hook bins remain present.
- [x] `pnpm lint:pkg`, `wp_typecheck`, and `wp_lint` pass.

---

## Phase 3: Migration proof and deprecation prep [Complexity: S]
#### [docs] Task 3.1: Document migration and create consolidation changeset

**Status:** done

**Depends:** Task 2.6

Update operator and consumer docs with exact import path migrations. Include
the Oxlint `.oxlintrc.json` to `oxlint.config.ts` migration. Create the
reversible changeset for the consolidated `@webpresso/agent-kit` package;
publishing contract lock is handled in Task 4.2.

**Files:**

- Modify: `MIGRATION.md`
- Modify: `README.md`
- Create: `.changeset/consolidate-agent-subpackages.md`

**Steps (TDD):**

1. Write failing docs assertions for old/new import mapping examples and the
   Oxlint TypeScript config requirement.
2. Run `wp_test` scoped to docs assertions — verify FAIL.
3. Update docs and add the changeset.
4. Run scoped docs assertions — verify PASS.
5. Refactor docs for shortest clear migration path.
6. Run `wp_lint` and `wp_audit(kind="docs-frontmatter")`.

**Acceptance:**

- [x] Migration table covers tsconfig, vitest, stryker, oxlint, workers-test,
  docs-lint, launch, test-preset, and e2e-preset.
- [x] Changeset is present but no publish occurs.
- [x] Docs checks pass.
#### [sibling-repo] Task 3.2: Prove consumer migration in a sibling PR

**Status:** done

**Evidence:** Sibling branch `ozby/ingest-lens@agent-kit-consolidation-proof`
commit `5573dd7` records the migration. `consumer-migration-checklist.md` captures the baseline
YAML indentation fix, before/after dependency mapping, and passing migrated
`pnpm install --frozen-lockfile`, `pnpm run check-types`, `pnpm run test`,
`pnpm run lint`, targeted wrapper test, and `pnpm run lint:repo`.

**Depends:** Task 2.6

Prepare and execute a sibling-repo migration proof for `ozby/ingest-lens` or
the operator-selected dogfood consumer. Do not edit sibling repo files from this
repo silently; create a checklist and capture the PR/branch reference.

**Files:**

- Create: `blueprints/in-progress/consolidate-all-webpresso-agent-sub-packages-into-webpresso-itself-with-subpath-exports-consumers-go-from-6-8-pinned-devdeps-down-to-one-webpresso/consumer-migration-checklist.md`
- External: sibling consumer repo `package.json`, `pnpm-workspace.yaml`,
  `tsconfig*.json`, `vitest.config.ts`, `stryker.config.ts` if present,
  `.oxlintrc.json` or `oxlint.config.ts`

**Steps (TDD):**

1. Write the checklist with expected before/after import and dependency changes.
2. In the sibling repo/PR, first run its existing typecheck/test/lint gates and
   record baseline status.
3. Replace `@webpresso/agent-*` devDependencies with `@webpresso/agent-kit` and
   update config imports.
4. Run the same sibling gates — verify PASS.
5. Record the sibling branch/PR and any deviations in the checklist.
6. Do not merge or publish from this task.

**Acceptance:**

- [x] Consumer checklist exists in this blueprint directory.
- [x] Sibling PR/branch reference is recorded.
- [x] Consumer typecheck, tests, and lint pass with `@webpresso/agent-kit`.
- [x] No sibling repo edits are hidden inside this repo diff.
#### [release-prep] Task 3.3: Prepare sub-package deprecation metadata

**Status:** done

**Depends:** Task 2.6

Prepare the reversible repo-side deprecation notice for the 9 `packages/agent-*`
packages. This does not run `npm deprecate` and does not unpublish anything.

**Files:**

- Modify: `packages/agent-tsconfig/package.json`
- Modify: `packages/agent-vitest/package.json`
- Modify: `packages/agent-stryker/package.json`
- Modify: `packages/agent-oxlint/package.json`
- Modify: `packages/agent-workers-test/package.json`
- Modify: `packages/agent-docs-lint/package.json`
- Modify: `packages/agent-launch/package.json`
- Modify: `packages/agent-test-preset/package.json`
- Modify: `packages/agent-e2e-preset/package.json`
- Create: `.changeset/deprecate-agent-subpackages.md`

**Steps (TDD):**

1. Write failing metadata assertions that every `packages/agent-*` package has
   the same migration notice.
2. Run `wp_test` scoped to the metadata assertions — verify FAIL.
3. Add the deprecation notice metadata and changeset.
4. Run scoped metadata assertions — verify PASS.
5. Refactor notice wording only if the migration URL changes.
6. Run `wp_lint` and `wp_typecheck`.

**Acceptance:**

- [x] All 9 sub-package manifests carry the migration notice.
- [x] Changeset for final deprecated package versions exists.
- [x] No registry deprecation command runs in this task.
- [x] `wp_lint` and `wp_typecheck` pass.

---

## Phase 4: QA and release gate [Complexity: XS]
#### [qa] Task 4.1: Full QA gate

**Status:** done

**Evidence:** Full local QA passed after sibling consumer proof was attached.
One `wp_qa` run exposed a transient RTK integration test failure; the scoped
test passed immediately afterward, and the follow-up full `wp_qa` passed.

**Depends:** Task 1.5, Task 3.1, Task 3.2, Task 3.3

Run the complete local and dogfood verification suite before any irreversible
publish/deprecation work.

**Files:**

- No planned source changes; update only task notes/checklist evidence if needed.

**Steps (TDD):**

1. Verify all task-specific tests have already failed then passed in their tasks.
2. Run `wp_typecheck`.
3. Run `wp_lint`.
4. Run `wp_test`.
5. Run `wp_qa`.
6. Run `pnpm lint:pkg` and `npm pack --dry-run`.

**Acceptance:**

- [x] `wp_typecheck` passes.
- [x] `wp_lint` passes.
- [x] `wp_test` passes.
- [x] `wp_qa` passes.
- [x] `pnpm lint:pkg` passes.
- [x] `@webpresso/agent-kit` dry-run package contains all subpaths and non-code assets.
- [x] Sibling consumer proof is attached.

#### [release-gate] Task 4.2: Lock hardcut release contract to `@webpresso/agent-kit`

**Status:** done

**Evidence:** 2026-05-28 hardcut pivot applied: package identity, release rule,
package conventions, and docs now converge on `@webpresso/agent-kit` as the
canonical package for this repository. Legacy public-npm `webpresso` cutover
assumptions were removed from the active release gate.

**Depends:** Task 4.1

Finalize contract alignment so this blueprint no longer assumes dual package
identity or a separate `webpresso` cutover path.

**Files:**

- Modify: `catalog/agent/rules/changeset-release.md`
- Modify: `catalog/agent/rules/package-conventions.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/markdown-fact-check.md`
- Modify: `blueprints/in-progress/consolidate-all-webpresso-agent-sub-packages-into-webpresso-itself-with-subpath-exports-consumers-go-from-6-8-pinned-devdeps-down-to-one-webpresso/_overview.md`

**Steps (TDD):**

1. Confirm canonical identity in root surfaces (`package.json`, README,
   getting-started docs) remains `@webpresso/agent-kit`.
2. Replace stale release notes/rules that described an unscoped `webpresso`
   cutover path with the current scoped package release contract.
3. Confirm package-surface verification uses `npm pack --dry-run`, not a
   missing `scripts/publish-webpresso.ts` helper.
4. Record hardcut-pivot evidence in this blueprint.

**Acceptance:**

- [x] `@webpresso/agent-kit` is the single canonical package identity for this repo.
- [x] No active release gate depends on a separate unscoped `webpresso` cutover path.
- [x] No `v*` tags are pushed manually.
- [x] Release-contract evidence is recorded.

---

## Verification Gates

| Gate | Command / tool | Success Criteria |
| --- | --- | --- |
| Task tests | `wp_test` scoped to changed tests | Failing-before/passing-after evidence per implementation task |
| Type safety | `wp_typecheck` | Zero diagnostics |
| Lint | `wp_lint` | Zero violations |
| QA | `wp_qa` | Full quality pass |
| Package validation | `pnpm lint:pkg` | `publint` + `attw` pass |
| Package surface dry-run | `npm pack --dry-run` | Packed `@webpresso/agent-kit` contains expected exports, bins, JSON, templates |
| Blueprint lifecycle | `wp_audit(kind="blueprint-lifecycle")` | Planned blueprint is valid |
| Consumer proof | Sibling repo gates | Typecheck, test, and lint pass in dogfood consumer |

## Cross-Plan References

| Type | Reference | Relationship |
| --- | --- | --- |
| Upstream | Root release workflow + package manifest | This blueprint now treats `@webpresso/agent-kit` as the canonical release package contract. |
| Related planned | `planned/agent-kit-public-release-scrub` | If the repo later pursues a source-history/public release event, scrub work stays a prerequisite. |
| Related completed | `fold-webpresso-quality-engine-into-webpresso-agent-kit` pattern (referenced by prior plan) | Reuse extraction-parity and staged package verification discipline. |
| Sibling | `ozby/ingest-lens` or operator-selected consumer PR | Provides external migration proof; do not edit from this repo without explicit checkout. |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --- | --- | --- | --- |
| `tsconfig extends` cannot find staged JSON | HIGH — consumers fail typecheck immediately | Literal `src/config/tsconfig/*.json` files plus staged-package fixture resolution | 1.1, 2.6 |
| Multiple parallel tasks edit `package.json` | HIGH — merge conflicts and broken exports | Single manifest fan-in task | 2.6 |
| Parent-relative re-export to `packages/agent-*` survives | HIGH — archived packages remain runtime dependencies | Source fold with parity tests; no `../../packages/*` imports | 1.2-2.5 |
| Oxlint JSON config cannot import package config | HIGH — lint migration blocked | Document and test `oxlint.config.ts` import path | 1.4, 3.1 |
| Docs-lint template assets omitted from package | MEDIUM — CLI works locally but fails after publish | Include templates in `files`/staging validation | 2.3, 2.6 |
| Hook or MCP routing names accidentally change | HIGH — agent workflow regression | Routing update task preserves bin/tool names and tests stale package guidance only | 1.5 |
| Sibling consumer unavailable locally | MEDIUM — no dogfood proof | Checklist + external PR reference; block release gate without proof | 3.2, 4.1 |
| Release docs drift from real package identity | HIGH — operators follow dead paths and burn release time | Task 4.2 locks canonical package identity and rewrites stale cutover assumptions | 4.2 |
| Missing pack-surface check in release notes | HIGH — required assets can silently drop from published package | Keep `npm pack --dry-run` in QA/release evidence and review bin/exports on each release gate | 4.1, 4.2 |

## Non-goals

- Removing old packages from the repository before the transition window ends.
- Migrating every possible downstream consumer in this repo-local blueprint.
- Changing Vitest, Stryker, Oxlint, Workers, or docs-lint behavior beyond import paths.
- Creating a mega-barrel `import * from "@webpresso/agent-kit"` API.
- Manually pushing version tags or bypassing Changesets/release automation.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Packed release surface diverges from root package tests | HIGH | Run export-resolution checks plus `npm pack --dry-run` for `@webpresso/agent-kit`. |
| Docs-lint fold introduces subtle logic changes | MEDIUM | Split API/CLI tasks and require parity tests plus import-path-only diffs. |
| Release workflow/docs drift after package-identity decisions change | MEDIUM | Keep Task 4.2 as a contract-lock step that updates rule/docs and evidence together. |
| Legacy cutover assumptions reappear in active docs | HIGH | Gate release docs/rules on canonical `@webpresso/agent-kit` language and remove dead helper references. |
| Unknown consumers still use old packages | MEDIUM | Deprecate rather than unpublish; keep migration docs and transition window. |
| TS 6 changes config resolution behavior | LOW | Literal files remain compatible; optional exports map can be adjusted later. |

## Technology Choices

| Component | Technology | Version / constraint | Why |
| --- | --- | --- | --- |
| Package publishing | Root `@webpresso/agent-kit` + release workflow publish + `npm pack --dry-run` verification | Current repo | Matches the hardcut single-package contract and current automation surface. |
| Build/export generation | `tshy` via `package.json#tshy.exports` | Current repo | Existing build path for ESM exports. |
| TypeScript config delivery | Literal JSON files | TS 5.x/6-ready | Robust for `tsconfig extends` filesystem lookup. |
| Oxlint config delivery | `oxlint.config.ts` importing `@webpresso/agent-kit/oxlint` | Node `>=24` | Official config supports package-imported config objects only through TS config. |
| Registry deprecation | `npm deprecate` | npm CLI v11 docs | Produces install-time registry warnings; not just a repo diff. |

## Refinement Summary

| Metric | Value |
| --- | --- |
| Findings total | 8 |
| Critical | 0 |
| High | 5 |
| Medium | 4 |
| Low | 0 |
| Fixes applied | 9/9 |
| Cross-plans updated | 0 |
| Edge cases documented | 9 |
| Risks documented | 6 |
| Parallelization score | A |
| Critical path | 5 waves |
| Max parallel agents | 10 |
| Total tasks | 16 |
| Blueprint compliant | 16/16 |
