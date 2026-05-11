---
"@webpresso/agent-kit": patch
---

fix: resolve rulesync from agent-kit's own node_modules when not hoisted to consumer

`ak compile` now finds `rulesync` via `createRequire(import.meta.url)` when not
present in the consumer's own `node_modules/.bin/`. Previously failed with
"rulesync is not installed" in any consumer where rulesync wasn't independently
installed.
