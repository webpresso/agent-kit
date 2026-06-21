---
"@webpresso/agent-kit": patch
---

Deduplicate overlapping setup-managed Codex OMX PreToolUse hook groups during global hook normalization so Bash tools do not run the same global hook multiple times before the repo guard.

Release-note audit references: `docs/bench/reference-parity-matrix.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, `src/__integration__/reference-parity-tool-surface.integration.test.ts`, `docs/bench/session-memory-methodology.md`.
