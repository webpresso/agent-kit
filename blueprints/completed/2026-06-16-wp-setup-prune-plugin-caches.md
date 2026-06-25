---
type: blueprint
title: "wp setup prune plugin caches"
owner: agent-kit
status: completed
complexity: S
created: "2026-06-16"
last_updated: "2026-06-16"
progress: "100% (3 of 3 tasks completed)"
tags:
  - setup
  - plugins
  - cache
---

# wp setup prune plugin caches

## Product wedge anchor

- **Stage outcome:** `wp setup --prune` keeps host plugin caches from accumulating stale agent-kit skill copies.
- **Consuming surface:** agent-kit maintainers and downstream developers running setup after upgrades.
- **User-visible capability:** explicit setup cache pruning covers every known agent host plugin-cache root present on the workstation.

## Problem

Host skill visibility scans versioned plugin cache directories. Claude and Codex may retain old `agent-kit` cache versions, so setup output can list outdated `SKILL.md` files long after the latest plugin has been installed. `wp setup --prune` should also handle compatible cache roots for other agent hosts if they exist.

## Scope

#### Task 1.1: Add plugin cache prune primitive

**Status:** done

**Acceptance:**

- [x] Detect known `plugins/cache/*/agent-kit/<version>` directories for Claude, Codex, OpenCode, Cursor, Windsurf, Agents, and Factory roots.
- [x] Keep the current package version when present; otherwise keep the newest discovered version as a safety fallback.
- [x] Support dry-run without deleting files.

#### Task 1.2: Wire `wp setup --prune`

**Status:** done

**Acceptance:**

- [x] Add a `--prune` setup flag.
- [x] Run pruning across supported plugin-cache roots, not just Claude.
- [x] Print a concise summary before host skill visibility.

#### Task 1.3: Verify

**Status:** done

**Acceptance:**

- [x] Unit tests cover multi-host prune, fallback keep, and dry-run.
- [x] Focused unit and setup e2e tests pass.

## Acceptance criteria

- [x] `wp setup --prune` removes outdated agent-kit plugin cache versions for known agent host cache roots that exist.
- [x] The command avoids deleting the only available cache version for a host.
- [x] Host skill visibility output is no longer polluted by stale cache versions after prune.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                             |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-16-wp-setup-prune-plugin-caches.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
