---
type: blueprint
title: "secret orchestration DB branch capability contract"
owner: codex
status: completed
complexity: S
created: '2026-06-19'
last_updated: '2026-06-19'
progress: '100% (DB branch capability contract slice shipped and verified)'
depends_on: []
cross_repo_depends_on: []
tags:
  - secrets
  - db-branching
  - neon
  - xata
  - capability
---

# secret orchestration DB branch capability contract

## Summary

Shipped the first provider-neutral DB branch capability contract for secret
orchestration: typed managed/skip plans, runtime validation for provider
descriptors, a fake provider module that records Neon-now/Xata-later support,
and a guide documenting the current target and future-gated target.

This blueprint records the repo-local execution evidence for Task 1.4 of the
larger cross-repo secret-orchestration ultragoal.

## Tasks

#### [db] Task 1.4: Add the DB branch capability contract

**Status:** done

**Depends:** None

Added a provider-neutral `src/db-branching/` surface with one managed plan
shape, one skip shape for non-DB apps, and a fake provider layer that expresses
Neon as current and Xata as future-gated without forcing any Xata runtime
implementation yet.

**Files:**

- Create: `src/db-branching/types.ts`
- Create: `src/db-branching/types.test.ts`
- Create: `src/db-branching/fake-provider.ts`
- Create: `docs/db-branching/neon-xata.md`

**Acceptance:**

- [x] Non-DB apps skip DB branch logic with explicit evidence.
- [x] Neon is the explicit current target.
- [x] Xata is documented as a future-gated target only.
- [x] Managed plans require connection-string, smoke, TTL, and cleanup metadata.

## Verification

- `./bin/wp test --file src/db-branching/types.test.ts`
- `./bin/wp lint --file src/db-branching --file docs/db-branching/neon-xata.md`
- `./bin/wp typecheck`

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-secret-orchestration-db-branch-capability-contract.md |

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
