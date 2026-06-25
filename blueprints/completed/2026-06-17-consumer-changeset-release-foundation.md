---
type: blueprint
title: Consumer Changesets release foundation and shared deploy handoff
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: "Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note."
complexity: M
owner: agent-kit
created: "2026-06-17"
last_updated: "2026-06-17"
progress: "100% (completed 2026-06-17)"
tags:
  - changesets
  - release
  - consumers
  - scaffolding
  - github-actions
completed_at: "2026-06-17"
---

# Consumer Changesets release foundation and shared deploy handoff

## Summary

Align consumer repos with the Changesets release policy already documented in
agent-kit by making the base-kit scaffold materialize the missing release
surface: Changesets config, version/publish scripts, release metadata sync
helper, and a generic shared release workflow wrapper.

## Acceptance

- [x] Base-kit scaffolds Changesets config and README.
- [x] Base-kit scaffolds `changeset`, `changeset:status`, `version`, and
      `release:publish` scripts plus the helper files they depend on.
- [x] Base-kit scaffolds a generic release workflow wrapper that delegates to
      the shared public Changesets release harness.
- [x] Scaffold tests lock the new release surface so future consumer repos do
      not drift back to doc-only Changesets promises.

## Verification

- `./bin/wp lint --file src/cli/commands/init/scaffold-base-kit.ts --file src/cli/commands/init/scaffold-base-kit.test.ts`
- `./bin/wp typecheck`
- `./bin/wp test --file src/cli/commands/init/scaffold-base-kit.test.ts`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                      |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-17-consumer-changeset-release-foundation.md |

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
