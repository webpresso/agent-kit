---
"@webpresso/agent-kit": patch
---

Strip stale source map references from packed build files so consumers do not see missing `.map` warnings when using published Vitest setup helpers.
