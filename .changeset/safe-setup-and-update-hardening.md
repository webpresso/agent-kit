---
"@webpresso/agent-kit": patch
---

Harden agent-kit update and setup flows: skip reinstall when already up to date, tighten cache checks, polish global repair output, and make `wp setup` safe to run outside initialized webpresso repos.

Reference parity: docs/bench/reference-parity-matrix.md, docs/bench/session-memory-methodology.md, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, `src/__integration__/reference-parity-tool-surface.integration.test.ts`.
