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

- [x] Add a clear `--source-maintenance` flag for agent-kit source maintenance.
- [x] Remove `--allow-self-scaffold`; `--source-maintenance` is the only maintainer path.

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
- [x] Source repo repair uses source-maintenance language only.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-11-wp-setup-repeat-run-architecture.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
