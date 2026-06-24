---
type: blueprint
title: "wp setup repeat-run architecture cleanup"
owner: agent-kit
status: completed
complexity: M
created: '2026-06-11'
last_updated: '2026-06-11'
progress: '100% (4 of 4 tasks completed)'
tags:
  - setup
  - gstack
  - hooks
  - architecture
---

# wp setup repeat-run architecture cleanup

## Product wedge anchor

- **Stage outcome:** consecutive `wp setup` runs are fast, bounded, and repair-oriented instead of reinstalling heavyweight optional integrations.
- **Consuming surface:** agent-kit maintainers and downstream users who rerun setup to repair hooks/config.
- **New user-visible capability:** `wp setup` uses cached gstack state by default; heavyweight refreshes are explicit.

## Problem

The current setup architecture conflates three operations:

1. reconcile repo-local generated surfaces;
2. repair user-global hook/MCP/plugin config;
3. refresh heavyweight third-party integrations such as gstack and Playwright browsers.

That makes repeat runs surprisingly expensive. It also makes source-repo repair require confusing self-scaffold language even when the desired operation is only to repair path-stable hooks.

## Scope

#### Task 1.1: Make gstack repeat runs cheap by default

**Status:** done

**Depends:** None

**Acceptance:**

- [x] If the canonical gstack checkout and requested host skills already exist, skip `git pull` and upstream `./setup`.
- [x] Keep explicit refresh paths: `WP_GSTACK_REFRESH=1` or `WP_GSTACK_MODE=full`; `WP_GSTACK_HOSTS=...` selects the desired host set without disabling cache.
- [x] Preserve first-run behavior.

**Verification:** `wp_test` for `src/cli/commands/init/scaffolders/gstack/index.test.ts`.

#### Task 1.2: Improve setup output semantics

**Status:** done

**Depends:** Task 1.1

**Acceptance:**

- [x] Report skipped cached gstack as already configured, not updated.
- [x] Mention the explicit refresh knob in the output.

**Verification:** `wp_test` for `src/cli/commands/init/scaffolders/gstack/index.test.ts`.

#### Task 1.3: Hard-cut self-scaffold wording to maintenance wording

**Status:** done

**Depends:** Task 1.2

**Acceptance:**

- [x] Add an explicit self-host maintenance path for agent-kit source repair.
- [x] Source writes require `wp setup --apply --phase <phase>`.

**Verification:** `wp_test` for `src/cli/commands/init/init.integration.test.ts`.

#### Task 1.4: Verify

**Status:** done

**Depends:** Task 1.3

**Acceptance:**

- [x] Add tests for cached gstack skip.
- [x] Add tests for explicit gstack refresh.
- [x] Run focused setup/gstack tests plus typecheck/lint.

**Verification:** Focused setup/gstack tests, typecheck, lint, format, and audits.

## Acceptance criteria

- [x] Repeat `wp setup` does not invoke gstack `git pull` or upstream setup when gstack + requested skills are already present.
- [x] Users have a documented explicit refresh path.
- [x] Source repo repair uses explicit `--apply --phase <phase>` language only.
