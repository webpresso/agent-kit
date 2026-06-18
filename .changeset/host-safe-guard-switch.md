---
"@webpresso/agent-kit": patch
---

Make guard on/off hook control prompts return host-safe JSON block decisions instead of exiting nonzero, allow lease-protected `git push --force-with-lease` while still blocking plain force pushes, and add MCP `full` output options for summary-first quality tools.

Release evidence references: `docs/bench/reference-parity-matrix.md`, `docs/bench/session-memory-methodology.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, and `src/__integration__/reference-parity-tool-surface.integration.test.ts`.
