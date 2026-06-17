---
"@webpresso/agent-kit": major
"@webpresso/agent-config": minor
---

Extract `@webpresso/agent-config`: move tsconfig, vitest, stryker, and workers-test presets to a new binary-free package.

**Breaking change for `@webpresso/agent-kit`**: the subpaths `./tsconfig/*`, `./vitest/*`, `./stryker`, and `./workers-test` have been removed. Import them from `@webpresso/agent-config` instead.
