---
"@webpresso/agent-kit": minor
---

Enforce the new binary execution contract across consumers and the source repo.

Consumers now use global `wp` only, must pin `@webpresso/agent-kit` with a
published semver range in `package.json`, and no longer rely on repo-local
execution paths, helper hook bins, or dev-link recovery flows. The source repo
now uses `./bin/wp` for scripts, hooks, and CI.
