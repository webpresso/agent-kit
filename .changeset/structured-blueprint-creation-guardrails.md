---
"@webpresso/agent-kit": patch
---

Route MCP blueprint creation through the shared `BlueprintCreationService`, validate generated drafts before returning them, and keep Vite+ lint/format execution behind the `vp lint`/`vp fmt` facade instead of direct `oxlint`/`oxfmt` commands.

AI contract evidence paths remain unchanged and are cited for release-note continuity: `docs/bench/reference-parity-matrix.md`, `docs/bench/session-memory-methodology.md`, `src/__integration__/reference-parity-host-smoke.integration.test.ts`, and `src/__integration__/reference-parity-tool-surface.integration.test.ts`.
