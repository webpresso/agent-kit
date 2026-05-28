---
type: rule
slug: package-conventions
title: Webpresso Public Package Conventions
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-28'
paths: 
  - '**/*.ts'
  - 'package.json'
  - '.npmrc'
---

# Webpresso Public Package Conventions

These rules apply to this repository and downstream consumers. The canonical
package identity is `@webpresso/agent-kit`; do not use unscoped `webpresso` as
the package contract.

## Import hygiene

- **No `../` parent-relative imports.** Use workspace package deps or subpath
  exports. `import { x } from '../../utils'` is always wrong; find the
  package that exports it and add it as a dep.
- **Use `@webpresso/agent-kit/*` subpaths for folded agent config.** Consumers
  should add `@webpresso/agent-kit` and import subpaths such as
  `@webpresso/agent-kit/oxlint`, `@webpresso/agent-kit/vitest/node`,
  `@webpresso/agent-kit/test-preset`, `@webpresso/agent-kit/e2e-preset`,
  `@webpresso/agent-kit/tsconfig/base.json`,
  `@webpresso/agent-kit/docs-lint`, `@webpresso/agent-kit/stryker`,
  `@webpresso/agent-kit/launch`, and `@webpresso/agent-kit/workers-test`.
  Do not tell consumers to install retired split `@webpresso/agent-*` config
  packages.
- **No `.mjs` source files.** Write `.ts` with a Bun/Node shebang or as a
  plain module. Never convert existing `.ts` to `.mjs`. Config files that a
  tool requires in `.mjs` are the only documented exception, and only when the
  tool explicitly rejects `.ts`.

## Package manager

- **Vite+ facade first** — run repo workflows through `vp` (`vp install`,
  `vp run <script>`, `vp exec <bin>`). Vite+ selects the repo-declared package
  manager substrate from `packageManager`/lockfiles; do not use `npm`, `npx`,
  or raw package-manager globals for normal repo operations.
- The Webpresso package substrate remains `pnpm@11.x`; keep `pnpm-workspace.yaml`
  and `pnpm-lock.yaml`, but access them through `vp` unless a release procedure
  explicitly requires the raw package-manager command.

## Publishing & registry

- The canonical package is `@webpresso/agent-kit`.
- Publish target is GitHub Packages (`npm.pkg.github.com`) via scoped auth.
- Auth via `NPM_TOKEN` in CI. Never hardcode tokens or create `.env` files
  with credentials.
- `prepublishOnly` builds the package before every publish. If a
  package outputs a `dist/`, it must have `prepublishOnly: "vp run build"` (or
  equivalent) so that Changesets publishing always ships built output.
- All public packages are `"type": "module"` — ESM-only output.
- Run `vp run lint:pkg` (publint / attw) before releasing to catch broken export
  maps.

## Module format

- Prefer `tshy` for dual CJS/ESM output when broad compatibility is needed;
  `tsup` for bundled output with full tree-shaking.
- Exports map (`package.json#exports`) is the contract — never rely on deep
  path imports that are not listed there.

## Versioning

Version bumps are automated via Changesets. See `changeset-release.md`.
