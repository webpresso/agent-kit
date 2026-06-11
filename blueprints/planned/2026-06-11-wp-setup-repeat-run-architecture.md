---
type: blueprint
title: "wp setup repeat-run architecture cleanup"
owner: agent-kit
status: planned
complexity: M
created: 2026-06-11
last_updated: 2026-06-11
progress: '0% (0 of 4 tasks completed)'
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

### Task 1: Make gstack repeat runs cheap by default

- [ ] If the canonical gstack checkout and requested host skills already exist, skip `git pull` and upstream `./setup`.
- [ ] Keep explicit refresh paths: `WP_GSTACK_REFRESH=1`, `WP_GSTACK_MODE=full`, or `WP_GSTACK_HOSTS=...`.
- [ ] Preserve first-run behavior.

### Task 2: Improve setup output semantics

- [ ] Report skipped cached gstack as already configured, not updated.
- [ ] Mention the explicit refresh knob in the output.

### Task 3: Hard-cut self-scaffold wording to maintenance wording

- [ ] Add a clear `--source-maintenance` flag for agent-kit source maintenance.
- [ ] Remove `--allow-self-scaffold`; `--source-maintenance` is the only maintainer path.

### Task 4: Verify

- [ ] Add tests for cached gstack skip.
- [ ] Add tests for explicit gstack refresh.
- [ ] Run focused setup/gstack tests plus typecheck/lint.

## Acceptance criteria

- [ ] Repeat `wp setup` does not invoke gstack `git pull` or upstream setup when gstack + requested skills are already present.
- [ ] Users have a documented explicit refresh path.
- [ ] Source repo repair uses source-maintenance language only.
