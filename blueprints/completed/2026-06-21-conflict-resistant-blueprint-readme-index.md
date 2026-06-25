---
type: blueprint
title: Conflict-resistant blueprint README index
owner: agent-kit
status: completed
complexity: S
created: "2026-06-21"
last_updated: "2026-06-21"
completed_at: "2026-06-21"
progress: "100%"
tags:
  - blueprint
  - audit
  - merge-conflicts
  - reliability
---

# Conflict-resistant blueprint README index

## Goal

Stop routine blueprint additions or lifecycle moves from rewriting `blueprints/README.md`, which creates recurring squash-merge conflicts across active PR branches.

## What changed

- `src/audit/blueprint-readme-drift.ts`
  - keeps the marker-block guardrail but renders stable lifecycle documentation instead of branch-sensitive blueprint counts
  - removes git/filesystem counting from the README drift path so `refreshBlueprintReadmeIndex` is idempotent for ordinary blueprint churn
- Blueprint create/lifecycle tests
  - assert the stable lifecycle table remains present
  - stop expecting count updates after creating or moving blueprint files
- `blueprints/README.md`
  - replaces the mutable count table with a stable state/description table

## Verification

- `./bin/wp test --file src/audit/blueprint-readme-drift.test.ts --file src/blueprint/lifecycle/local.test.ts --file src/blueprint/service/BlueprintCreationService.integration.test.ts`
- `bunx vitest run src/mcp/blueprint-server.test.ts --testTimeout 30000 --no-file-parallelism`
- `./bin/wp audit blueprint-readme-drift`
- `./bin/wp audit absolute-path-policy`
- `./bin/wp typecheck`
- `./bin/wp lint`
- `./bin/wp audit guardrails`
- `./bin/wp audit blueprint-pr-coverage --base origin/main`
- `./bin/wp audit blueprint-lifecycle`

## Outcome

Future PRs can still add or move blueprint files and rely on the README drift audit for structural guardrails, but those PRs no longer need to modify the shared README count block solely because lifecycle counts changed.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                          |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-21-conflict-resistant-blueprint-readme-index.md |

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
