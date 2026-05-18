# @webpresso/agent-stryker

## 0.2.2

### Patch Changes

- ed91f97: Republish with built dist/ included. The previous publishes (agent-kit@0.18.2,
  agent-vitest@0.2.0, agent-stryker@0.2.0, agent-tsconfig@0.2.0) shipped without
  their dist/ because changeset publish does not invoke prepublishOnly and the
  release.yml workflow had no explicit Build step before Publish. Pipeline fix:
  release.yml now runs `pnpm -r --workspace-concurrency=1 run build` between
  `Version packages` and `Publish`.

## 0.2.1

### Patch Changes

- 1be5f27: Deprecated: migrate to the consolidated webpresso package subpath exports. See https://github.com/webpresso/agent-kit/blob/main/MIGRATION.md

  Marks the final `@webpresso/agent-*` sub-package releases with the shared migration notice. Registry deprecation commands remain deferred to the release gate.

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
