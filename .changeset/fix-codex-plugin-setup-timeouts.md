---
"@webpresso/agent-kit": patch
---

Make `wp setup` verify Codex plugin install state before and after the bounded install command so successful installs are not reported as timeouts.

Route generated Claude/Codex hooks through direct `wp hook <name>` commands, move fallback/error capture into `wp hook`, and remove the retired JS shim/shell-wrapper path including agent-kit-owned OMX global hook wrapper normalization.

Release evidence: `docs/bench/reference-parity-matrix.md`, `docs/bench/session-memory-methodology.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, and `src/__integration__/reference-parity-tool-surface.integration.test.ts`.
