---
type: blueprint
title: Future-proof wp update plugin refresh
owner: ozby
status: completed
completed_at: '2026-06-23'
complexity: S
created: '2026-06-23'
last_updated: '2026-06-23'
progress: '100% (wp update uses qualified OMC ids and optional integration failures warn)'
depends_on: []
tags:
  - cli
  - update
  - plugins
---

# Future-proof wp update plugin refresh

## Outcome

`wp update` no longer fails the whole tooling refresh when optional OMX/OMC/gstack
or Claude/Codex host plugin refreshes are stale, missing, or timeout-prone after
the core `@webpresso/agent-kit` package refresh succeeds. OMC refresh commands
use the marketplace-qualified `oh-my-claudecode@omc` plugin id.

## Acceptance criteria

- [x] OMC install/update commands use `oh-my-claudecode@omc`.
- [x] Optional OMX/OMC/gstack/Claude-plugin/Codex-plugin refresh failures warn
  and do not fail the core `wp update` command.
- [x] Core `@webpresso/agent-kit` package refresh failures still return nonzero.
- [x] Focused tests cover optional plugin warning behavior and OMC id routing.
- [x] Base-kit setup no longer scaffolds `.node-version` / `.nvmrc` exact patch pins.

## Verification

- `vp exec -- vitest run src/cli/commands/package-manager.test.ts src/cli/commands/init/scaffolders/omc/index.test.ts src/cli/commands/init/init.presets.integration.test.ts -t "OMC|omx,omc|wp package-manager commands" --testTimeout 30000` — passed.
- `wp format --check` — passed.
- `vp run typecheck` — passed.
- `claude plugin update --scope user oh-my-claudecode@omc` — passed.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-23T00:00:00.000Z
- verified-head: 0000000000000000000000000000000000000000
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | `wp update` OMC refreshes use a marketplace-qualified plugin id. | repo:src/cli/commands/package-manager.ts |
| C2 | Optional host plugin refresh failures warn without failing core package update. | repo:src/cli/commands/package-manager.test.ts |
| C3 | OMC setup/install also uses the marketplace-qualified plugin id. | repo:src/cli/commands/init/scaffolders/omc/index.ts |
| C4 | Base-kit setup does not recreate exact Node patch pin files. | repo:src/cli/commands/init/scaffold-base-kit.ts |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Address Claude plugin update lookup failures. | Use `oh-my-claudecode@omc`. | Keep bare `oh-my-claudecode`. | Claude plugin update requires the marketplace-qualified id when the bare id is ambiguous/missing. |
| D2 | Handle stale optional host plugin state during `wp update`. | Treat optional integration refresh failures as warnings after core package refresh. | Fail the whole command on optional host plugin timeout/missing state. | Optional host plugin maintenance should not mask a successful package refresh. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| focused-tests | wp test --file src/cli/commands/package-manager.test.ts | pass | pass at 2026-06-23T00:00:00.000Z |
| typecheck | wp typecheck | pass | pass at 2026-06-23T00:00:00.000Z |

### Residual Unknowns

None.
