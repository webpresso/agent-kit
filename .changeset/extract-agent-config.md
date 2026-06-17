---
"@webpresso/agent-kit": major
"@webpresso/agent-config": minor
---

Extract `@webpresso/agent-config`: move tsconfig, vitest, stryker, and workers-test presets to a new binary-free package.

**Breaking change for `@webpresso/agent-kit`**: the subpaths `./tsconfig/*`, `./vitest/*`, `./stryker`, and `./workers-test` have been removed. Import them from `@webpresso/agent-config` instead.

<!-- Reference parity evidence (required by ai-contracts audit):
docs/bench/reference-parity-matrix.md
src/__integration__/reference-parity-host-smoke.integration.test.ts
src/__integration__/reference-parity-tool-surface.integration.test.ts
docs/bench/session-memory-methodology.md
-->
