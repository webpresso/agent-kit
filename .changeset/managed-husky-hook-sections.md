---
"@webpresso/agent-kit": patch
"@webpresso/agent-config": patch
---

Move standard Husky hook entrypoints under setup ownership with managed and user-owned sections so `wp setup` can refresh Webpresso hook behavior while preserving repo-local custom commands.

Generated commit-msg and pre-push hooks no longer enforce Lore trailers by default; stale Lore-only hook bodies are cleaned during setup while unknown local hook bodies are migrated into user-owned sections.
