# @webpresso/agent-vitest

## 0.3.0

### Minor Changes

- afe42c2: Add `@webpresso/source` to vitest's resolve `conditions` in `nodeConfig`,
  `webpressoNodeConfig`, `createNodeProjects`, and `createWebpressoNodeProjects`.

  Monorepo consumers can now ship workspace packages whose `exports` map a
  `@webpresso/source` condition at `./src/*.ts` (with `default` still pointing
  at dist for publishability contracts). With this condition wired into the
  shared vitest config, fresh-clone test runs resolve workspace-internal
  dependencies to source files automatically — no per-package `vitest.config`
  drift, no requirement to build dependents before testing.

## 0.2.0

### Minor Changes

- 4b7e298: Absorb tooling/ + workers-test-kit/ into agent-kit under the new `agent-*`
  naming convention.

  Renames:

  - `@webpresso/agent-tsconfig` → `@webpresso/agent-tsconfig`
  - `@webpresso/agent-vitest` → `@webpresso/agent-vitest`
  - `@webpresso/agent-stryker` → `@webpresso/agent-stryker`
  - `@webpresso/agent-test-preset` → `@webpresso/agent-test-preset`
  - `@webpresso/agent-e2e-preset` → `@webpresso/agent-e2e-preset`
  - `@webpresso/agent-oxlint` → `@webpresso/agent-oxlint`
  - `@webpresso/agent-docs-lint` → `@webpresso/agent-docs-lint`
  - `@webpresso/agent-launch` → `@webpresso/agent-launch`
  - `@webpresso/agent-workers-test` → `@webpresso/agent-workers-test`

  Hard-cut migration — old names are unpublished, no compat aliases. The old
  package names will be deleted from GH Packages in Wave 3 cleanup.

  Consumers (monorepo, ingest-lens) update their imports + catalog entries
  to the new names in their respective cut-over PRs (Wave 2).
