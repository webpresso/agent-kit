---
type: blueprint
title: "agent-kit: reusable Cloudflare deploy workflow lineage alignment"
owner: ozby
status: completed
complexity: M
created: "2026-06-09"
last_updated: "2026-06-11"
progress: "100% (completed 2026-06-11)"
historical_zero_task_waiver: true
historical_zero_task_rationale: This completed record was captured as a historical outcome summary rather than a task-tracked execution blueprint.
depends_on:
  - 2026-06-02-agent-kit-wp-deploy-orchestrator-toolchain-isolation
  - 2026-05-30-cross-project-wp-execution-map
tags:
  - agent-kit
  - github-actions
  - reusable-workflows
  - cloudflare
  - deploy
---

# agent-kit: reusable Cloudflare deploy workflow lineage alignment

**Goal:** Make `agent-kit` the truthful current-source owner of the shared
Cloudflare reusable workflow shell that downstream consumer repos already use,
and publish an ADR naming the authoritative immutable lineage.

## Completion summary

- Restored `.github/workflows/cloudflare-preview.yml` and
  `.github/workflows/cloudflare-production.yml` to current-source `agent-kit`.
- Restored the reusable-workflow contract doc and the workflow-shell regression
  test.
- Added ADR 0001 naming `317fc3aa5952f5dee0604413a0b9dd1e6d7635dd` as the
  authoritative downstream lineage until consumers intentionally repin.
- Updated the GitHub action guide so the repo-hosted reusable workflow shell and
  the separate audit action are no longer conflated.

## Acceptance

- [x] Current-source `agent-kit` carries the reusable workflow family that
      downstream repos pin.
- [x] An ADR names the authoritative reusable deploy lineage.
- [x] Shared docs explain the caller contract and immutable-SHA rule.
- [x] Workflow-shell ownership is explicit instead of accidental.

## Verification

- `wp test --file src/build/reusable-cloudflare-workflows.test.ts`
- `wp test --file src/audit/cloudflare-deploy-contract.test.ts`
- `wp lint --file docs/github-action.md --file docs/reusable-cloudflare-deploy-workflows.md --file docs/adrs/0001-reusable-cloudflare-workflow-lineage.md`

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-09-reusable-cloudflare-deploy-workflow-lineage-alignment.md |

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
