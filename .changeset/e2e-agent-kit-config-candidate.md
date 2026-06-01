---
"@webpresso/agent-kit": minor
---

The e2e host-adapter config loader now accepts an `agent-kit.config.ts` file (exporting `agentKitConfig`) in addition to the existing `webpresso.config.ts` (`webpressoConfig`). When both files are present it fails loudly with a `WebpressoConfigAmbiguousError` rather than silently picking one, and export-name errors now name the specific export expected for the resolved file.
