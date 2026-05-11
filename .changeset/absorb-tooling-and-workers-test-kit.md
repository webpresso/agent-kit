---
"@webpresso/agent-tsconfig": minor
"@webpresso/agent-vitest": minor
"@webpresso/agent-stryker": minor
"@webpresso/agent-test-preset": minor
"@webpresso/agent-e2e-preset": minor
"@webpresso/agent-oxlint": minor
"@webpresso/agent-docs-lint": minor
"@webpresso/agent-launch": minor
"@webpresso/agent-workers-test": minor
---

Absorb tooling/ + workers-test-kit/ into agent-kit under the new `agent-*`
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
