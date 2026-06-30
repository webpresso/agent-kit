# @webpresso/agent-core

## 0.1.1

### Patch Changes

- 4237f06: Upgrade dependency/tooling pins to the latest verified versions and add a dependency freshness gate with Dependabot coverage; AI contract evidence: `docs/bench/reference-parity-matrix.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, `src/__integration__/reference-parity-tool-surface.integration.test.ts`, `docs/bench/session-memory-methodology.md`.

## 0.1.0

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
