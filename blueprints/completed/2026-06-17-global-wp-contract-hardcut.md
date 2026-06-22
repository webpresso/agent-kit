---
type: blueprint
title: Global wp contract hard-cut for consumers, hooks, MCP, runtime, and update
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: 'Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note.'
complexity: L
owner: agent-kit
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '100% (completed 2026-06-17)'
tags:
  - cli
  - hooks
  - runtime
  - mcp
  - setup
  - release
completed_at: '2026-06-17'
---

# Global wp contract hard-cut for consumers, hooks, MCP, runtime, and update

## Summary

Hard-cut agent-kit consumers to the global `wp` execution contract. Consumer
repos now get local presets from `@webpresso/agent-config`; managed hook and MCP
surfaces execute through the shipped global package `bin/wp`; setup repairs repo
surfaces without self-updating the global package; and `wp update` updates only
agent-kit unless `--tools` or `--deps` is explicitly selected.

## Acceptance

- [x] Consumer scaffolding adds `@webpresso/agent-config` and does not add local
      `@webpresso/agent-kit` for new consumers.
- [x] Base templates import config from `@webpresso/agent-config`.
- [x] Managed Claude and Codex hook launchers call absolute `bin/wp hook <name>`
      and never require `bin/wp-*.js` hook files or consumer `node_modules/.bin`.
- [x] PreToolUse missing-launcher paths fail closed with valid deny JSON.
- [x] Codex MCP setup writes absolute `bin/wp` with `mcp` args while packaged
      plugin metadata remains `${PLUGIN_ROOT}/bin/wp` plus `mcp`.
- [x] Runtime doctor accepts staged, sibling, and nested optional runtime payload
      candidates and reports exact missing candidates.
- [x] `wp setup` does not run global install by default; `--repair-global` is
      explicit.
- [x] `wp update` updates only global `@webpresso/agent-kit`; `--tools` runs the
      broad toolchain refresh; `--global`/`-g` are rejected.
- [x] Package dry-run includes `bin/wp` and has no required `bin/wp-*.js` hook
      files.
- [x] Changeset status works in linked worktrees by setting `GIT_WORK_TREE` in
      the repo script.

## Verification

- `./bin/wp test --file scripts/bin-launcher.test.ts --file src/cli/cli.test.ts --file src/cli/commands/init/scaffold-base-kit.test.ts --file src/cli/commands/init/detect-consumer.test.ts --file src/cli/commands/init/init.integration.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/cli/commands/init/scaffolders/codex-mcp/index.test.ts --file src/hooks/doctor.test.ts --file src/cli/commands/package-manager.test.ts`
- `./bin/wp typecheck`
- `./bin/wp lint`
- `./bin/wp audit package-surface`
- `npm pack --dry-run --json --ignore-scripts`
- `./bin/wp audit tph`
- `./bin/wp audit agents`
- `vp run changeset:status`

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-17-global-wp-contract-hardcut.md |

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
