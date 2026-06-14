---
"@webpresso/agent-kit": patch
---

fix(setup): cross-platform command detection (Windows) + codex-trust polish

`wp setup` detected installed CLIs (codex, claude) by shelling out to
`spawnSync('which', [cmd])` across five copy-pasted helpers. `which` is POSIX-only
(Windows uses `where`), so on Windows every check returned false and codex/claude
integration silently never ran. All five now share one zero-dependency,
cross-platform `commandExists` util (`#runtime/command-exists`) that scans
`PATH` + `PATHEXT` directly — no subprocess — and requires a runnable executable
(posix exec-bit), matching `which`'s semantics so a directory or non-executable
file named like the command is not a false positive.

Also: `wp setup` now prints an info notice when codex is absent instead of
silently skipping codex hook trust, and the codex-trust warning references
`.codex/hooks.json` instead of a malformed placeholder path.

Release claims remain gated by `docs/bench/reference-parity-matrix.md`,
`src/__integration__/reference-parity-host-smoke.integration.test.ts`,
`src/__integration__/reference-parity-tool-surface.integration.test.ts`, and
`docs/bench/session-memory-methodology.md`.
