---
type: blueprint
title: Managed hook launchers preserve real failure diagnostics
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: "Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note."
complexity: M
owner: agent-kit
created: "2026-06-17"
last_updated: "2026-06-17"
progress: "100% (completed 2026-06-17)"
tags:
  - hooks
  - codex
  - claude
  - diagnostics
  - scaffolder
completed_at: "2026-06-17"
---

# Managed hook launchers preserve real failure diagnostics

## Summary

Fix the source-of-truth hook scaffolder so generated managed launchers no longer
rewrite legitimate `wp-pretool-guard` failures into fake PATH-missing errors.
Make launchers execute the packaged `wp-*.js` hook bins directly, and keep the
dedup / ownership parser stack compatible with both the legacy guarded shell
form and the new `if/then/else` wrapper.

## Acceptance

- [x] Guarded hook wrappers only use fallback JSON when the launcher is missing.
- [x] Legitimate pretool guard failures preserve their real stderr/exit path.
- [x] Generated managed launchers execute packaged hook bins directly rather
      than depending on `wp hook ...` globally.
- [x] Parser / dedup / ownership logic recognizes both old and new guarded
      shell forms.

## Verification

- `wp lint`
- `wp typecheck`
- `wp test --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/merge.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/codex-ownership.test.ts`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                               |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-17-managed-hook-launcher-real-failure-diagnostics.md |

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
