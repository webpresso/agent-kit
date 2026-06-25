---
type: blueprint
title: Hook Simplification + gstack/OMX Legacy Removal Gate
owner: agent-kit
status: completed
complexity: M
created: "2026-06-21"
last_updated: "2026-06-22"
completed_at: "2026-06-22"
progress: "100% (implemented and verified in PR #233)"
depends_on: []
cross_repo_depends_on: []
tags:
  - hooks
  - codex
  - claude
  - gstack
  - omx
---

# Hook Simplification + gstack/OMX Legacy Removal Gate

## Status

Completed.

## User intent

Implement the prior hook simplification plan on a dedicated branch/worktree and publish it as a PR. Keep systemwide gstack removal gated by an explicit coverage audit and backup/migration step; do not delete user-level gstack files in this change. Remove active OMX/OMC normal-hook compatibility wrappers from agent-kit-owned consumer surfaces; external OMX setup remains an addon handoff, not an agent-kit hook wrapper owner.

## Goals

- Normal hook flow is: host config → absolute package `bin/wp hook <name>` → hook handler.
- Move load-bearing fallback behavior from deleted hook shims into `wp hook`:
  - `PreToolUse` handler failures emit deny JSON.
  - JSON-only hooks emit `{}` on handler failure.
  - non-policy hooks fail open after diagnostic capture.
- Keep Codex hook commands cwd-independent and path-stable.
- Remove normal-path per-hook JS shims and managed shell launchers.
- Remove active agent-kit OMX global hook wrapper normalization/trust sync so `wp setup` does not synthesize or trust `wp-global-codex-omx-*` wrappers.
- Add source-repo-only runtime-hook opt-in via `wp dev runtime-hooks enable|disable|status`; default off in the agent-kit source repo.
- Add a gstack coverage audit before any external/systemwide gstack deletion.

## Non-goals

- Do not delete `~/.claude/skills/gstack`, `~/.codex/skills/gstack`, or `~/.gstack` in this PR.
- Do not remove explicit OMX setup invocation as an external addon handoff; do remove agent-kit-owned OMX hook wrapper normalization/trust compatibility.

## Acceptance criteria

- Generated Claude/Codex hook configs use direct absolute `bin/wp hook <name>` commands.
- `.claude/hooks/managed/*.sh` and `.codex/managed-hooks/*.sh` are not generated for normal webpresso hooks.
- `wp setup --with omx` does not synthesize or path-stabilize global Codex OMX managed hook wrappers.
- Removed internal hook bins are absent from package surface and package-manifest tests.
- Hook handler errors are recorded through `src/hooks/errors`.
- `wp dev runtime-hooks status|enable|disable` is source-repo gated.
- `scripts/audit-gstack-coverage.ts` compares external gstack skills against embedded `packages/gstack/skills` and fails when coverage is missing.

## Verification plan

- `./node_modules/.bin/tsc --noEmit --pretty false`
- `./node_modules/.bin/vitest run src/cli/commands/hook.test.ts src/cli/commands/dev.test.ts scripts/audit-gstack-coverage.test.ts scripts/bin-launcher.test.ts src/build/package-manifest.test.ts --no-file-parallelism`
- `./node_modules/.bin/vitest run src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --no-file-parallelism`
- `./node_modules/.bin/vitest run src/cli/commands/init/scaffolders/omx/index.test.ts src/cli/commands/init/scaffolders/omx/index.integration.test.ts --no-file-parallelism`
- `wp sync --check` if available after catalog/template changes.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 99985273d68cbfa1f7a53d0bf098d1495ac15d28
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                   |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-21-hook-simplification-gstack-removal.md |

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
