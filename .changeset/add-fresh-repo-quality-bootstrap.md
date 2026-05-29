---
"@webpresso/agent-kit": patch
---

Make `wp setup` bootstrap a fresh public consumer repo with a zero-hand-wiring quality scaffold.

- Generate absent-only TypeScript, Vitest, Oxlint, Stryker, and Playwright config plus starter source/unit/e2e smoke files through the default `base-kit` path.
- Add default package scripts and authoring-time dev dependencies while preserving existing consumer-owned config and scripts on rerun.
- Add a packed-artifact consumer smoke rehearsal that verifies `npm exec --package <tarball> -- wp setup --yes --host none` and the generated lint/typecheck/test/e2e/qa commands.
