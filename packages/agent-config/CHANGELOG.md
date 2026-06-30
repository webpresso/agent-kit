# @webpresso/agent-config

## 0.3.1

### Patch Changes

- 4237f06: Upgrade dependency/tooling pins to the latest verified versions and add a dependency freshness gate with Dependabot coverage; AI contract evidence: `docs/bench/reference-parity-matrix.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, `src/__integration__/reference-parity-tool-surface.integration.test.ts`, `docs/bench/session-memory-methodology.md`.
- Updated dependencies [4237f06]
  - @webpresso/agent-core@0.1.1

## 0.3.0

### Minor Changes

- c1aef0e: Introduce `@webpresso/agent-core`, a pure-Node leaf package of shared low-level
  consumer-infra primitives (`/repo-root`, `/process`, `/e2e`, `/deploy`, `/dev`),
  and wire `@webpresso/agent-config` onto it.

  `@webpresso/agent-config` now depends on `@webpresso/agent-core` and re-exports
  the consumer-facing subset under matching subpaths (`/repo-root`, `/process`,
  `/e2e`, `/deploy`, `/dev`), so external consumers depend on a single surface —
  `@webpresso/agent-config` — and never import `@webpresso/agent-core` (or
  `@webpresso/agent-kit`) directly. This sets up the consumer-migration waves to
  delete duplicated repo-root/process/e2e/deploy/dev helpers.

### Patch Changes

- Updated dependencies [c1aef0e]
  - @webpresso/agent-core@0.1.0

## 0.2.0

### Minor Changes

- 4234e0f: Add `createNodeProjects` extension seams for extra aliases, inline deps, and setup files, and publish a new `@webpresso/agent-config/vitest/source-conditions` helper for `@webpresso/source` resolver wiring.

## 0.1.5

### Patch Changes

- 317b7fd: Repair the `@webpresso/agent-config` release baseline and publish path so the package advances from the already-published `0.1.4` version instead of attempting a stale downlevel publish. Release claim gating remains tied to `docs/bench/reference-parity-matrix.md`, `docs/bench/session-memory-methodology.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, and `src/__integration__/reference-parity-tool-surface.integration.test.ts`.

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
