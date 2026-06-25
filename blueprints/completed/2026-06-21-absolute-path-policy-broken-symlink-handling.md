---
type: blueprint
title: Absolute path policy broken symlink handling
owner: agent-kit
status: completed
complexity: S
created: "2026-06-21"
last_updated: "2026-06-21"
completed_at: "2026-06-21"
progress: "100%"
tags:
  - audit
  - symlink
  - hooks
  - reliability
---

# Absolute path policy broken symlink handling

## Goal

Prevent `wp audit absolute-path-policy` from crashing on broken or not-yet-materialized symlink targets in fresh worktrees and generated hook surfaces.

## What changed

- `src/audit/absolute-path-policy.ts`
  - wraps `statSync(fullPath)` in a try/catch during directory walk
  - skips broken symlink or raced-deletion entries instead of crashing the audit
- `src/audit/absolute-path-policy.test.ts`
  - adds a regression covering broken symlink entries such as `.github/skills` and `apps/e2e/.schema-engine-generated`

## Verification

- `./bin/wp test --file src/audit/absolute-path-policy.test.ts`
- `./bin/wp audit absolute-path-policy`

## Outcome

Fresh worktrees with placeholder symlinks no longer fail the absolute-path-policy audit with `ENOENT`, so commit/push hook paths are more robust.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                             |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-21-absolute-path-policy-broken-symlink-handling.md |

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
