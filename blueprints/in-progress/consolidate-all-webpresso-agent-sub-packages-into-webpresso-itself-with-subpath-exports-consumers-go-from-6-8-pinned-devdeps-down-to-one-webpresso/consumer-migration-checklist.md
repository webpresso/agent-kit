# Consumer migration checklist: `@webpresso/agent-*` packages to `webpresso`

Task: 3.2 — prove consumer migration in a sibling PR/branch.
Updated: 2026-05-13.

## Sibling PR reference

- Consumer repo: `ozby/ingest-lens`
- Local checkout path: `/Users/ozby/repos/ozby/ingest-lens`
- Branch: `agent-kit-consolidation-proof`
- Commit: `5573dd7` (`chore(agent-kit): prove webpresso consolidation`)
- PR URL: not opened from this session; local branch commit recorded for operator push/review.
- Reviewer/owner: operator / repo owner
- Migration package version: local `webpresso` link to `/Users/ozby/repos/webpresso/agent-kit` at current consolidation HEAD (staged publish package version `0.17.3`).
- Release-gate status: **READY FOR OPERATOR RELEASE GATE** after QA; publish/deprecation still credential-gated.

## Baseline finding fixed before migration

The sibling checkout initially could not run any pnpm script because `pnpm-workspace.yaml` had a pre-existing indentation error on `@webpresso/db-branching`. That was fixed on the proof branch before recording baseline gates.

## Files inspected / migrated in the sibling branch

- Root and workspace `package.json` files using `@webpresso/agent-tsconfig`, `@webpresso/agent-vitest`, `@webpresso/agent-stryker`, or `@webpresso/agent-workers-test`.
- `pnpm-workspace.yaml` and `pnpm-lock.yaml`.
- `tsconfig*.json`, `vitest.config.ts`, and `stryker.config.ts` under `apps/`, `packages/`, `infra/`, `scripts/`, and root.
- Worker-test imports in `apps/lab/src/**` and `apps/workers/src/tests/**`.
- `scripts/run-webpresso-cli.ts` and its tests, updated to resolve `webpresso/package.json`.

## Before/after dependency check

Before migration, `ozby/ingest-lens` consumed these `@webpresso/agent-*` dev dependencies:

- [x] `@webpresso/agent-tsconfig`
- [x] `@webpresso/agent-vitest`
- [x] `@webpresso/agent-stryker`
- [x] `@webpresso/agent-workers-test`
- [x] `@webpresso/agent-oxlint` — not present as a package dependency in this consumer
- [x] `@webpresso/agent-docs-lint` — not present as a package dependency in this consumer
- [x] `@webpresso/agent-test-preset` — not present as a package dependency in this consumer
- [x] `@webpresso/agent-e2e-preset` — not present as a package dependency in this consumer
- [x] `@webpresso/agent-launch` — not present as a package dependency in this consumer

After migration:

- [x] Removed consumed `@webpresso/agent-*` devDependencies from root/workspace package manifests.
- [x] Added canonical replacement devDependency `webpresso` using a local link for unpublished dogfood proof.
- [x] Kept unrelated dependency versions unchanged except the pre-existing YAML indentation fix.
- [x] Regenerated `pnpm-lock.yaml` for the dependency consolidation.

## Before/after import and config mapping

| Old consumer reference | New consumer reference |
| --- | --- |
| `@webpresso/agent-tsconfig/base.json` | `webpresso/tsconfig/base.json` |
| `@webpresso/agent-tsconfig/cloudflare.json` | `webpresso/tsconfig/cloudflare.json` |
| `@webpresso/agent-tsconfig/library.json` | `webpresso/tsconfig/library.json` |
| `@webpresso/agent-tsconfig/react-library.json` | `webpresso/tsconfig/react-library.json` |
| `@webpresso/agent-tsconfig/react-router.json` | `webpresso/tsconfig/react-router.json` |
| `@webpresso/agent-tsconfig/webpresso.json` | `webpresso/tsconfig/webpresso.json` |
| `@webpresso/agent-vitest/node` | `webpresso/vitest/node` |
| `@webpresso/agent-vitest/react` | `webpresso/vitest/react` |
| `@webpresso/agent-vitest/react-router` | `webpresso/vitest/react-router` |
| `@webpresso/agent-vitest/workers` | `webpresso/vitest/workers` |
| `@webpresso/agent-vitest/react-setup` | `webpresso/vitest/react-setup` |
| `@webpresso/agent-vitest/flakiness-reporter` | `webpresso/vitest/flakiness-reporter` |
| `@webpresso/agent-stryker` | `webpresso/stryker` |
| `@webpresso/agent-stryker/webpresso` | `webpresso/stryker/webpresso` |
| `@webpresso/agent-workers-test` | `webpresso/workers-test` |

Config/source verification: `rg -n "@webpresso/agent-" package.json pnpm-workspace.yaml apps packages infra scripts tsconfig.json -g "!node_modules" -g "!pnpm-lock.yaml"` returned no matches after migration.

## Baseline gates recorded before migration

| Gate | Command | Baseline status | Evidence |
| --- | --- | --- | --- |
| Install/script parser | `pnpm run check-types` before YAML fix | FAIL | pnpm rejected `pnpm-workspace.yaml`: bad indentation at line 34. |
| Typecheck | `pnpm run check-types` after YAML fix | PASS | exit 0, `vp run check-types`. |
| Lint | `pnpm run lint` after YAML fix | PASS | exit 0, `vp run lint`. |
| Tests | `pnpm run test` after YAML fix | PASS | exit 0, `vp run test`. |

## Migration gates recorded after migration

| Gate | Command | Migrated status | Evidence |
| --- | --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | PASS | exit 0 after lockfile regeneration. |
| Typecheck | `pnpm run check-types` | PASS | exit 0. |
| Lint | `pnpm run lint` | PASS | exit 0. |
| Tests | `pnpm run test` | PASS | exit 0. |
| Targeted wrapper test | `pnpm exec vitest run scripts/run-webpresso-cli.test.ts` | PASS | 4 tests passed. |
| Repo lint smoke | `pnpm run lint:repo` | PASS | oxlint found 0 warnings and 0 errors. |

## PR acceptance checklist

- [x] Sibling PR/branch reference is recorded above.
- [x] Baseline gates are recorded before dependency changes.
- [x] `@webpresso/agent-*` devDependencies are replaced by `webpresso`.
- [x] All consumer config imports use `webpresso/*` subpath exports.
- [x] Typecheck passes after migration.
- [x] Lint passes after migration.
- [x] Tests pass after migration.
- [x] Deviations or package gaps are documented below.
- [x] No sibling repo edits are hidden inside the `agent-kit` repo diff.

## Deviations / follow-ups

- Used a local `link:/Users/ozby/repos/webpresso/agent-kit` dependency for `webpresso` because the canonical public package is not published yet. Replace with the published npm version before/after the release gate as appropriate.
- Historical docs and completed blueprints in `ozby/ingest-lens` may still mention old package names as archive context; live package/config/source paths were migrated and verified.
- The proof branch/commit is local in this session. Push/open a PR if external review evidence is required before publishing.
