---
"@webpresso/agent-kit": minor
---

feat(test): parallelize `wp test` across workspace shards

`wp test` (and the `wp_test` MCP tool) now accepts an optional
`workspaceSharding` input (`enabled`, `maxShards`, `minFilesToShard`,
`targetFilesPerShard`, `totalBudgetMs`) that splits a workspace test run into
parallel shards under a shared time budget. Existing single-run behavior is
unchanged when the option is omitted.

Release claims remain gated by `docs/bench/reference-parity-matrix.md`,
`src/__integration__/reference-parity-host-smoke.integration.test.ts`,
`src/__integration__/reference-parity-tool-surface.integration.test.ts`, and
`docs/bench/session-memory-methodology.md`.
