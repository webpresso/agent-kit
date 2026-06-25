---
type: blueprint
title: Managed hook exit-code hardening and error visibility
owner: ozby
status: completed
completed_at: "2026-06-21"
complexity: S
created: "2026-06-21"
last_updated: "2026-06-21"
progress: "100% (managed hook child failures degrade by event policy, bounded errors persist, and wp hooks errors exposes recent records)"
depends_on: []
tags:
  - hooks
  - codex
  - diagnostics
---

# Managed hook exit-code hardening and error visibility

## Outcome

Codex-managed Webpresso hook wrappers no longer surface unexpected child exit
`1` as host-level hook crashes. They degrade by event policy, persist bounded
diagnostic metadata, and expose recent records through `wp hooks errors`.

## Acceptance criteria

- [x] Child exit `0` passes through unchanged.
- [x] Child exit `2` remains meaningful and passes through unchanged.
- [x] Unexpected `wp-pretool-guard` failures fail closed with PreToolUse deny
      JSON.
- [x] Unexpected Stop/PreCompact failures exit `0` with `{}` JSON.
- [x] Other unexpected managed hook failures exit `0` with stderr-only
      diagnostics.
- [x] Persisted records include only bounded metadata: hook bin, hook
      name/event, phase, status/signal, fallback action, and bounded infrastructure
      detail.
- [x] `wp hooks errors` prints recent repo-scoped managed hook degradation
      records.
- [x] Blueprint coverage travels with the implementation branch and passes the
      blueprint lifecycle gate before PR creation.
- [x] Blueprint lifecycle verification remains bounded on large blueprint
      histories by reading local git config before shell fallback, caching parser
      git metadata, parsing status transitions from one bounded `git log -p`, and
      degrading transition-history checks when their time budget is exhausted.

## Tasks

#### Task 1.1: Harden managed hook child-failure fallback policy

- [x] Convert unexpected child nonzero/signal results to event-specific safe
      fallbacks while preserving exit `2` passthrough.
- [x] Persist bounded managed-hook degradation records for launch, spawn, child,
      and signal failures without storing hook stdin, tool input, environment, or
      child output.

#### Task 1.2: Expose recent managed hook failures through CLI

- [x] Add `wp hooks errors` as a read-only command over the repo-scoped error
      store.
- [x] Cover human-readable and JSON output paths.

#### Task 1.3: Package the implementation for review

- [x] Keep this blueprint in the PR diff so the blueprint coverage gate can
      connect the implementation to its plan.
- [x] Validate the PR branch from an isolated worktree before opening the PR.
- [x] Keep generated hook smoke tests bounded by deduping duplicate command
      strings before execution while still covering every managed hook bin.

#### Task 1.4: Fix blueprint lifecycle audit timeout

- [x] Cache DB parser organization detection per git root and read local
      `.git/config` before shell fallback instead of spawning `git remote get-url
origin` once per blueprint.
- [x] Bound best-effort transition-history checks and emit an advisory warning
      instead of hanging the audit on repositories with many blueprint history
      probes.
- [x] Reduce transition-history probes from `git log` plus `git show` to one
      bounded patch scan per blueprint, and make lifecycle tests use a deterministic
      fake git surface for history assertions instead of real subprocess-heavy temp
      repositories.

## Verification

- `./bin/wp test --file src/hooks/errors/index.test.ts --file src/cli/commands/hooks.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts` — passed.
- `./node_modules/.bin/vitest run src/hooks/errors/index.test.ts src/cli/commands/hooks.test.ts src/cli/commands/init/scaffolders/agent-hooks/index.test.ts src/cli/commands/init/scaffolders/codex-plugin/index.test.ts --no-file-parallelism`
  — passed, 95 tests in 55.53s after deduping duplicate hook smoke commands.
- `./bin/wp lint` — passed.
- `./bin/wp typecheck` — passed.
- `./bin/wp audit blueprint-lifecycle` — passed after adding this blueprint's
  explicit task list.
- `./bin/wp audit blueprint-lifecycle` — passed in 31.72s after the initial
  timeout fix.
- `./node_modules/.bin/vitest run src/audit/blueprint-lifecycle-sql.test.ts src/blueprint/db/parser/blueprint-db-parser.git-cache.test.ts src/blueprint/db/parser/blueprint-db-parser.test.ts --no-file-parallelism`
  — passed, 54 tests in 31.07s after deterministic fake-git history fixtures.
- `./bin/wp audit blueprint-lifecycle` — passed in 28.05s after reducing
  transition-history subprocesses.

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
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-21-managed-hook-error-hardening.md |

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
