---
"@webpresso/agent-kit": patch
---

Add a stateful `wp_worktree` MCP tool for safe worktree lifecycle operations with dirty/locked protection, bounded structured output, and execute-gated mutations that reuse existing `wp worktree` behavior.

Reference-parity and session-memory evidence remains governed by `docs/bench/reference-parity-matrix.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, `src/__integration__/reference-parity-tool-surface.integration.test.ts`, and `docs/bench/session-memory-methodology.md`.
