---
type: blueprint
title: Managed hook exit-code hardening and error visibility
owner: ozby
status: completed
completed_at: '2026-06-21'
complexity: S
created: '2026-06-21'
last_updated: '2026-06-21'
progress: '100% (managed hook child failures degrade by event policy, bounded errors persist, and wp hooks errors exposes recent records)'
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

## Verification

- `./bin/wp test --file src/hooks/errors/index.test.ts --file src/cli/commands/hooks.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts` — passed.
- `./bin/wp lint` — passed.
- `./bin/wp typecheck` — passed.
- `./bin/wp audit blueprint-lifecycle` — passed after adding this blueprint's
  explicit task list.
