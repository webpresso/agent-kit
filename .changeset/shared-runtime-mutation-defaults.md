---
"@webpresso/agent-kit": minor
---

Add a shared runtime-backed local execution layer and improve no-config mutation testing defaults for consumers.

Highlights:
- add a public `with-secrets` bin backed by shared runtime env resolution
- export runtime helpers on the local surface for secret-backed child-process execution
- extend shared deploy planning/execution with runtime profiles, destroy mode, release-version threading, and HTTP verification steps
- route E2E execution through the shared runtime-profile env path
- make `wp test --mutation` bypass recursive consumer mutation scripts
- broaden shared Stryker mutate defaults to common consumer layouts (`src`, `apps`, `packages`, `infra`, `scripts`) and disable Vitest related-only mutation selection by default
