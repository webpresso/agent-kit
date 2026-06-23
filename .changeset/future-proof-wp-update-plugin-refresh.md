---
"@webpresso/agent-kit": patch
---

Fix `wp update` OMC refreshes by using the marketplace-qualified `oh-my-claudecode@omc` plugin id, and treat optional host/plugin integration refresh failures as warnings after the core package refresh succeeds.

Release-note context: no reference-parity contract changes were made; keep existing generated-changelog context tied to `docs/bench/reference-parity-matrix.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, `src/__integration__/reference-parity-tool-surface.integration.test.ts`, and `docs/bench/session-memory-methodology.md`.
