# @webpresso/agent-docs-lint

## 0.2.0

### Minor Changes

- 4b7e298: Absorb tooling/ + workers-test-kit/ into agent-kit under the new `agent-*`
  naming convention.

  Renames:

  - `@webpresso/typescript-config` → `@webpresso/agent-tsconfig`
  - `@webpresso/vitest-config` → `@webpresso/agent-vitest`
  - `@webpresso/stryker-config` → `@webpresso/agent-stryker`
  - `@webpresso/test-preset` → `@webpresso/agent-test-preset`
  - `@webpresso/e2e-preset` → `@webpresso/agent-e2e-preset`
  - `@webpresso/oxlint-plugins` → `@webpresso/agent-oxlint`
  - `@webpresso/docs-linter` → `@webpresso/agent-docs-lint`
  - `@webpresso/launch-engine` → `@webpresso/agent-launch`
  - `@webpresso/workers-test-kit` → `@webpresso/agent-workers-test`

  Hard-cut migration — old names are unpublished, no compat aliases. The old
  package names will be deleted from GH Packages in Wave 3 cleanup.

  Consumers (monorepo, ingest-lens) update their imports + catalog entries
  to the new names in their respective cut-over PRs (Wave 2).
