---
"@webpresso/agent-kit": patch
---

Migrate Phase 2 quality commands through the binary-first runtime selector while preserving JS/Bun holdback lanes and explicit missing-runtime diagnostics.

Keep compiled runtime benchmark help available, and fail closed for source-dependent `wp bench session-memory` execution from compiled runtime instead of loading caller project assets.
