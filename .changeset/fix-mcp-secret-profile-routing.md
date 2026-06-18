---
"@webpresso/agent-kit": patch
---

Fix secret-aware MCP tooling so `wp_e2e` and `wp_ci_act` resolve the caller repo root before secret lookup, and split `wp_ci_act` runtime profiles from provider-specific secret environment selectors via `secretEnvProfile` / `--secret-env-profile`.


Reference-parity evidence remains governed by `docs/bench/reference-parity-matrix.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, `src/__integration__/reference-parity-tool-surface.integration.test.ts`, and `docs/bench/session-memory-methodology.md`.
