---
"@webpresso/agent-kit": patch
---

Make `wp setup` verify Codex plugin install state before and after the bounded install command so successful installs are not reported as timeouts.

Harden managed hook wrappers so unexpected child failures degrade by hook policy, persist bounded diagnostics, and are inspectable with `wp hooks errors`.

Release evidence: `docs/bench/reference-parity-matrix.md`, `docs/bench/session-memory-methodology.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, and `src/__integration__/reference-parity-tool-surface.integration.test.ts`.
