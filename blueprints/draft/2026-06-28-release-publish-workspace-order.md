---
type: blueprint
title: "Fix release-publish workspace dependency order"
owner: ozby
status: draft
complexity: M
created: "2026-06-28"
last_updated: "2026-06-28"
tags:
  - release
  - publish
  - packages
---

# Summary

`scripts/release-publish.ts` currently discovers public workspace packages alphabetically.
That breaks the first real `@webpresso/agent-core` + `@webpresso/agent-config` publish,
because `agent-config` builds against `agent-core` subpath exports and fails from a clean
checkout until `agent-core` is built first.

# Broken invariant

Release publishing must build/publish local workspace dependencies before dependents.
Alphabetical order is invalid once a publishable package depends on another publishable
workspace package.

# Fix

- derive local `workspace:*` dependencies from each publishable package manifest
- topologically order publishable workspace packages before publish
- fail closed on cycles
- add regression tests for dependency order and cycle detection

# Verification

- targeted tests for the ordering helper and `release-publish` source contract
- clean-checkout reproduction: `agent-config` build fails before `agent-core` build,
  succeeds after `agent-core` build
- release-script dry proof with fake successful `npm publish` logs `agent-core` before
  `agent-config`
