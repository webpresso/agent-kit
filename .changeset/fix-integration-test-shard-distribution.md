---
"@webpresso/agent-kit": patch
---

Fix integration test clustering in workspace shard balancer

`wp_test` (no-suite workspace mode) sharded tests by byte size, causing integration/e2e test files — small in bytes but expensive at runtime — to cluster into a single shard and exhaust its sequential budget (exitCode 143). Integration and e2e test files now receive a fixed high weight so the greedy balancer distributes them evenly across shards.
