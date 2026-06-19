---
type: blueprint
title: wp update refreshes Codex plugin skills
status: completed
complexity: S
owner: agent-kit
created: '2026-06-19'
last_updated: '2026-06-19'
progress: '100%'
tags:
  - update
  - codex
  - plugins
  - skills
---

# wp update refreshes Codex plugin skills

## Summary

`wp update` refreshed the global `@webpresso/agent-kit` package but did not
reinstall the Codex plugin cache, so a new package version could ship updated
`skills/` files while Codex continued to expose an older installed plugin copy.
After the global package install succeeds, refresh the `agent-kit@webpresso`
Codex plugin using the same staging marketplace path as `wp setup`.

## Acceptance

- [x] `wp update` still updates the global `@webpresso/agent-kit` package via a
      global-capable `vp` executable.
- [x] `wp update` refreshes the Codex plugin cache after the package update so
      bundled skills are available to new Codex sessions.
- [x] Missing Codex CLI / explicit plugin opt-out remain non-fatal.
- [x] A Codex plugin refresh failure makes the tooling update fail visibly.

## Verification

- `./bin/wp test --file src/cli/commands/package-manager.test.ts --file src/cli/commands/init/scaffolders/codex-plugin/index.test.ts --file src/build/validate-marketplace.test.ts`
