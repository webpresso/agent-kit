---
"@webpresso/agent-kit": patch
---

Fix blueprint task parsing for compact inline metadata, allow non-git setup to complete user/global Codex and OMX setup paths while still rejecting project-only operations outside git worktrees, and keep the release native-artifact matrix from running unsupported workspace postinstall scripts on Windows ARM64.

Release evidence paths: `docs/bench/reference-parity-matrix.md`, `docs/bench/session-memory-methodology.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, and `src/__integration__/reference-parity-tool-surface.integration.test.ts`.
