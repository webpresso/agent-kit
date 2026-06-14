---
"@webpresso/agent-kit": minor
---

feat(test): parallelize `wp test` across workspace shards

`wp test` (and the `wp_test` MCP tool) now accepts an optional
`workspaceSharding` input (`enabled`, `maxShards`, `minFilesToShard`,
`targetFilesPerShard`, `totalBudgetMs`) that splits a workspace test run into
parallel shards under a shared time budget. Existing single-run behavior is
unchanged when the option is omitted.
