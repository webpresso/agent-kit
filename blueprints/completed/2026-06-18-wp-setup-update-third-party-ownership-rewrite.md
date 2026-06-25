---
type: blueprint
title: "wp setup / update third-party ownership rewrite"
owner: codex
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: "Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note."
complexity: M
created: "2026-06-18"
last_updated: "2026-06-18"
progress: "100% (ownership-aware setup/update rewrite implemented and verified)"
depends_on: []
cross_repo_depends_on: []
tags:
  - setup
  - update
  - ownership
  - omx
  - omc
  - gstack
---

# wp setup / update third-party ownership rewrite

## Summary

Made OMX, OMC, and gstack opt-in instead of default-on, kept their setup paths
as legacy compatibility only, stopped replaying remembered third-party installs
on plain `wp setup` reruns, and rewrote `wp update` so it refreshes only `wp`
and third-party integrations that WP previously installed or claimed.

## Tasks

- [x] Add user-global ownership contracts for optional third-party integrations.
- [x] Change `wp setup` preset resolution to default only first-party presets and
      stop replaying remembered external installs across reruns.
- [x] Rewrite `wp update` to use provenance-aware ownership instead of
      unconditional codex/tmux/omx/omc/gstack refresh.
- [x] Make gstack hook scaffolding integration-aware and keep generated guidance
      in sync with the new opt-in model.
- [x] Guard OMX-backed blueprint execution before lifecycle mutation.

## Verification

- `./bin/wp test --file src/cli/tooling-ownership.test.ts --file src/cli/commands/init/config.test.ts --file src/cli/commands/init/init.presets.integration.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/cli/commands/package-manager.test.ts --file src/cli/commands/blueprint/router.execute.test.ts`
- `./bin/wp typecheck`
- `./bin/wp lint --file src/cli/tooling-ownership.ts --file src/cli/commands/package-manager.ts --file src/cli/commands/init/index.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.ts --file src/cli/commands/blueprint/router.ts`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                              |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-18-wp-setup-update-third-party-ownership-rewrite.md |

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
