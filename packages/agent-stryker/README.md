# @webpresso/stryker-config

Shared Stryker configuration package.

## Current Role

Use this package for the repo-owned mutation-testing configuration surfaces that are actually exported by the current package.

## Usage

Create package-root mutation config and run it from the package root, not a monorepo root:

```js
// stryker.config.mjs
import { baseConfig } from '@webpresso/stryker-config'

export default {
  ...baseConfig,
  vitest: {
    configFile: 'vitest.stryker.config.ts',
  },
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts'],
}
```

```ts
// vitest.stryker.config.ts
import { nodeConfig } from '@webpresso/vitest-config/node'
import { defineConfig, mergeConfig } from 'vite-plus/test/config'

export default mergeConfig(
  nodeConfig,
  defineConfig({
    test: {
      name: 'my-package/stryker',
      maxWorkers: 1,
      fileParallelism: false,
      include: ['src/**/*.test.ts'],
      exclude: ['**/.stryker-tmp/**'],
    },
  }),
)
```

```json
{
  "scripts": {
    "test:mutation": "stryker run"
  }
}
```

The portable base config now ignores common generated agent/runtime directories
(`.agent/`, `.agents/`, `.codex/`, `.omx/`, etc.), package build output, and
`.d.ts` files so mutation runs stay package-local and portable across repos.

## Development

From the repo root:

```bash
just lint --file packages/foundation/stryker/README.md
just docs
```

Use package-scoped checks when ending a batch:

```bash
just test --package stryker
```
