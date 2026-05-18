---
"@webpresso/agent-kit": patch
"@webpresso/agent-vitest": patch
"@webpresso/agent-stryker": patch
"@webpresso/agent-tsconfig": patch
---

Resume the host-visibility-gate-fix patch that was version-bumped to
0.18.5 but failed to publish on tshy double-build. This changeset
triggers a new patch (0.18.6) that publishes cleanly.
