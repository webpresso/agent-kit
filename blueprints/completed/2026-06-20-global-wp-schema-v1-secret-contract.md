---
type: blueprint
title: "Global wp schema v1 secret contract alignment"
owner: ozby
status: completed
complexity: M
created: "2026-06-20"
last_updated: "2026-06-20"
progress: "completed (implemented in PR)"
tags:
  - secrets
  - cli
  - release
  - consumers
---

# Global wp schema v1 secret contract alignment

## Planning Summary

Consumer migrations now commit metadata-only `.webpresso/secrets.config.json` files using the `schemaVersion: 1` provider/profile shape and call `wp secrets doctor --profile <name> --json` as their release smoke gate. The published global `wp` surface still accepted only the legacy `{ manager, projectId }` config and exposed `wp config secrets`, so thin consumers could be correct locally but fail after installing the global package.

This slice aligns the global `wp` package surface with the migrated consumer contract while preserving the existing `wp config secrets` and `with-secrets` compatibility paths.

## Scope

### In scope

- Accept `schemaVersion: 1` committed metadata in `wp audit secrets-config` / `secrets-policy` parsing.
- Accept the same v1 metadata in runtime secret config resolution.
- Resolve committed config from the git top-level or nearest ancestor so nested cwd commands work in fresh clones.
- Add `wp secrets doctor --profile <name> --json` as a metadata/profile validation surface.
- Verify the source-mode `wp` against all migrated consumer worktrees.

### Out of scope

- Publishing the npm release.
- Fetching or printing secret values.
- Removing the existing `wp config secrets` or `with-secrets` surfaces.
- Changing consumer repository code.

## Tasks

#### [runtime] Task 1.1: Runtime schema v1 parsing and root discovery

- [x] **Status:** done
- **Files:** `src/runtime/secrets-config.ts`, `src/runtime/secrets-config.test.ts`
- **Acceptance:** Runtime reads `schemaVersion: 1` committed metadata from nested cwd and still merges runtime overrides.

#### [audit] Task 1.2: Audit schema v1 parsing

- [x] **Status:** done
- **Files:** `src/audit/lib/secrets-policy.ts`, `src/audit/secrets-config.test.ts`
- **Acceptance:** `wp audit secrets-config` accepts v1 metadata with default provider, profiles, and sinks while continuing to reject secret-like content.

#### [cli] Task 1.3: `wp secrets doctor`

- [x] **Status:** done
- **Files:** `src/cli/commands/secrets.ts`, `src/cli/commands/secrets.test.ts`, `src/cli/cli.ts`
- **Acceptance:** `wp secrets doctor --profile preview --json` validates metadata/profile selection and returns a JSON result without fetching secrets.

## Verification

- `./bin/wp test --file src/audit/secrets-config.test.ts --file src/audit/secrets-policy.test.ts --file src/runtime/secrets-config.test.ts --file src/cli/commands/secrets.test.ts --file src/cli/commands/config.test.ts`
- `./bin/wp lint --file src/audit/lib/secrets-policy.ts --file src/audit/secrets-config.test.ts --file src/runtime/secrets-config.ts --file src/runtime/secrets-config.test.ts --file src/cli/commands/secrets.ts --file src/cli/commands/secrets.test.ts --file src/cli/cli.ts`
- `WP_FORCE_SOURCE=1 ./bin/wp typecheck`
- Source-mode smoke with this worktree's `bin/wp`:
  - `wp audit secrets-config --json`
  - `wp secrets doctor --profile preview --json`
  - Passed in ingest-lens, edge-matte, ozby.dev, aksaprocess.tr, and monorepo migration worktrees.
