---
type: vision
last_updated: 2026-05-05
---

# workers-test-kit Vision

## The problem

Testing Cloudflare Workers code outside a Worker runtime requires
hand-rolled mocks for `ExecutionContext`, Hyperdrive, Durable Objects,
Containers, KV, R2, queues, and the env shape. Every team rebuilds these
slightly differently — type-incomplete, missing edge cases (e.g.
`waitUntil` semantics) — and the tests pass while production breaks.

## North star

> **Production-fidelity Worker mocks, by default.** Drop `BaseWorkerEnv`
> + `createMock*` helpers into a vitest setup and the test environment
> behaves like workerd would, including the surprising parts.

## In scope

- `BaseWorkerEnv` and per-binding mock factories (Hyperdrive, DO, Container,
  KV, R2, queues, …) typed against `@cloudflare/workers-types`.
- `createMockExecutionContext` with correct `waitUntil` / `passThroughOnException`
  semantics.
- Builder helpers that compose env + bindings + request fixtures with
  minimal boilerplate.
- vitest peer integration — works with stock `vitest` and with
  `@cloudflare/vitest-pool-workers` setups.

## Out of scope

- A Worker runtime. This package is mocks for unit/integration tests
  outside workerd; for in-runtime tests, use `@cloudflare/vitest-pool-workers`.
- Application-layer test utilities (request builders for a specific app,
  domain fixtures).
- Cloudflare API clients or deploy tooling.
- Non-vitest test runners.

## Design principles

- **Type-first.** Mocks must satisfy the real `@cloudflare/workers-types`
  interfaces. A mock that accepts a call workerd would reject is a bug.
- **Behavioral fidelity over convenience.** Where workerd has surprising
  semantics (`waitUntil` after response, DO single-threading), the mocks
  reproduce them.
- **Composable, not magical.** Helpers are pure factories; consumers
  assemble env + bindings explicitly. No global setup, no hidden state.
- **Peer deps for the host.** `@cloudflare/workers-types` and `vitest`
  are peers, not deps — consumers control versions.
- **ESM-only, modern Node.** No CJS dual-build, no legacy targets.
