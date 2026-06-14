---
"@webpresso/agent-kit": patch
---

fix: harden session fetch, command execution, secrets, and blueprint MCP internals

This release ships six coordinated blueprint lanes:

- `session-fetch-and-index` now blocks internal/localhost/private hosts by default, with explicit host allowlisting for trusted fetches.
- session command execution now validates commands and cwd containment before the existing `sh -c` path runs.
- secret-manager failures redact/truncate stderr details and no longer surface stdout snippets that may contain secret payloads.
- stream/resource cleanup removes a compile lock fd leak and observes quality-log stream errors from creation time.
- dynamic RegExp helper usage is consolidated onto the canonical string utility and regex syntax validation is length-bounded.
- blueprint MCP server decomposition begins with shared sync/payload/error/schema helpers while preserving public tool contracts.

Release claims remain gated by `docs/bench/reference-parity-matrix.md`,
`src/__integration__/reference-parity-host-smoke.integration.test.ts`,
`src/__integration__/reference-parity-tool-surface.integration.test.ts`, and
`docs/bench/session-memory-methodology.md`.
