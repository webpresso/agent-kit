---
"@webpresso/agent-kit": minor
---

Adds `@webpresso/agent-kit/quality-engine` subpath. The barrel re-exports every named symbol previously published from `@webpresso/quality-engine` (target-resolver, command-builder, log-paths, workspace-config, test-classification, package-import-rules). Folds the standalone `@webpresso/quality-engine` package per Decision 4 of the public-extraction roadmap. Hard cut — the standalone package is being deprecated and archived in coordination with this release. See `webpresso/blueprints/in-progress/fold-webpresso-quality-engine-into-webpresso-agent-kit-decision-4/_overview.md`.
