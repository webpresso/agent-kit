# @webpresso/agent-oxlint

Custom [Oxlint](https://oxc.rs/docs/guide/usage/linter) plugins for enforcing Webpresso code conventions. Raw `.js` plugin files — no build step required.

## Installation

```sh
pnpm add -D @webpresso/agent-oxlint
```

## Plugins

| Plugin | Import path | Description |
|--------|------------|-------------|
| `import-hygiene` | `@webpresso/agent-oxlint/import-hygiene` | Bans relative parent imports, cross-package filesystem traversal, relative mock paths, and forbidden package imports |
| `code-safety` | `@webpresso/agent-oxlint/code-safety` | Flags unsafe `as any` casts and catch blocks that only `console.error` without re-throwing |
| `foundation-purity` | `@webpresso/agent-oxlint/foundation-purity` | Prevents HTTP framework imports (hono, express, fastify, koa) in foundation-tier packages |
| `graphql-conventions` | `@webpresso/agent-oxlint/graphql-conventions` | Rejects singular GraphQL field names (Hasura uses plural table names) and inline GraphQL in client query surfaces |
| `monorepo-paths` | `@webpresso/agent-oxlint/monorepo-paths` | Bans hardcoded repo root traversal via `import.meta.dirname`/`__dirname` + `../../` and cross-package path traversal |
| `query-patterns` | `@webpresso/agent-oxlint/query-patterns` | Enforces TanStack Query hard cuts: named query options objects and `isPending` over `isLoading` |
| `testing-quality` | `@webpresso/agent-oxlint/testing-quality` | Bans weak assertions (`toBeTruthy`, `toBeFalsy`, etc.), bare spy assertions, internal mocks, and cold dynamic imports in tests |
| `tier-boundaries` | `@webpresso/agent-oxlint/tier-boundaries` | Enforces monorepo tier import rules — requires a `package-boundaries.js` at your repo root (see below) |

## Usage

Reference individual plugins in your `.oxlintrc.json`:

```json
{
  "plugins": ["@webpresso/agent-oxlint/import-hygiene"]
}
```

Or use the barrel index to load all plugins:

```js
import { importHygiene, codeSafety, testingQuality } from '@webpresso/agent-oxlint'
```

### `tier-boundaries` — Consumer Requirement

The `tier-boundaries` plugin dynamically imports `package-boundaries.js` from your repo root at runtime (3 levels up from the plugin's installed location). You must provide this file in your monorepo root:

```js
// package-boundaries.js (repo root)
export const PACKAGE_TIERS = {
  utils: 0,     // foundation tier
  database: 1,  // core tier
  'app-core': 2, // feature tier
  'cli-wp': 3,  // leaf/app tier
}
```

## License

MIT
