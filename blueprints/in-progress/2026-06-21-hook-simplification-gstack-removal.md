# Hook Simplification + Systemwide gstack Removal Gate

## Status

In progress.

## User intent

Implement the prior hook simplification plan on a dedicated branch/worktree and publish it as a PR. Keep systemwide gstack removal gated by an explicit coverage audit and backup/migration step; do not delete user-level gstack files in this change.

## Goals

- Normal hook flow is: host config → absolute package `bin/wp hook <name>` → hook handler.
- Move load-bearing fallback behavior from deleted hook shims into `wp hook`:
  - `PreToolUse` handler failures emit deny JSON.
  - JSON-only hooks emit `{}` on handler failure.
  - non-policy hooks fail open after diagnostic capture.
- Keep Codex hook commands cwd-independent and path-stable.
- Remove normal-path per-hook JS shims and managed shell launchers.
- Add source-repo-only runtime-hook opt-in via `wp dev runtime-hooks enable|disable|status`; default off in the agent-kit source repo.
- Add a gstack coverage audit before any external/systemwide gstack deletion.

## Non-goals

- Do not delete `~/.claude/skills/gstack`, `~/.codex/skills/gstack`, or `~/.gstack` in this PR.
- Do not remove explicit OMX setup support; remove only the normal hook-flow compatibility launcher layer.

## Acceptance criteria

- Generated Claude/Codex hook configs use direct absolute `bin/wp hook <name>` commands.
- `.claude/hooks/managed/*.sh` and `.codex/managed-hooks/*.sh` are not generated for normal webpresso hooks.
- Removed internal hook bins are absent from package surface and package-manifest tests.
- Hook handler errors are recorded through `src/hooks/errors`.
- `wp dev runtime-hooks status|enable|disable` is source-repo gated.
- `scripts/audit-gstack-coverage.ts` compares external gstack skills against embedded `packages/gstack/skills` and fails when coverage is missing.

## Verification plan

- `./node_modules/.bin/tsc --noEmit --pretty false`
- `./node_modules/.bin/vitest run src/cli/commands/hook.test.ts src/cli/commands/dev.test.ts scripts/audit-gstack-coverage.test.ts scripts/bin-launcher.test.ts src/build/package-manifest.test.ts --no-file-parallelism`
- `./node_modules/.bin/vitest run src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --no-file-parallelism`
- `wp sync --check` if available after catalog/template changes.
