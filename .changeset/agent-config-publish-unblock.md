---
"@webpresso/agent-core": patch
"@webpresso/agent-config": patch
---

Publish the agent-core subpath exports before rebuilding agent-config so the consumer dedupe config package can resolve `@webpresso/agent-core/*` during release publish.

AI contract evidence: `docs/bench/reference-parity-matrix.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, `src/__integration__/reference-parity-tool-surface.integration.test.ts`, `docs/bench/session-memory-methodology.md`.
