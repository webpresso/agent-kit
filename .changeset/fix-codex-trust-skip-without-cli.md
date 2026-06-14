---
"@webpresso/agent-kit": patch
---

fix(setup): skip Codex hook trust sync when the `codex` CLI is unavailable

`wp setup` now checks for the optional `codex` binary before starting the Codex
app-server trust sync. When `codex` is not installed but `.codex/hooks.json`
exists, setup skips the trust-sync step silently instead of surfacing a raw
transport warning such as "Executable not found in $PATH: codex". Tests can
inject the availability probe, and existing app-server injection paths remain
unchanged.

Release claims remain gated by `docs/bench/reference-parity-matrix.md`,
`src/__integration__/reference-parity-host-smoke.integration.test.ts`,
`src/__integration__/reference-parity-tool-surface.integration.test.ts`, and
`docs/bench/session-memory-methodology.md`.
