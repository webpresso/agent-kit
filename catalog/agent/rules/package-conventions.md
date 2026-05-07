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

These rules apply across all webpresso public packages: agent-kit, runtime,
db-branching, neon-branching, workers-test-kit, generator, quality-engine,
tooling, webpresso framework, and derivatives.

## Import hygiene

- **No `../` parent-relative imports.** Use workspace package deps or subpath
  exports. `import { x } from '../../utils'` is always wrong; find the
  package that exports it and add it as a dep.
- **No `.mjs` source files.** Write `.ts` with a Bun/Node shebang or as a
  plain module. Never convert existing `.ts` to `.mjs`. Config files that a
  tool requires in `.mjs` are the only documented exception, and only when the
  tool explicitly rejects `.ts`.

## Package manager

- **pnpm only** — `pnpm@10.x`. No npm or yarn lockfiles.
- Run dev scripts via `pnpm run <script>`. Prefer wrapping workflows in
  `package.json` scripts rather than bare-invoking `vitest`, `tsc`, `tshy`,
  etc., directly.

## Publishing & registry

- All packages publish to GitHub Packages:
  `@webpresso:registry=https://npm.pkg.github.com`.
- Auth via `GH_PACKAGES_TOKEN` env var read by the repo's `.npmrc`. Never
  hardcode tokens or create `.env` files with credentials.
- `prepublishOnly` builds the package before every `pnpm publish`. If a
  package outputs a `dist/`, it must have `prepublishOnly: "pnpm build"` (or
  equivalent) so that `pnpm changeset publish` always ships built output.
- All public packages are `"type": "module"` — ESM-only output.
- Run `pnpm lint:pkg` (publint / attw) before releasing to catch broken export
  maps.

## Module format

- Prefer `tshy` for dual CJS/ESM output when broad compatibility is needed;
  `tsup` for bundled output with full tree-shaking.
- Exports map (`package.json#exports`) is the contract — never rely on deep
  path imports that are not listed there.

## Versioning

Version bumps are automated via Changesets. See `changeset-release.md`.
