# @webpresso/agent-config

## 0.1.4

### Patch Changes

- Synchronize the local package manifest with the already-published npm baseline so the next Changesets patch release advances from `0.1.4` instead of attempting a stale `0.1.1` publish.

## 0.1.0

### Minor Changes

- 6f2def1: Extract `@webpresso/agent-config`: move tsconfig, vitest, stryker, and workers-test presets to a new binary-free package.

  **Breaking change for `@webpresso/agent-kit`**: the subpaths `./tsconfig/*`, `./vitest/*`, `./stryker`, and `./workers-test` have been removed. Import them from `@webpresso/agent-config` instead.

  Evidence: docs/bench/reference-parity-matrix.md, src/**integration**/reference-parity-host-smoke.integration.test.ts, src/**integration**/reference-parity-tool-surface.integration.test.ts, docs/bench/session-memory-methodology.md

### Patch Changes

- 27f8157: Repair the extracted agent-config release surface by cataloging shared deps, removing the root package's non-publishable local manifest edge, and recording the new public package in the package-surface contract.

  Evidence:

  - docs/bench/reference-parity-matrix.md
  - src/**integration**/reference-parity-host-smoke.integration.test.ts
  - src/**integration**/reference-parity-tool-surface.integration.test.ts
  - docs/bench/session-memory-methodology.md
