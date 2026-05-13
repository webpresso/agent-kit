---
type: guide
title: Migrating to webpresso
status: active
---

# Migrating from `@webpresso/agent-kit` to `webpresso`

`webpresso` is the public npm package for agent-kit. It keeps the same CLI and
hook behavior while consolidating the separate `@webpresso/agent-*`
development packages behind `webpresso/*` subpath exports.

## Why this change

Consumers previously pinned one CLI package plus several helper
devDependencies. After consolidation, a repo can keep a single `webpresso`
dependency for the CLI, shared configs, presets, and runtime helpers.

## Public npm staging caveat

Changesets still targets `package.json#name` as `@webpresso/agent-kit`. The
public `webpresso` package is staged by `scripts/publish-webpresso.ts` during
the release gate, where the staged package manifest changes the package name and
npm registry settings. Do not manually edit `package.json#name`, and do not
publish from this docs task.

## Import and config path migration table

| Area | Old package/path | New `webpresso` path | Migration |
| --- | --- | --- | --- |
| tsconfig | `@webpresso/agent-tsconfig/base.json` | `webpresso/tsconfig/base.json` | Update extends values. |
| tsconfig | `@webpresso/agent-tsconfig/cloudflare.json` | `webpresso/tsconfig/cloudflare.json` | Update Worker package extends values. |
| tsconfig | `@webpresso/agent-tsconfig/library.json` | `webpresso/tsconfig/library.json` | Update library package extends values. |
| tsconfig | `@webpresso/agent-tsconfig/react-library.json` | `webpresso/tsconfig/react-library.json` | Update React library package extends values. |
| tsconfig | `@webpresso/agent-tsconfig/react-router.json` | `webpresso/tsconfig/react-router.json` | Update React Router package extends values. |
| tsconfig | `@webpresso/agent-tsconfig/webpresso.json` | `webpresso/tsconfig/webpresso.json` | Update Webpresso repo extends values. |
| vitest | `@webpresso/agent-vitest/node` | `webpresso/vitest/node` | Update Node config imports. |
| vitest | `@webpresso/agent-vitest/react` | `webpresso/vitest/react` | Update React config imports. |
| vitest | `@webpresso/agent-vitest/react-router` | `webpresso/vitest/react-router` | Update React Router config imports. |
| vitest | `@webpresso/agent-vitest/workers` | `webpresso/vitest/workers` | Update Workers config imports. |
| vitest | `@webpresso/agent-vitest/react-setup` | `webpresso/vitest/react-setup` | Update setup file references. |
| vitest | `@webpresso/agent-vitest/flakiness-reporter` | `webpresso/vitest/flakiness-reporter` | Update reporter imports. |
| stryker | `@webpresso/agent-stryker` | `webpresso/stryker` | Update Stryker config imports. |
| stryker | `@webpresso/agent-stryker/webpresso` | `webpresso/stryker/webpresso` | Update Webpresso Stryker preset imports. |
| oxlint | `@webpresso/agent-oxlint` | `webpresso/oxlint` | Replace .oxlintrc.json JSON-only wiring with oxlint.config.ts. |
| oxlint | `@webpresso/agent-oxlint/import-hygiene` | `webpresso/oxlint/import-hygiene` | Update direct plugin imports. |
| oxlint | `@webpresso/agent-oxlint/monorepo-paths` | `webpresso/oxlint/monorepo-paths` | Update direct plugin imports. |
| oxlint | `@webpresso/agent-oxlint/testing-quality` | `webpresso/oxlint/testing-quality` | Update direct plugin imports. |
| workers-test | `@webpresso/agent-workers-test` | `webpresso/workers-test` | Update Cloudflare helper imports. |
| docs-lint | `@webpresso/agent-docs-lint` | `webpresso/docs-lint` | Update docs-lint API imports. |
| docs-lint | `@webpresso/agent-docs-lint/schemas` | `webpresso/docs-lint/schemas` | Update schema imports. |
| docs-lint | `@webpresso/agent-docs-lint/generator` | `webpresso/docs-lint/generator` | Update generator imports. |
| launch | `@webpresso/agent-launch` | `webpresso/launch` | Update launch imports. |
| test-preset | `@webpresso/agent-test-preset` | `webpresso/test-preset` | Update preset imports. |
| test-preset | `@webpresso/agent-test-preset/vitest` | `webpresso/test-preset/vitest` | Update Vitest preset imports. |
| e2e-preset | `@webpresso/agent-e2e-preset` | `webpresso/e2e-preset` | Update E2E helper imports. |
| e2e-preset | `@webpresso/agent-e2e-preset/playwright` | `webpresso/e2e-preset/playwright` | Update Playwright preset imports. |

## Oxlint TypeScript config

The consolidated Oxlint export is a TypeScript module surface. If a consumer
previously composed Webpresso rules through `.oxlintrc.json`, move that wiring
to `oxlint.config.ts` and import `config` from `webpresso/oxlint`.

## Migration examples

- tsconfig: change `extends` from `@webpresso/agent-tsconfig/base.json` to
  `webpresso/tsconfig/base.json`.
- Vitest: change imports such as `@webpresso/agent-vitest/node` to
  `webpresso/vitest/node`.
- Stryker: change `@webpresso/agent-stryker` to `webpresso/stryker`.
- Workers helpers: change `@webpresso/agent-workers-test` to
  `webpresso/workers-test`.
- Docs lint: change `@webpresso/agent-docs-lint` to `webpresso/docs-lint`.
- Launch and presets: use `webpresso/launch`, `webpresso/test-preset`, and
  `webpresso/e2e-preset`.

## State files

Existing `.agent/.blueprints.db` and other `.agent/` state files are harmless
orphans after migration. You do not need to delete them manually. The first
`wp` command in a repo cold-starts the blueprint DB from `blueprints/` markdown.

## Hook bins

The hook entry-point binary names are unchanged: `ak-pretool-guard`,
`ak-post-tool`, `ak-stop-qa`, `ak-guard-switch`, `ak-test-quality-check`,
`ak-sessionstart-routing`, `ak-check-dev-link`, and `ak-restore-dev-links`.
Existing `.claude/settings.json` and `.codex/hooks.json` files do not need to
change.

## Plugin marketplace

The package migration does not rename the marketplace plugin identity. Continue
using the Webpresso/agent-kit plugin entry while installing the runtime from the
public `webpresso` package.

## Troubleshooting

**Old `@webpresso/agent-kit` still runs when I type `ak`** — remove the scoped
package from local devDependencies and reinstall.

**Oxlint cannot load plugins from `.oxlintrc.json`** — migrate to
`oxlint.config.ts` and import from `webpresso/oxlint`.
