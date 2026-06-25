---
type: blueprint
title: wp update refreshes agent-kit plugin skills
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: "Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note."
complexity: S
owner: agent-kit
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "100%"
tags:
  - update
  - codex
  - claude
  - plugins
  - skills
---

# wp update refreshes agent-kit plugin skills

## Summary

`wp update` refreshed the global `@webpresso/agent-kit` package but did not
refresh installed plugin caches, so a new package version could ship updated
`skills/` files while Codex or Claude Code continued to expose older installed
plugin copies. After the global package install succeeds, refresh the
`agent-kit@webpresso` plugin for both Claude Code and Codex using the same setup
scaffolders that `wp setup` already uses.

## Acceptance

- [x] `wp update` still updates the global `@webpresso/agent-kit` package via a
      global-capable `vp` executable.
- [x] `wp update` refreshes the Claude Code plugin cache after the package
      update so bundled skills are available to new Claude Code sessions.
- [x] `wp update` refreshes the Codex plugin cache after the package update so
      bundled skills are available to new Codex sessions.
- [x] Missing Claude/Codex CLI / explicit plugin opt-out remain non-fatal.
- [x] Claude or Codex plugin refresh failures make the tooling update fail
      visibly.

## Verification

- `./bin/wp test --file src/cli/commands/package-manager.test.ts --file src/cli/commands/init/scaffolders/codex-plugin/index.test.ts --file src/cli/commands/init/scaffolders/claude-plugin/index.test.ts --file src/build/validate-marketplace.test.ts`

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
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-wp-update-refresh-agent-kit-plugin-skills.md |

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
