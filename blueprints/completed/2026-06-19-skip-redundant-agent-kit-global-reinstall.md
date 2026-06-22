---
type: blueprint
title: "Skip redundant agent-kit global reinstall"
status: completed
complexity: S
owner: agent-kit
created: 2026-06-19
last_updated: 2026-06-19
completed_at: 2026-06-19
---

## Product wedge anchor

- **Stage outcome:** `wp setup` remains a fast, idempotent repair/sync command for agent surfaces.
- **Consuming surface:** `wp setup` global agent-kit self-refresh step.
- **New user-visible capability:** Setup reports that the global agent-kit install is already up to date instead of rerunning a costly global install.

## Summary

Prevent `wp setup` from repeatedly running `vp install -g @webpresso/agent-kit` when the globally installed package version is already current. Preserve the existing behavior that still refreshes on newer published versions and still repairs the root `bin/wp` launcher.

## Tasks

#### Task 1.1: Gate global self-refresh on known latest version

**Status:** done
**Wave:** 0
**Files:**
- `src/cli/commands/init/scaffolders/agent-kit-global/index.ts`
- `src/cli/auto-update/version.ts`
- `src/cli/auto-update/run.ts`

**Acceptance:**
- [x] `ensureAgentKitGlobal` skips `vp install -g @webpresso/agent-kit` when the installed package version is at or ahead of the fresh cached latest release.
- [x] Unknown cache or unknown current version remains conservative and preserves the previous refresh path.
- [x] The existing root `bin/wp` launcher repair still runs when the install is skipped as already up to date.

#### Task 1.2: Report and test the idempotent setup path

**Status:** done
**Wave:** 0
**Files:**
- `src/cli/commands/init/index.ts`
- `src/cli/commands/init/scaffolders/agent-kit-global/index.test.ts`

**Acceptance:**
- [x] `wp setup` reports `agent-kit global: already up to date (...)` for the new skip result.
- [x] Regression tests cover the up-to-date skip path and the newer-version refresh path.
- [x] Failure-path tests are isolated from the real update cache.

## Verification

- [x] `wp_test` for `src/cli/commands/init/scaffolders/agent-kit-global/index.test.ts` and `src/cli/auto-update/run.test.ts`
- [x] `wp_lint` on touched implementation/test files
- [x] `wp_typecheck`
- [x] `wp_audit kind=blueprint-pr-coverage` before push

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-skip-redundant-agent-kit-global-reinstall.md |

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
