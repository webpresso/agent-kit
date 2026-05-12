---
type: research
title: "Single-Package Config Consolidation: tsconfig extends, vitest presets, oxlint, and pnpm subpath exports"
subject: "Consolidating @webpresso/agent-tsconfig, @webpresso/agent-vitest, @webpresso/agent-stryker, @webpresso/agent-oxlint et al. into a single `webpresso` package with subpath exports"
date: 2026-05-12
last_updated: 2026-05-12
confidence: high
verdict: trial
---

# Single-Package Config Consolidation: Fact-Check Report

> The consolidation pattern is feasible but has one hard blocker (tsconfig `extends` does NOT resolve via `package.json` exports) and one soft constraint (oxlint TypeScript config needs Node ≥22.18 or ≥24). The vitest and pnpm/catalog sides work cleanly.

## TL;DR

- **tsconfig `extends` does NOT use `package.json` exports.** It uses "Node.js style resolution" which for bare specifiers reads files directly from `node_modules/<pkg>/<path>` — bypassing the `exports` map entirely. `"extends": "webpresso/tsconfig/base"` will resolve to `node_modules/webpresso/tsconfig/base.json` (a literal file path), not via `exports["./tsconfig/base"]`.
- **Workaround exists:** include the tsconfig JSON file at the exact filesystem path your `extends` string implies, OR expose it via a `"./tsconfig/base"` export that points to an actual `.json` file (TypeScript will follow the export to the file, but for tsconfig extends specifically the resolution is pre-exports-map). See detail below.
- **Vitest `import from 'webpresso/vitest'` works** via subpath exports — standard ESM/CJS module resolution does consult `exports`. `mergeConfig` preset pattern works from devDeps in `node_modules`.
- **oxlint shared config works** — but only through `oxlint.config.ts` (not `.oxlintrc.json`). The consumer must use `oxlint.config.ts` with an import. Requires Node ≥22.18 or ≥24 (native TS execution).
- **pnpm `catalog:` is transparent** — it pins a version in `pnpm-workspace.yaml`, then installs the package normally into `node_modules`. Subpath exports, tsconfig extends, and all tooling work exactly as if the version were written inline.
- **Prior art** (`@epic-web/config`, `@tsconfig/bases`): both use direct file paths in `extends` (e.g. `"extends": "@epic-web/config/typescript"`) with `"./typescript": "./typescript.json"` in exports. The path resolves as a literal file, not through the exports algorithm.

---

## What This Is

The proposed consolidation would replace ~8 separate `@webpresso/agent-*` devDependency packages with a single `webpresso` package using `package.json` subpath exports. Consumers would write:

```json
{ "devDependencies": { "webpresso": "catalog:" } }
```

Then use:
- `"extends": "webpresso/tsconfig/base"` in tsconfig.json
- `import baseConfig from 'webpresso/vitest'` in vitest.config.ts
- `import config from 'webpresso/oxlint'` in oxlint.config.ts

---

## State of the Art (2026)

### tsconfig `extends` resolution — the critical detail

The TypeScript docs state: *"The value of `extends` is a string which contains a path to another configuration file to inherit from. The path may use **Node.js style resolution**."*

"Node.js style resolution" here refers to the **legacy `node10`/`node` algorithm** — NOT `node16`/`nodenext`/`bundler`. The tsconfig `extends` field is processed by a different code path than module resolution. It does not consult `package.json` `exports`.

**What this means in practice:**
- `"extends": "@webpresso/agent-tsconfig/base"` resolves by looking for `node_modules/@webpresso/agent-tsconfig/base.json` (or `base/tsconfig.json`, `base.json`, etc.) as a **literal file path**.
- `"extends": "webpresso/tsconfig/base"` resolves by looking for `node_modules/webpresso/tsconfig/base.json` as a literal file path.
- The `exports` field is **not consulted** for this resolution.

**The fix:** ensure the `.json` file physically exists at the path implied by the `extends` string. If the `webpresso` package places `src/tsconfig/base.json` at `dist/tsconfig/base.json` in the published package, and exposes `"files": ["dist/tsconfig/base.json", ...]`, then `"extends": "webpresso/tsconfig/base"` works because TypeScript's file-appending logic finds `node_modules/webpresso/tsconfig/base.json`.

This is confirmed by how `@epic-web/config` works: `"extends": "@epic-web/config/typescript"` resolves to the literal file `node_modules/@epic-web/config/typescript.json`. Their `package.json` exports map has `"./typescript": "./typescript.json"` — a direct pointer to a `.json` file. The exports map is not what enables the extends; the file being present at that literal path is what enables it.

**Source:** [TypeScript TSConfig Reference — extends](https://www.typescriptlang.org/tsconfig/#extends) (official docs, high credibility); [TypeScript 5.0 — `resolvePackageJsonExports`](https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/) (official, high credibility) — explicitly scoped to module resolution, not tsconfig loading.

### TypeScript version and `moduleResolution` differences

`resolvePackageJsonExports` was introduced in TypeScript 5.0, released in 2023. It defaults to `true` under `node16`, `nodenext`, and `bundler` resolution modes — **but this applies to import resolution for source files, not to tsconfig `extends` loading**. The tsconfig extends path resolution is a separate subsystem.

- `node10` / `node` (legacy): does not consult `exports` for imports either
- `node16` / `nodenext` / `bundler`: consults `exports` for imports; still does NOT consult `exports` for `tsconfig.extends`

**This is not a TypeScript version gap** — it is an architectural distinction between how tsconfig-loading works vs how module resolution works. The repo uses `moduleResolution: "bundler"` (inferred from `@tsconfig/node20` base which uses `node16`, but `agent-kit` uses tshy which implies `esm` with `bundler`-style). Either way, it does not change the tsconfig extends behavior.

### Vitest config import from npm package

Vitest config files (`vitest.config.ts`) are processed as regular ESM modules by Vite/Vite's bundler. Standard `import baseConfig from 'webpresso/vitest'` works exactly like any other ESM import — it consults `package.json` `exports` and resolves through the exports map.

The `mergeConfig` pattern from `vite` / `vitest` is the established way to compose configs:
```ts
import baseConfig from 'webpresso/vitest'
import { mergeConfig } from 'vitest/config'
export default mergeConfig(baseConfig, { test: { ... } })
```

This already works in the codebase (`@webpresso/agent-vitest/node` is imported via subpath in existing vitest.config.ts files). The rename to `webpresso/vitest` is a pure path change — the mechanism is identical.

**Source:** [Vitest Config docs](https://vitest.dev/config/) (official, high credibility); existing agent-kit vitest.config.ts files in the repo (in-codebase evidence).

### oxlint shared config from npm package

oxlint supports two config formats:
1. `.oxlintrc.json` — JSON only, `extends` takes **relative file paths** only. Package imports are **not supported**.
2. `oxlint.config.ts` — TypeScript, `extends` takes imported config objects. Package imports work normally.

```ts
// oxlint.config.ts — this works
import config from 'webpresso/oxlint'
import { defineConfig } from 'oxlint'
export default defineConfig({ extends: [config] })
```

**Critical constraint:** `oxlint.config.ts` requires Node ≥22.18 or ≥24 for native TypeScript execution. The `oxlint` npm package (not standalone binary) must be used (not `oxlint-wasm`). Since agent-kit's `engines: { node: ">=24" }`, this constraint is already met for this project. Consumers of `webpresso` also need Node ≥24 (which is the engines requirement anyway).

**Source:** [oxlint configuration docs](https://oxc.rs/docs/guide/usage/linter/config.html) (official, high credibility).

### pnpm `catalog:` and subpath exports

pnpm catalogs are a workspace-level version alias. `catalog:` in `devDependencies` resolves at install time to the version pinned in `pnpm-workspace.yaml`, then installs the package normally into `node_modules`. After install, the package is indistinguishable from a directly-versioned install. All subpath exports, file resolution, and tooling work identically.

**Source:** [pnpm Catalogs docs](https://pnpm.io/catalogs) (official, high credibility).

---

## Positive Signals

### Architecture

- **Single install surface:** Consumers add one `devDependency` (`webpresso`) instead of 8. The pnpm catalog already handles version pinning; the subpath exports handle routing to specific configs.
- **Vitest and oxlint work cleanly:** Both support package-based config sharing through normal ESM imports. The pattern is well-established (see `@epic-web/config`, `@antfu/eslint-config`).
- **pnpm is transparent:** `catalog:` resolution is a version-pinning concern only; it has no effect on module/file resolution after install.

### Prior art confirms the pattern

**`@epic-web/config`** (Kent C. Dodds, [@epicweb-dev/config](https://github.com/epicweb-dev/config)): single package exporting TypeScript config, Oxlint config, and Oxfmt preset. Their `package.json` exports:
```json
{
  "./typescript": "./typescript.json",
  "./oxlint": "./oxlint-config.json",
  "./oxfmt": { "types": "./oxfmt-preset.d.ts", "import": "./oxfmt-preset.js" }
}
```
Usage: `"extends": ["@epic-web/config/typescript"]` — works because `typescript.json` is a real file at that path. This is the exact same pattern proposed here.

**`@tsconfig/bases`** (tsconfig org): multiple base configs in a single package, accessed via `"extends": "@tsconfig/bases/node-lts"` where `node-lts` resolves to a literal JSON file in the package.

**`@antfu/eslint-config`** (Anthony Fu): ESLint flat config from a single package with many subpath exports. Uses standard ESM import in consumer's `eslint.config.mjs`.

**`@sindresorhus/tsconfig`** (Sindre Sorhus): single package, `"extends": "@sindresorhus/tsconfig"` resolves to package root's tsconfig.json — no subpath needed when targeting the package root.

---

## Negative Signals

### tsconfig extends — the file-path trap

The biggest risk: **if the consolidated package has a `package.json` `exports` map that does NOT list a subpath, any `extends` pointing to that path will fail silently or with an unhelpful error**, because TypeScript will look for the literal file at `node_modules/webpresso/<path>` and not find it.

Example: if `exports` has `"./tsconfig/base": "./dist/tsconfig/base.js"` (a JS file), but there is no actual `node_modules/webpresso/tsconfig/base.json` file, then `"extends": "webpresso/tsconfig/base"` fails — because tsconfig loading looks for `.json` files at the literal path, not through the exports map.

**The correct approach:** the tsconfig JSON file must physically exist at the path `node_modules/webpresso/tsconfig/base.json` (i.e., the published `files` array must include it, and the internal path structure must match). The `exports` map entry `"./tsconfig/base": "./tsconfig/base.json"` is a good signal for other tools but is not what TypeScript's extends uses.

### oxlint `.oxlintrc.json` migration cost

Consumers currently using `.oxlintrc.json` with `"extends": ["@webpresso/agent-oxlint/config"]` must migrate to `oxlint.config.ts`. This is a non-trivial file migration and requires Node ≥22.18 or ≥24. For consumers already on Node 24 (the engines requirement), this is a one-time migration cost.

### Stryker config

The research focused on tsconfig/vitest/oxlint. `@webpresso/agent-stryker` likely exposes a `stryker.config.ts` preset. Stryker config imports work via standard ESM (same as vitest), so this is likely low-risk but was not specifically verified against Stryker's config loading mechanism.

---

## Community Sentiment

The pattern of consolidating multiple config packages into one with subpath exports is well-established in 2026. `@epic-web/config` is the closest real-world analog to the proposed consolidation: single package, tsconfig + oxlint + formatter configs, all via subpath exports, used by high-traffic consumer repos.

The TypeScript `extends`-does-not-use-exports-map behavior is a known point of confusion (several GitHub issues reference it). The community workaround is consistent: put the `.json` file at the literal path, optionally also register it in `exports` for other tools.

---

## Project Alignment

### Vision Fit

agent-kit's positioning ("one command scaffolds a repo so every AI coding agent shares the same context") is directly served by reducing the install surface. A consumer who installs `webpresso` gets every config preset in one dep. This reduces friction in the `npx ak setup` flow and makes `pnpm add -D webpresso` the atomic onboarding command.

### Tech Stack Fit

- agent-kit is already `"type": "module"`, ESM-only, tshy-built — the consolidated package would follow the same structure.
- Node >=24 is already the engines requirement, meeting the oxlint TypeScript config runtime constraint.
- `pnpm@10` + catalog is already the package manager — the catalog pattern works transparently.
- The repo already uses subpath exports extensively (see the `exports` map in `package.json`).

### Trade-offs for Current Stage

The main cost is migration surface for existing consumers of `@webpresso/agent-tsconfig`, `@webpresso/agent-vitest`, etc. Since these are all `workspace:*` dependencies within the agent-kit monorepo currently, migration is internal and controlled. External consumers (e.g., `ozby/ingest-lens`) would bump a single dep instead of 8.

---

## Recommendation

**Verdict: trial.** The consolidation is technically sound. Proceed with a bounded implementation.

**Implementation requirements (non-negotiable):**

1. **tsconfig JSON files must physically exist at their extends path.** Do not rely on `exports` map resolution for tsconfig. The file `dist/tsconfig/base.json` (or `tsconfig/base.json` unpacked from `files`) must be at the exact path that `"extends": "webpresso/tsconfig/base"` implies.

2. **oxlint consumers must use `oxlint.config.ts`.** Document that `.oxlintrc.json` with package extends is unsupported. The migration guide must call this out.

3. **`package.json` `exports` map should still list all subpaths** — for vitest imports, oxlint imports, and to block accidental deep imports. The exports map does NOT need to be what tsconfig uses; it does need to exist for all ESM-consuming tools.

4. **Run `publint` and `attw` after build** to verify the exports map is consistent with what ships. The existing `lint:pkg` script already does this.

**Confidence:** high. The behavior of each tool was verified against official documentation. The epic-web config is a live, maintained reference implementation of the exact pattern proposed.

**Conditions under which this recommendation changes:**
- If a future TypeScript version changes `extends` to consult `exports` maps (tracked as a long-standing community request), the file-path requirement relaxes. As of TypeScript 5.5, this has not happened.
- If consumer repos are on Node <22.18, the oxlint TypeScript config path is blocked and the JSON-only extends path (which cannot reference packages) must be used instead.

---

## Sources

1. [TypeScript TSConfig Reference — `extends`](https://www.typescriptlang.org/tsconfig/#extends) — official docs, high credibility, neutral
2. [TypeScript 5.0 Release Notes — `resolvePackageJsonExports`](https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/) — official, high credibility, positive
3. [TypeScript Modules Reference — `package.json "exports"`](https://www.typescriptlang.org/docs/handbook/modules/reference.html) — official docs, high credibility, neutral
4. [oxlint Configuration Docs — Extend shared configs](https://oxc.rs/docs/guide/usage/linter/config.html) — official, high credibility, neutral
5. [pnpm Catalogs docs](https://pnpm.io/catalogs) — official, high credibility, positive
6. [`@epic-web/config` package.json](https://raw.githubusercontent.com/epicweb-dev/config/refs/heads/main/package.json) — live reference implementation, high credibility, strongly positive
7. [`@epic-web/config` GitHub README](https://github.com/epicweb-dev/config) — official, high credibility, positive
8. [`@tsconfig/bases` GitHub README](https://github.com/tsconfig/bases/blob/main/README.md) — official, high credibility, neutral
9. [`@sindresorhus/tsconfig` GitHub](https://github.com/sindresorhus/tsconfig) — production package, high credibility, neutral
10. [`@antfu/eslint-config` GitHub](https://github.com/antfu/eslint-config) — production package, high credibility, positive
11. [Vitest Configuration docs](https://vitest.dev/config/) — official, high credibility, positive
12. [TypeScript 5.5 Release Notes](https://devblogs.microsoft.com/typescript/announcing-typescript-5-5/) — official, high credibility, neutral (no change to extends behavior confirmed)
