---
"@webpresso/agent-kit": minor
---

When both an `agent-kit.config.ts` and a legacy `webpresso.config.ts` are present, the e2e host-adapter config loader now resolves the canonical `agent-kit.config.ts` (the first configured candidate) instead of erroring on the ambiguity. This lets repos keep a thin legacy `webpresso.config.ts` bridge while migrating to the `agent-kit.config.ts` name. Export-name errors continue to name the specific export expected for the resolved file.
