---
type: blueprint
status: planned
complexity: M
created: '2026-05-12'
last_updated: '2026-05-12'
progress: '0% (drafted)'
depends_on: []
tags:
  - consolidation
  - dx
  - package-design
---

# Consolidate @webpresso/agent-* sub-packages into webpresso subpath exports

**Goal:** Consumers go from 6–8 pinned devDeps (`@webpresso/agent-tsconfig`,
`@webpresso/agent-vitest`, `@webpresso/agent-stryker`, …) down to ONE:
`webpresso`. Everything is a subpath export. `pnpm add -D webpresso` + `wp setup`
is the complete onboarding story.

## Context

The `@webpresso/agent-*` family ships 9 sub-packages today. A consumer like
`ingest-lens` pins all of them separately, which creates version-drift risk and
forces consumers to track internal package splits. The `webpresso` name is
already reserved on public npm (`0.0.0-placeholder`). This blueprint folds the
sub-packages into `webpresso` itself, making the package both the global CLI
**and** the single devDep for config/preset access.

Prior art: `@epic-web/config` (ESLint + Prettier + TypeScript in one package,
subpath exports). Pattern is production-proven.

## Architecture Overview

```
BEFORE                                  AFTER
──────────────────────────────────────  ──────────────────────────────────────
consumer devDependencies:               consumer devDependencies:
  @webpresso/agent-tsconfig             webpresso (single entry, catalog:)
  @webpresso/agent-vitest
  @webpresso/agent-stryker
  @webpresso/agent-oxlint               tsconfig.json:
  @webpresso/agent-workers-test           "extends": "webpresso/tsconfig/base"
  @webpresso/agent-docs-lint
                                        vitest.config.ts:
tsconfig.json:                            import { nodeConfig } from
  "extends": "@webpresso/agent-             'webpresso/vitest/node'
              tsconfig/base.json"
                                        oxlint.config.ts (migrated from .json):
vitest.config.ts:                         import config from
  import { nodeConfig } from               'webpresso/oxlint'
    '@webpresso/agent-vitest/node'
                                        stryker.config.ts:
.oxlintrc.json:                           import base from 'webpresso/stryker'
  (can't extend from packages)
                                        import { BaseWorkerEnv } from
                                          'webpresso/workers-test'
```

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| tsconfig extends mechanism | Ship actual `.json` files at literal paths in `webpresso/tsconfig/*.json` | TypeScript `extends` does NOT consult `package.json#exports`. Verified against TS 5.x source + `@epic-web/config` implementation. Files must exist at exact filesystem paths. |
| oxlint config format | Migrate consumers to `oxlint.config.ts` (TypeScript format) | `.oxlintrc.json` `extends` only accepts relative file paths — package imports not supported. The TS format supports `import config from 'webpresso/oxlint'`. Node ≥24 required; repo already enforces this. |
| vitest/stryker imports | Standard exports map resolution | `import from 'webpresso/vitest/node'` resolves via `package.json#exports` normally. No workaround needed. |
| Sub-package lifecycle | Deprecate + archive, keep on GH Packages for one minor window | Consumers have time to migrate. `@webpresso/agent-*` packages publish one final version with a `deprecated` field pointing at the new path. |
| Package name | `webpresso` (public npm) | Already reserved. Global CLI + devDep config is one install. |
| Runtime packages | Subpath exports of `webpresso` | `workers-test`, `docs-lint`, `launch`, `test-preset`, `e2e-preset` become `webpresso/workers-test`, etc. Same compile output, different import path. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
|---|---|---|---|
| **Wave 0** | 1.1 (scaffold), 1.2 (tsconfig files), 1.3 (vitest/stryker exports), 1.4 (oxlint export), 1.5 (routing-block + agent-rules update) | None | 5 agents |
| **Wave 1** | 2.1 (workers-test fold), 2.2 (docs-lint fold), 2.3 (runtime folds), 2.4 (package.json exports map) | Wave 0 | 4 agents |
| **Wave 2** | 3.1 (consumer migration: ingest-lens), 3.2 (sub-package deprecation) | Wave 1 | 2 agents |
| **Wave 3** | 4.1 (full QA gate), 4.2 (changeset + publish) | Wave 2 | 2 agents |
| **Critical path** | 1.1 → 2.4 → 3.1 → 4.2 | — | 4 waves |

**Parallel metrics snapshot:**

| Metric | Value | Target |
|---|---|---|
| RW0 (tasks in Wave 0) | 5 | ≥ 3 |
| CPR (13 tasks / 4 waves) | 3.25 | ≥ 2.5 |
| CP (file conflicts per wave) | 0 | 0 |

---

## Phase 1: Scaffold webpresso subpath structure [Complexity: S]

#### Task 1.1: Scaffold the subpath directory skeleton in webpresso package

**Status:** todo

**Depends:** None

Create the directory skeleton inside `packages/webpresso/` (the future
`webpresso` public package, currently `@webpresso/agent-kit`'s primary
publishing target). Add subdirectories for each sub-package type so subsequent
tasks have a landing zone.

The directory layout:
```
packages/webpresso/         (or root if agent-kit IS webpresso)
  tsconfig/                 ← JSON files shipped at literal paths
  vitest/                   ← re-exported vitest presets
  stryker/                  ← re-exported stryker configs
  oxlint/                   ← re-exported oxlint plugin + config
  workers-test/             ← folded from @webpresso/agent-workers-test
  docs-lint/                ← folded from @webpresso/agent-docs-lint
  test-preset/              ← folded from @webpresso/agent-test-preset
  e2e-preset/               ← folded from @webpresso/agent-e2e-preset
```

Note: the canonical package.json name will be `webpresso` (public npm) for the
published package. Internally in the monorepo the source lives under
`agent-kit/`. The `publish-webpresso.ts` staging script already handles the
name swap.

**Files:**
- Create: `src/config/tsconfig/.gitkeep` (placeholder until 1.2 fills it)
- Create: `src/config/vitest/.gitkeep`
- Create: `src/config/stryker/.gitkeep`
- Create: `src/config/oxlint/.gitkeep`

**Steps (TDD):** This task is scaffolding — no test needed. Verify with
`ls -R src/config/`.

**Acceptance:**
- [ ] Directory structure created
- [ ] `pnpm lint` passes (no new lint issues)

---

#### Task 1.2: Add tsconfig JSON files at literal filesystem paths

**Status:** todo

**Depends:** Task 1.1

**CRITICAL FINDING:** TypeScript `extends` does NOT use `package.json#exports`.
It resolves via the legacy Node.js file lookup: `node_modules/webpresso/tsconfig/base.json`
must be a real file. Verified against TS 5.x source + `@epic-web/config` which
ships `node_modules/@epic-web/config/typescript.json` as a literal file.

Copy (then maintain) the 6 tsconfig JSON files from `packages/agent-tsconfig/`
into `src/config/tsconfig/`:
- `base.json`, `cloudflare.json`, `library.json`, `react-library.json`,
  `react-router.json`, `webpresso.json`

These files must be included in the published package via `"files"` in
`package.json`:
```json
"files": ["dist", "src", "src/config/tsconfig", ...]
```

Consumer migration: `"extends": "@webpresso/agent-tsconfig/base.json"`
→ `"extends": "webpresso/tsconfig/base.json"`.

The `/tsconfig/base.json` subpath **does not** need an `exports` entry — the
literal file path is what TypeScript uses. But add exports entries anyway for
completeness and for tools that do use them:
```json
"./tsconfig/*": "./src/config/tsconfig/*.json"
```

**Files:**
- Create: `src/config/tsconfig/base.json`
- Create: `src/config/tsconfig/cloudflare.json`
- Create: `src/config/tsconfig/library.json`
- Create: `src/config/tsconfig/react-library.json`
- Create: `src/config/tsconfig/react-router.json`
- Create: `src/config/tsconfig/webpresso.json`
- Modify: `package.json` — add `src/config/tsconfig` to `files` array

**Steps (TDD):**
1. Copy JSON files from `packages/agent-tsconfig/` 
2. Write a test: resolve `require.resolve('webpresso/tsconfig/base.json')` from
   a temp project with `webpresso` installed — verify the file exists at the
   resolved path
3. Verify the content matches the source package exactly (byte-diff)
4. Run `mcp__plugin_webpresso-agent-kit_agent-kit__ak_typecheck` — zero errors

**Acceptance:**
- [ ] 6 JSON files present at `src/config/tsconfig/`
- [ ] `package.json#files` includes the tsconfig dir
- [ ] Byte-identical to source packages (extraction-parity rule)
- [ ] Typecheck passes

---

#### Task 1.3: Add vitest and stryker subpath exports

**Status:** todo

**Depends:** Task 1.1

Vitest and stryker configs use standard `package.json#exports` resolution
(unlike tsconfig). Create thin re-export barrel files:

**vitest**: `src/config/vitest/node.ts`, `react.ts`, `react-router.ts`,
`workers.ts`, `react-setup.ts` — each does:
```ts
export { nodeConfig } from '../../packages/agent-vitest/src/node.js'
// or inline the config if agent-vitest is being folded wholesale
```

**stryker**: `src/config/stryker/index.ts`, `webpresso.ts` — re-export from
`@webpresso/agent-stryker`.

Add to `package.json#exports`:
```json
"./vitest/*": "./src/config/vitest/*.ts",
"./stryker": "./src/config/stryker/index.ts",
"./stryker/*": "./src/config/stryker/*.ts"
```

Consumer migration:
- `import { nodeConfig } from '@webpresso/agent-vitest/node'`
  → `import { nodeConfig } from 'webpresso/vitest/node'`
- `import base from '@webpresso/agent-stryker'`
  → `import base from 'webpresso/stryker'`

**Files:**
- Create: `src/config/vitest/node.ts` (and react, react-router, workers, react-setup)
- Create: `src/config/stryker/index.ts`, `src/config/stryker/webpresso.ts`
- Modify: `package.json` exports map

**Steps (TDD):**
1. Write import test: `import { nodeConfig } from 'webpresso/vitest/node'` in
   a temp fixture → verify the config object has expected keys
2. Implement the re-export files
3. Run `mcp__plugin_webpresso-agent-kit_agent-kit__ak_test` scoped to the vitest
   config fixtures

**Acceptance:**
- [ ] All vitest subpath exports resolve correctly
- [ ] Stryker re-export works
- [ ] Tests pass
- [ ] Typecheck passes

---

#### Task 1.4: Add oxlint subpath export + document config.ts migration

**Status:** todo

**Depends:** Task 1.1

**FINDING:** `.oxlintrc.json` format's `extends` only accepts relative file
paths — package imports not supported. Consumers MUST migrate to
`oxlint.config.ts`. This is supported on Node ≥22.18 / ≥24. The repo enforces
Node ≥24 (`engines: { node: ">=24" }`), so this is safe.

Create `src/config/oxlint/index.ts`:
```ts
export { rules, config } from '../../packages/agent-oxlint/src/index.js'
export * from '../../packages/agent-oxlint/src/import-hygiene.js'
export * from '../../packages/agent-oxlint/src/monorepo-paths.js'
```

Add to `package.json#exports`:
```json
"./oxlint": "./src/config/oxlint/index.ts",
"./oxlint/*": "./src/config/oxlint/*.ts"
```

Consumer migration guide (document in MIGRATION.md):
```
# Before (.oxlintrc.json — cannot extend packages)
{}

# After (oxlint.config.ts)
import { config } from 'webpresso/oxlint'
export default config
```

**Files:**
- Create: `src/config/oxlint/index.ts`
- Modify: `package.json` exports map
- Modify: `MIGRATION.md` — add oxlint migration section

**Steps (TDD):**
1. Write test: `import { config } from 'webpresso/oxlint'` — verify `config`
   has the expected rule structure
2. Implement the re-export
3. Test that `oxlint --config oxlint.config.ts` accepts the imported config in
   a fixture project

**Acceptance:**
- [ ] `webpresso/oxlint` export resolves
- [ ] MIGRATION.md documents the `.oxlintrc.json` → `oxlint.config.ts` change
- [ ] Tests pass

---

## Phase 2: Fold runtime packages into webpresso [Complexity: M]

#### Task 2.1: Fold @webpresso/agent-workers-test

**Status:** todo

**Depends:** Task 1.1

Move the 729-line `@webpresso/agent-workers-test` source into
`src/config/workers-test/`. This package is a runtime library (test utilities
for Cloudflare Workers), not a config-only package, so it needs `tshy` build
output.

Steps: copy source, add to `tshy#exports`, add to `package.json#exports`.

Consumer migration: `import { BaseWorkerEnv } from '@webpresso/agent-workers-test'`
→ `import { BaseWorkerEnv } from 'webpresso/workers-test'`

Apply the extraction-parity rule: `diff -ru packages/agent-workers-test/src src/config/workers-test/` must be empty (or only import-path changes).

**Files:**
- Create: `src/config/workers-test/*.ts` (source fold)
- Modify: `package.json` exports + tshy config
- Modify: `src/config/workers-test` test files (path updates only)

**Acceptance:**
- [ ] Mutation score ≥ old score − 2 (extraction-parity rule)
- [ ] Byte-diff shows only import-path changes
- [ ] All existing workers-test tests pass under the new path

---

#### Task 2.2: Fold @webpresso/agent-docs-lint

**Status:** todo

**Depends:** Task 1.1

Move the 11,769-line `@webpresso/agent-docs-lint` into `src/config/docs-lint/`.
This is the largest fold — it includes CLI bins (docs-lint, docs-check-*).

The CLI bins from `@webpresso/agent-docs-lint` join the `webpresso` bin map:
```json
"docs-lint": "./src/config/docs-lint/bin/docs-lint.ts"
```

Consumer migration: `import { auditDocsFrontmatter } from '@webpresso/agent-docs-lint'`
→ `import { auditDocsFrontmatter } from 'webpresso/docs-lint'`

**Files:**
- Create: `src/config/docs-lint/**` (source fold)
- Modify: `package.json` bin map + exports + tshy

**Acceptance:**
- [ ] Extraction parity verified
- [ ] All docs-lint tests pass
- [ ] CLI bins work: `wp docs-lint --help` (docs-lint bin is now part of wp)

---

#### Task 2.3: Fold remaining runtime packages (launch, test-preset, e2e-preset)

**Status:** todo

**Depends:** Task 1.1

Fold three smaller packages in one task (all are ≤ 200 lines):
- `@webpresso/agent-launch` (1,161 lines) → `src/config/launch/`
- `@webpresso/agent-test-preset` (87 lines) → `src/config/test-preset/`
- `@webpresso/agent-e2e-preset` (131 lines) → `src/config/e2e-preset/`

Consumer migrations:
- `from '@webpresso/agent-launch'` → `from 'webpresso/launch'`
- `from '@webpresso/agent-test-preset'` → `from 'webpresso/test-preset'`
- `from '@webpresso/agent-e2e-preset'` → `from 'webpresso/e2e-preset'`

**Files:**
- Create: `src/config/{launch,test-preset,e2e-preset}/*.ts`
- Modify: `package.json` exports + tshy

**Acceptance:**
- [ ] Extraction parity for each fold
- [ ] All three test suites pass

---

#### Task 2.4: Update package.json exports map + tshy config

**Status:** todo

**Depends:** Tasks 2.1, 2.2, 2.3

Consolidate all new subpath exports into the canonical `package.json#exports`
and `package.json#imports` maps. Update `tshy.json` (or `package.json#tshy`) to
include all the new source entry points.

Full exports map after this task:
```json
"./tsconfig/*": "./src/config/tsconfig/*.json",
"./vitest/*":   "./src/config/vitest/*.ts",
"./stryker":    "./src/config/stryker/index.ts",
"./stryker/*":  "./src/config/stryker/*.ts",
"./oxlint":     "./src/config/oxlint/index.ts",
"./oxlint/*":   "./src/config/oxlint/*.ts",
"./workers-test": "./src/config/workers-test/index.ts",
"./docs-lint":  "./src/config/docs-lint/index.ts",
"./launch":     "./src/config/launch/index.ts",
"./test-preset":"./src/config/test-preset/index.ts",
"./e2e-preset": "./src/config/e2e-preset/index.ts"
```

Also update `#` import aliases in tsconfig.json:
```json
"#config/*": ["./src/config/*"]
```

Run `pnpm lint:pkg` (publint + attw) to catch any broken export map entries.

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

**Steps:**
1. Apply the export map
2. Run `pnpm lint:pkg` — verify publint + attw both pass
3. Run `mcp__plugin_webpresso-agent-kit_agent-kit__ak_typecheck`

**Acceptance:**
- [ ] `pnpm lint:pkg` passes (publint + attw)
- [ ] Typecheck passes
- [ ] All subpath imports resolve from a test fixture project

---

## Phase 3: Consumer migration + sub-package deprecation [Complexity: S]

#### Task 3.1: Migrate ingest-lens to single webpresso devDep

**Status:** todo

**Depends:** Task 2.4

Update `ozby/ingest-lens` to use `webpresso` instead of the 6 sub-packages:

1. Remove from `devDependencies`: `@webpresso/agent-tsconfig`,
   `@webpresso/agent-vitest`, `@webpresso/agent-stryker`, `@webpresso/agent-oxlint`,
   `@webpresso/agent-workers-test`, `@webpresso/agent-docs-lint`.
2. Add `webpresso: catalog:` to devDependencies.
3. Update `pnpm-workspace.yaml` catalog to pin `webpresso` instead of the
   6 separate entries.
4. Update all config files:
   - `tsconfig.json`: `@webpresso/agent-tsconfig/base.json` → `webpresso/tsconfig/base.json`
   - `vitest.config.ts`: `@webpresso/agent-vitest/node` → `webpresso/vitest/node`
   - `stryker.config.ts`: `@webpresso/agent-stryker` → `webpresso/stryker`
   - Migrate `.oxlintrc.json` → `oxlint.config.ts` using `from 'webpresso/oxlint'`
5. Run ingest-lens full QA.

**Files (ingest-lens repo):**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `tsconfig.json` (all extends)
- Modify: `vitest.config.ts` (all apps)
- Modify: `stryker.config.ts`
- Delete: `.oxlintrc.json`
- Create: `oxlint.config.ts`

**Acceptance:**
- [ ] `pnpm install` clean (no resolution errors)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes with new oxlint.config.ts

---

#### Task 3.2: Deprecate and archive @webpresso/agent-* sub-packages

**Status:** todo

**Depends:** Task 3.1

For each of the 9 sub-packages:
1. Add `"deprecated"` field to their `package.json`:
   ```
   "Moved to webpresso subpath exports. See: https://…/MIGRATION.md"
   ```
2. Publish one final version with the deprecation notice.
3. Move the packages from `packages/` to `packages/deprecated/` (or archive
   in the monorepo if they're not standalone).

Do NOT unpublish — deprecated packages remain installable for the transition
window. Old consumers see the deprecation warning on every install.

**Files:**
- Modify: `packages/agent-*/package.json` (deprecated field)
- Create: `.changeset/deprecate-agent-subpackages.md`

**Acceptance:**
- [ ] Each sub-package has `deprecated` in its package.json
- [ ] Changeset created for the final release
- [ ] `npm view @webpresso/agent-tsconfig deprecated` returns the message after publish

---

## Phase 4: QA gates + publish [Complexity: XS]

#### Task 4.1: Full QA gate

**Status:** todo

**Depends:** Tasks 3.1, 3.2

Run full `pnpm qa` in agent-kit and full QA in ingest-lens. Verify:
- Zero typecheck errors in both repos
- Zero lint errors in both repos
- All tests passing in both repos
- `pnpm lint:pkg` (publint + attw) clean on `webpresso` package

**Acceptance:**
- [ ] `mcp__plugin_webpresso-agent-kit_agent-kit__ak_qa` passes
- [ ] ingest-lens QA passes

---

#### Task 4.2: Changeset + publish webpresso with subpath exports

**Status:** todo

**Depends:** Task 4.1

Create a `minor` changeset for `webpresso` describing the sub-package
consolidation. The release pipeline publishes `webpresso` to GH Packages (and
eventually public npm once `ENABLE_NPM_PUBLISH` is set).

```markdown
---
"@webpresso/agent-kit": minor
---
Consolidate @webpresso/agent-* sub-packages into webpresso subpath exports.
Consumers replace 6–8 devDeps with a single `webpresso` devDep.
See MIGRATION.md for the import path changes.
```

**Files:**
- Create: `.changeset/consolidate-subpackages.md`

**Acceptance:**
- [ ] CI publishes new version
- [ ] `npm view webpresso exports` shows all subpaths

---

## Verification Gates

| Gate | Command | Success Criteria |
|---|---|---|
| Type safety | `mcp__plugin_webpresso-agent-kit_agent-kit__ak_typecheck` | Zero errors |
| Lint | `mcp__plugin_webpresso-agent-kit_agent-kit__ak_lint` | Zero violations |
| Tests | `mcp__plugin_webpresso-agent-kit_agent-kit__ak_test` | All pass |
| Pkg validation | `pnpm lint:pkg` (publint + attw) | Zero broken export map entries |
| Full QA | `mcp__plugin_webpresso-agent-kit_agent-kit__ak_qa` | All pass |
| Extraction parity | `diff -ru packages/agent-<name>/src src/config/<name>/` | Empty or import-path-only diff |
| Consumer QA | ingest-lens full QA recipe | All pass |

---

## MCP Tool Routing and Hook Wiring

This consolidation must preserve seamless `ak_*` MCP tool routing and
SessionStart hook injection. Here is the invariant surface:

```
Claude Code session
  └── plugin.json (webpresso-agent-kit marketplace plugin)
        ├── SessionStart hook → ak-sessionstart-routing
        │     └── emits AK_ROUTING_BLOCK into additionalContext
        │           (teaches agents which ak_* MCP tools to use)
        ├── PreToolUse hook  → ak-pretool-guard
        ├── PostToolUse hook → ak-post-tool
        ├── Stop hook        → ak-stop-qa
        └── MCP server       → src/mcp/cli.ts
              └── ak_test, ak_lint, ak_typecheck, ak_qa, ak_audit tools
```

**What changes:** Nothing in the hooks layer. The 8 hook bins (`ak-pretool-guard`,
`ak-post-tool`, `ak-stop-qa`, `ak-guard-switch`, `ak-test-quality-check`,
`ak-sessionstart-routing`, `ak-check-dev-link`, `ak-restore-dev-links`) stay
in `package.json#bin` unchanged. The MCP server at `src/mcp/cli.ts` is
unaffected.

**What needs updating:** The `AK_ROUTING_BLOCK` injected by
`src/hooks/sessionstart/index.ts` and the routing rules in
`catalog/agent/rules/*.md` may reference `@webpresso/agent-*` import paths.
These should be updated to `webpresso/*` in the same PR so agents automatically
get correct guidance for new consumers.

**Task to add:** Task 1.5 below covers this update.

---

#### Task 1.5: Update AK_ROUTING_BLOCK and agent rules for new import paths

**Status:** todo

**Depends:** Task 1.1

The `src/hooks/shared/routing-block.ts` (or wherever `AK_ROUTING_BLOCK` is
assembled) and the routing rules in `catalog/agent/rules/` may reference
sub-package names. After this consolidation, any agent reading the routing
block should see `webpresso/*` import paths, not `@webpresso/agent-*` paths.

1. Search for `@webpresso/agent-` in:
   - `src/hooks/shared/routing-block.ts`
   - `catalog/agent/rules/*.md`
   - `.agent/routing.md` (if present in consumer repos)
   - Any `AGENTS.md` or `CLAUDE.md` that references the sub-package paths
2. Update references to the new `webpresso/*` subpath form.
3. Ensure the routing block's `ak_*` tool guidance is still accurate — the
   MCP tools (`ak_test`, `ak_lint`, `ak_typecheck`, `ak_qa`, `ak_audit`) are
   provided by the plugin, not the npm package, so they're unaffected.

This is a low-risk docs update; the underlying hook wiring is unchanged.

**Files:**
- Modify: `src/hooks/shared/routing-block.ts` (if it references sub-packages)
- Modify: `catalog/agent/rules/package-conventions.md` (references to sub-packages)
- Modify: `catalog/agent/rules/changeset-release.md` (if it references sub-packages)
- Modify: `AGENTS.md` (if it references sub-packages)

**Steps:**
1. `rg "@webpresso/agent-" src/hooks/ catalog/ AGENTS.md --include="*.ts" --include="*.md"`
2. For each match, replace with the `webpresso/*` equivalent or remove if
   the reference was just version-pinning guidance
3. Run `mcp__plugin_webpresso-agent-kit_agent-kit__ak_lint` scoped to
   modified files

**Acceptance:**
- [ ] No `@webpresso/agent-` references remain in routing blocks or agent rules
- [ ] `ak_*` MCP tool names unchanged (they come from plugin, not package)
- [ ] Hook bin names unchanged (`ak-pretool-guard` etc. still in `package.json#bin`)
- [ ] Lint passes on modified files

---

## Cross-Plan References

| Type | Blueprint | Relationship |
|---|---|---|
| Upstream | `webpresso-launch.md` (rename + global install) | This blueprint builds on the renamed `webpresso` package identity |
| Downstream | None | |

---

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
|---|---|---|---|
| tsconfig `extends` not resolving | HIGH — TypeScript ignores exports map | Ship JSON files at literal paths, not just in exports map | 1.2 |
| oxlint `.json` format can't extend packages | HIGH — consumers blocked on migration | Document `oxlint.config.ts` migration path in MIGRATION.md | 1.4 |
| Sub-package peer deps not satisfied | MEDIUM — vitest/workers peer deps | Check each consumer installs required peers independently | 2.1, 2.3 |
| Circular imports (agent-vitest uses agent-tsconfig) | MEDIUM | Inline the tsconfig content instead of importing it | 1.3 |
| `pnpm link` from global install can't resolve devDep subpaths | LOW — only for local dev symlink install | devDep install is the canonical path; symlink users need the devDep anyway | — |
| tshy doesn't include `.json` files in dist | MEDIUM — tshy only compiles `.ts` | Explicitly add `src/config/tsconfig/**/*.json` to `"files"` in package.json | 2.4 |

---

## Non-goals

- Removing the workspace packages entirely before the deprecation window ends
- Migrating the private monorepo (`webpresso/monorepo/`) in this blueprint
- Changing any consumer's vitest version or test configuration beyond the import path
- Creating a mega-barrel `import * from 'webpresso'` that re-exports everything

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| TypeScript `extends` resolution changes in TS 6+ | LOW — the literal-path behavior is intentional by design | Monitor TS release notes; the fix is adding exports entries if behavior changes |
| oxlint drops support for `oxlint.config.ts` (regression) | LOW — it's the recommended format | Pin oxlint version; file a bug upstream if it regresses |
| Extraction-parity fails for docs-lint (11k lines) | MEDIUM — large fold has higher diff risk | Apply extraction-parity rule strictly; any logic diff = reject and investigate |
| Consumer ecosystem has undocumented `@webpresso/agent-*` consumers | MEDIUM — silent breakage | Search GitHub for usage before archiving sub-packages |

---

## Technology Choices

| Component | Technology | Version | Why |
|---|---|---|---|
| tsconfig delivery | Literal `.json` files at filesystem paths | — | TypeScript `extends` doesn't use exports map — verified against TS 5.x source and `@epic-web/config` prior art |
| vitest/stryker delivery | `package.json#exports` subpath entries | — | Standard ESM resolution; works via exports map |
| oxlint delivery | `oxlint.config.ts` + exports map | oxlint ≥0.9 | The `.json` format doesn't support package extends. TS format supported on Node ≥24 (repo enforces this) |
| sub-package fold strategy | Source copy + extraction-parity verification | — | Same pattern used in `fold-webpresso-quality-engine-into-webpresso-agent-kit` blueprint |
| Prior art | `@epic-web/config` | Current | Production-proven pattern for single-package multi-config delivery with subpath exports |
