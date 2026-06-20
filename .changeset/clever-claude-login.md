---
"@webpresso/agent-kit": patch
---

Detect first-party Claude CLI login for local benchmark auth so `BENCH_AUTH_MODE=claude-login` can use `claude auth status` without requiring `ANTHROPIC_API_KEY`, and classify stale CLI execution sessions when `claude -p` returns 401 after a valid CLI login.

Reference-parity and session-memory evidence remains governed by `docs/bench/reference-parity-matrix.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, `src/__integration__/reference-parity-tool-surface.integration.test.ts`, and `docs/bench/session-memory-methodology.md`.
