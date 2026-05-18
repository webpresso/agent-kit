---
"@webpresso/agent-kit": patch
"@webpresso/agent-vitest": patch
"@webpresso/agent-stryker": patch
"@webpresso/agent-tsconfig": patch
---

Republish with built dist/ included. The previous publishes (agent-kit@0.18.2,
agent-vitest@0.2.0, agent-stryker@0.2.0, agent-tsconfig@0.2.0) shipped without
their dist/ because changeset publish does not invoke prepublishOnly and the
release.yml workflow had no explicit Build step before Publish. Pipeline fix:
release.yml now runs `pnpm -r --workspace-concurrency=1 run build` between
`Version packages` and `Publish`.
