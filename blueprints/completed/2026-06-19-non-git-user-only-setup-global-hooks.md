---
type: blueprint
title: Non-git user-only setup keeps Codex MCP and global hooks repairable
status: completed
complexity: S
owner: agent-kit
created: '2026-06-19'
last_updated: '2026-06-19'
progress: '100%'
tags:
  - setup
  - codex
  - mcp
  - hooks
---

# Non-git user-only setup keeps Codex MCP and global hooks repairable

## Summary

`wp setup --cwd <dir>` returned exit 1 before setup reached the user/global lane when `<dir>` was not inside a git worktree. That blocked global Codex MCP registration and OMX global hook normalization in scratch directories, even though those writes do not require repo-local scaffolding.

## Acceptance

- [x] Running setup outside a git worktree falls back to user-only setup instead of aborting.
- [x] Non-git user-only setup writes/updates user-global Codex MCP config when an agent-kit install root is discoverable.
- [x] Non-git setup with `--with omx` still normalizes path-stable global Codex hooks.
- [x] Project-local actions (`--project-init`, hook restore/disable) still require a git worktree.
- [x] No repo-local Webpresso files are written in the non-git user-only lane.

## Tasks

#### [setup] Task 1.1: Enable non-git user-only setup and global hook repair

**Status:** done

**Depends:** None

**Acceptance:**

- [x] Non-git setup falls back to user-only setup.
- [x] Global Codex MCP and OMX hook writes remain available in the non-git lane.
- [x] Project-local operations still require a git worktree.

## Verification

- RED: `./node_modules/.bin/vitest run src/cli/commands/init/init.integration.test.ts -t 'outside a git repo|non-git directory|project-only setup'` failed 5 focused non-git tests against the old behavior.
- GREEN: `./node_modules/.bin/vitest run src/cli/commands/init/init.integration.test.ts -t 'outside a git repo|non-git directory|project-only setup'` passed 5 focused non-git tests.
- `./node_modules/.bin/vitest run src/cli/commands/init/repo-collection-guard.test.ts src/cli/commands/init/detect-consumer.test.ts` passed 52 adjacent init tests.
- `vp run typecheck` passed.
- `vp run lint` passed.
- `./bin/wp audit tph` passed.
- `vp run blueprints:check` passed.
- `./bin/wp audit blueprint-readme-drift` passed.
- `./bin/wp blueprint show 2026-06-19-non-git-user-only-setup-global-hooks` passed.
- `WP_SKIP_AUTO_INSTALL=1 WP_SKIP_CLAUDE_PLUGIN=1 WP_SKIP_CODEX_PLUGIN=1 WP_SKIP_RTK=1 ./bin/wp setup --cwd <non-git-temp> --dry-run --host none` passed and reported user-only setup.

Validation gap: full `./bin/wp test --file src/cli/commands/init/init.integration.test.ts` and direct full-file Vitest both hung in this worktree after the focused regression tests passed; the affected non-git cases and adjacent init tests were run directly as the bounded substitute.
