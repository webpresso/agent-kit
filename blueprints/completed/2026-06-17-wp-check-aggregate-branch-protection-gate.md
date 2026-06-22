---
type: blueprint
title: Shared wp-check aggregate branch-protection gate
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: 'Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note.'
complexity: S
owner: agent-kit
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '100% (completed 2026-06-17)'
tags:
  - ci
  - github-actions
  - branch-protection
  - scaffolding
completed_at: '2026-06-17'
---

# Shared wp-check aggregate branch-protection gate

## Summary

Promote `wp-check` to the single branch-protection-facing status emitted by the
base-kit CI template while keeping the underlying quality, e2e,
architecture-drift, and deploy-verification jobs parallel. This lets consumers
require one stable GitHub check without losing coverage from sibling CI lanes.

## Acceptance

- [x] The scaffolded CI template keeps the underlying quality jobs parallel.
- [x] The scaffolded CI template emits a final `wp-check` aggregate job for
      branch protection.
- [x] Scaffold tests pin the generated `wp-check` aggregate contract.

## Verification

- `./bin/wp lint --file src/cli/commands/init/scaffold-base-kit.test.ts`
- `./bin/wp typecheck`
- `pnpm exec vitest run src/cli/commands/init/scaffold-base-kit.test.ts`

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-17-wp-check-aggregate-branch-protection-gate.md |

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
