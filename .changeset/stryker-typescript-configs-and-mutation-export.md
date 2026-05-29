---
"@webpresso/agent-kit": minor
---

Add `typescriptBaseConfig` and `typescriptWorkersBaseConfig` to `@webpresso/agent-kit/stryker`, and export `runAffectedMutation` via `@webpresso/agent-kit/mutation`.

- `typescriptBaseConfig` extends `baseConfig` with `checkers: ["typescript"]` and `tsconfigFile: "tsconfig.json"` — eliminating boilerplate repeated in every consumer `stryker.config.ts`
- `typescriptWorkersBaseConfig` further extends it with `vitest: { configFile: "vitest.stryker.config.ts" }` for Cloudflare Workers packages whose `vitest.config.ts` uses `@cloudflare/vitest-pool-workers` (incompatible with Stryker's pool injection)
- `runAffectedMutation()` contains the affected-package detection logic (git diff → pnpm filter), replacing duplicated `scripts/affected-mutation.ts` files in consumer repos
