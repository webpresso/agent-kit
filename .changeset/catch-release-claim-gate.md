---
"@webpresso/agent-kit": patch
---

Harden the AI contracts audit so pending Changesets release notes must carry
the reference-parity release-claim gate before the generated Version Packages PR
updates `CHANGELOG.md`.

Release claims remain gated by `docs/bench/reference-parity-matrix.md`,
`src/__integration__/reference-parity-host-smoke.integration.test.ts`,
`src/__integration__/reference-parity-tool-surface.integration.test.ts`, and
`docs/bench/session-memory-methodology.md`.
