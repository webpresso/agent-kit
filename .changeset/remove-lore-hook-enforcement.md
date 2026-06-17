---
"@webpresso/agent-kit": patch
---

Remove automatic Lore commit-message enforcement from local and generated Husky hooks. The `wp audit commit-message` command remains available for manual checks, while release compatibility branch pushes now run with `HUSKY=0` so generated dist-only branches are not blocked by developer-local hooks.

Release claim gating remains tied to `docs/bench/reference-parity-matrix.md`, `docs/bench/session-memory-methodology.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, and `src/__integration__/reference-parity-tool-surface.integration.test.ts`.
