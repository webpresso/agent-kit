---
"@webpresso/agent-kit": minor
---

Consolidate the former `@webpresso/agent-*` helper packages into the staged
public `webpresso` package through `webpresso/*` subpath exports.

Consumers can replace pinned helper devDependencies for tsconfig, Vitest,
Stryker, Oxlint, Workers test helpers, docs-lint, launch, test-preset, and
e2e-preset with one `webpresso` dependency. No publish happens in this changeset;
the release workflow stages and publishes the public npm package later.
