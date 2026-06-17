---
"@webpresso/agent-kit": patch
---

Create GitHub Releases for public non-root workspace packages published by the custom release path. The release handoff now records every published package, so `@webpresso/agent-config` publishes produce discoverable package release entries instead of only the root `@webpresso/agent-kit` runtime release. Release claim gating remains tied to `docs/bench/reference-parity-matrix.md`, `docs/bench/session-memory-methodology.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, and `src/__integration__/reference-parity-tool-surface.integration.test.ts`.
