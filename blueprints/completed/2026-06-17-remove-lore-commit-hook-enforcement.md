---
type: blueprint
title: Remove Lore commit-message hook enforcement
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: "Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note."
complexity: S
owner: agent-kit
created: "2026-06-17"
last_updated: "2026-06-17"
progress: "100% (completed 2026-06-17)"
tags:
  - hooks
  - release
  - setup
  - ci
completed_at: "2026-06-17"
---

# Remove Lore commit-message hook enforcement

## Summary

Remove automatic `wp audit commit-message --require-lore` enforcement from local
and generated Husky hooks. The audit command remains available for manual use,
but hook enforcement does not add enough value because repository history is
curated through squash commits.

## Acceptance

- [x] The repository no longer has a `commit-msg` hook enforcing Lore trailers.
- [x] The repository `pre-push` hook no longer scans commit messages.
- [x] `base-kit` no longer scaffolds commit-message/pre-push Lore enforcement hooks.
- [x] The `lore-commits` setup preset is removed from setup help and dispatch.
- [x] Lore documentation describes manual/advisory use instead of hook installation.
- [x] The Release workflow does not run local Husky hooks for generated compatibility branch pushes.

## Verification

- `./bin/wp lint --file ...`
- `./bin/wp typecheck`
- `pnpm exec vitest run src/cli/commands/init/scaffold-base-kit.test.ts src/cli/commands/init/init.e2e.test.ts`
- `./bin/wp audit blueprint-lifecycle`
- `./bin/wp audit blueprint-readme-drift`
- `./bin/wp audit guardrails`
- `pnpm exec vitest run src/build/auth-preflight-packages.test.ts`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                    |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-17-remove-lore-commit-hook-enforcement.md |

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
