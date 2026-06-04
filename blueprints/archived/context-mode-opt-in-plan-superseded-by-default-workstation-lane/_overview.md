---
type: blueprint
title: "Superseded: do not make context-mode opt-in by default"
owner: ozby
status: archived
complexity: XS
created: '2026-05-14'
last_updated: '2026-05-28'
progress: '100% (superseded)'
depends_on: []
tags: [license, context-mode, elv2, superseded]
---

# Superseded: do not make context-mode opt-in by default

## Decision

This blueprint is intentionally archived. Do **not** execute the old plan to
remove `context-mode` from the default `wp setup` workstation lane.

The current product and implementation decision is:

- `context-mode` is requested by default on developer workstations.
- setup skips it in CI and when `WP_SKIP_CONTEXT_MODE=1` is set.
- `context-mode` remains outside the published `@webpresso/agent-kit` package
  tarball, so the package metadata does not include the Elastic-2.0 dependency.
- `wp setup --with context-mode` remains accepted as an explicit/idempotent
  invocation, but it is no longer required for the normal workstation path.

## Why the old plan was rejected

The old plan treated Elastic-2.0 as a reason to remove `context-mode` from
defaults. The 2026-05-28 fact check found that default workstation installation
is acceptable when Agent Kit does not bundle or relicense the external package:

- upstream `context-mode` declares `Elastic-2.0`;
- Elastic describes ELv2 as allowing free use, modification, and redistribution
  subject to its limitations;
- Agent Kit records the integration in `THIRD-PARTY-NOTICES.md`;
- `scripts/verify-no-context-mode.sh` verifies the published package metadata
  still excludes `context-mode`.

## Replacement implementation

The replacement work is already represented by code/docs in the main tree:

- `src/cli/commands/init/index.ts` includes `context-mode` in `DEFAULT_PRESETS`
  and provides `WP_SKIP_CONTEXT_MODE=1`.
- `src/cli/commands/init/scaffolders/context-mode/index.ts` avoids
  install/probe side effects in dry-run mode.
- `README.md`, `docs/add-ons.md`, `docs/markdown-fact-check.md`,
  `docs/migration/context-mode-default.md`, and `THIRD-PARTY-NOTICES.md`
  document the default-on workstation lane and non-bundling boundary.

## Guardrail for future agents

Do not reintroduce the retired opt-in/default-off wording or revive the old opt-in migration document. If the license or packaging
boundary changes later, create a fresh blueprint that explicitly cites the new
evidence and updates the package-metadata verification story.

## Archived tasks

- [x] Reject old Task 1.1: remove default context-mode loading.
- [x] Reject old Task 1.2: publish retired opt-in docs.
- [x] Reject old Task 1.3: ask consumers to drop context-mode.
- [x] Replace old Task 1.4 with package-boundary verification:
      `scripts/verify-no-context-mode.sh`.
