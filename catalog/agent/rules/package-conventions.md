---
type: rule
slug: package-conventions
title: Webpresso Public Package Conventions
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-07'
paths: 
  - '**/*.ts'
  - 'package.json'
  - '.npmrc'
---

# Webpresso Public Package Conventions

These rules apply across all webpresso public packages and derivatives. For
consumer-facing agent config helpers, prefer the single public `webpresso`
package with explicit subpath exports over new split packages.

## Import hygiene

- **No `../` parent-relative imports.** Use workspace package deps or subpath
  exports. `import { x } from '../../utils'` is always wrong; find the
  package that exports it and add it as a dep.
- **Use `webpresso/*` subpaths for folded agent config.** Consumers should add
  the public `webpresso` package and import from subpath exports such as
  `webpresso/oxlint`, `webpresso/vitest`, `webpresso/test-preset`,
  `webpresso/e2e-preset`, `webpresso/tsconfig`, `webpresso/docs-linter`,
  `webpresso/stryker`, `webpresso/launch`, and `webpresso/workers-test`.
  Do not tell consumers to install retired split agent config packages.
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

- Scoped `@webpresso/*` packages publish to GitHub Packages:
  `@webpresso:registry=https://npm.pkg.github.com`.
- Auth via `GH_PACKAGES_TOKEN` env var read by the repo's `.npmrc`. Never
  hardcode tokens or create `.env` files with credentials.
- `prepublishOnly` builds the package before every publish. If a
  package outputs a `dist/`, it must have `prepublishOnly: "vp run build"` (or
  equivalent) so that Changesets publishing always ships built output.
- All public packages are `"type": "module"` — ESM-only output.
- Run `vp run lint:pkg` (publint / attw) before releasing to catch broken export
  maps.

**Exception — public `webpresso` package:** The `webpresso` package on
public npmjs.org is unscoped and published with `access: "public"`. It is both
the frictionless globally-installed CLI (`vp install -g webpresso`) and the
consumer dependency for folded agent config helpers via `webpresso/*` subpath
exports. The dual-publish is handled by `scripts/publish-webpresso.ts` (see
`changeset-release.md` § Dual-publish pattern). Scoped `@webpresso/*` packages
continue to use GitHub Packages.

## Module format

- Prefer `tshy` for dual CJS/ESM output when broad compatibility is needed;
  `tsup` for bundled output with full tree-shaking.
- Exports map (`package.json#exports`) is the contract — never rely on deep
  path imports that are not listed there.

## Versioning

Version bumps are automated via Changesets. See `changeset-release.md`.
