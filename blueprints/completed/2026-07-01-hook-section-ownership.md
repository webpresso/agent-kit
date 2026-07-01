---
type: blueprint
owner: webpresso
title: "Managed hook sections"
status: completed
complexity: M
created: "2026-07-01"
last_updated: "2026-07-01"
progress_pct: 100
progress: "Completed: Husky hook entrypoints are setup-owned section-merged files with preserved user-owned extension blocks and stale Lore hook cleanup."
depends_on:
  - "catalog/base-kit Husky templates"
  - "wp setup base-kit scaffolder"
completed_at: "2026-07-01"
---

# Managed hook sections

## Status

Completed — moved Husky hook entrypoint ownership into agent-kit with AGENTS-style managed and user-owned blocks.

## Problem

Some consumers still track stale commit-message/pre-push enforcement even though agent-kit no longer installs Lore enforcement for squash-merge repos. Removing those files by hand fixes today but does not prevent future drift or preserve legitimate repo-local hook customizations.

## Scope

- Make agent-kit setup own the standard Husky hook entrypoints.
- Use section markers so `wp setup` can update Webpresso-managed commands without clobbering user-owned hook extensions.
- Preserve unknown existing hook bodies as user-owned content during migration.
- Drop known obsolete Lore-enforcement hook bodies instead of preserving them as custom behavior.
- Add tests for fresh setup, managed updates, custom preservation, and stale-hook cleanup.

## Non-goals

- Do not reintroduce mandatory Lore trailer enforcement.
- Do not add a consumer-local hook policy surface outside agent-kit.
- Do not overwrite arbitrary user hook code.

## Tasks

#### [design] Task 1.1: Define hook section contract

**Status:** done

**Depends:** None

- Add stable managed/user-owned markers to Husky hook templates.
- Keep comments concise and shell-safe.

#### [impl] Task 1.2: Merge hook sections during setup

**Status:** done

**Depends:** Task 1.1

- Replace managed sections on repeated setup.
- Preserve user-owned sections.
- Migrate unknown pre-existing hook bodies into user-owned sections.
- Recognize and discard known obsolete Lore-only hook bodies.

#### [qa] Task 1.3: Verify setup behavior

**Status:** done

**Depends:** Task 1.2

- Add unit/e2e coverage for fresh setup, update, preservation, and stale cleanup.
- Run targeted tests plus typecheck/lint.

## Acceptance criteria

- `wp setup` owns `.husky/pre-commit`, `.husky/commit-msg`, and `.husky/pre-push` entrypoints.
- The setup-owned hook surface intentionally expands from pre-commit-only to sectioned pre-commit, commit-msg, and pre-push entrypoints.
- Repo-local custom hook commands can live in preserved user-owned sections.
- Stale `--require-lore` hook bodies are cleaned by setup and cannot re-block squash-merge PR workflows.
- Tests prove the contract.

## Verification evidence

- `wp sync --check` passed.
- `wp audit blueprint-lifecycle` passed.
- `wp audit tph` passed.
- `vp run typecheck` passed.
- `vp run lint` passed.
- `vp exec vitest run src/cli/commands/init/scaffold-base-kit.test.ts src/cli/commands/init/init.e2e.test.ts` passed, including legacy custom-line preservation coverage.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T19:24:25.000Z
- verified-head: 6732bf6d91bd8e596aa2f3aa0d703980fd58bd90
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                                                | Evidence                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Agent-kit base-kit owns standard Husky hook entrypoint templates with managed and user-owned sections.                                               | repo:catalog/base-kit/.husky/pre-commit.tmpl; repo:catalog/base-kit/.husky/commit-msg.tmpl; repo:catalog/base-kit/.husky/pre-push.tmpl |
| C2  | Setup merges hook sections, preserves existing user-owned content, migrates unknown legacy hooks, and discards known obsolete Lore-only enforcement. | repo:src/cli/commands/init/scaffold-base-kit.ts                                                                                        |
| C3  | Unit and setup e2e tests cover fresh hook generation, user-owned preservation, unknown-hook migration, and stale Lore hook cleanup.                  | repo:src/cli/commands/init/scaffold-base-kit.test.ts; repo:src/cli/commands/init/init.e2e.test.ts                                      |

### Material Decisions

| ID  | Decision                  | Chosen option                                                                         | Rejected alternatives                                                         | Rationale                                                                                                                                |
| --- | ------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Hook ownership model      | Agent-kit-managed Husky entrypoints with in-file managed and user-owned sections      | Delete consumer hooks outright or preserve whole hook files as consumer-owned | Sectioned entrypoints let setup refresh Webpresso behavior while preserving repo-local hook extensions.                                  |
| D2  | Lore enforcement behavior | Keep Lore trailer validation advisory/manual rather than mandatory in generated hooks | Reinstall commit-msg or pre-push Lore enforcement                             | Squash merge makes PR review and final squash commits the durable boundary, so per-commit Lore enforcement creates stale local friction. |

### Promotion Gates

| Gate      | Command                                                                                                      | Expected outcome                      | Last result                      |
| --------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------- | -------------------------------- |
| sync      | wp sync --check                                                                                              | setup-generated surfaces are in sync  | pass at 2026-07-01T19:24:25.000Z |
| blueprint | wp audit blueprint-lifecycle                                                                                 | blueprint lifecycle metadata is valid | pass at 2026-07-01T19:24:25.000Z |
| tph       | wp audit tph                                                                                                 | testing philosophy audit passes       | pass at 2026-07-01T19:24:25.000Z |
| typecheck | wp typecheck                                                                                                 | TypeScript typecheck passes           | pass at 2026-07-01T19:24:25.000Z |
| lint      | wp lint                                                                                                      | Lint passes                           | pass at 2026-07-01T19:24:25.000Z |
| tests     | wp test --file src/cli/commands/init/scaffold-base-kit.test.ts --file src/cli/commands/init/init.e2e.test.ts | targeted setup tests pass             | pass at 2026-07-01T19:24:25.000Z |

### Residual Unknowns

None.
