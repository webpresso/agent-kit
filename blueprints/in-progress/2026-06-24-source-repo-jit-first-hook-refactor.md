---
title: Source-repo JIT-first hook refactor
status: in-progress
owner: agent-kit
updated: 2026-06-24
---

# Source-repo JIT-first hook refactor

## Goal

Make the `@webpresso/agent-kit` source repo self-host Claude/Codex hooks in explicit source/JIT mode while keeping consumer repos on the existing direct `node <abs>/bin/wp hook <name>` contract.

## Acceptance criteria

- `WP_FORCE_SOURCE=1 wp setup --source-maintenance` in this repo emits direct `.claude/settings.json` and `.codex/hooks.json` hook commands with `WP_FORCE_SOURCE=1` in the command body.
- Consumer repos keep direct absolute hook commands without `WP_FORCE_SOURCE=1`.
- `wp setup --restore-hooks` rewrites stale wrapper-shaped manifests to the current direct command form; source repo restores use `WP_FORCE_SOURCE=1 wp setup --restore-hooks --source-maintenance`.
- `.codex/managed-hooks` and `.claude/hooks/managed` are not regenerated.
- `wp dev runtime-hooks enable` still routes hook dispatch to the runtime; `disable` returns to JIT-first source dispatch.
- Doctor/status/upgrade guidance prints the exact source-aware setup or repair command.

## Implementation plan

1. Add a small source-repo hook policy for source repo detection, hook command env prefix, and canonical setup/restore command text.
2. Thread the policy through hook scaffolding/manifest rebuild, setup recovery, doctor/status/upgrade guidance, and self-repo setup messaging.
3. Extend targeted tests for consumer vs source command emission, stale wrapper restore, launcher source/runtime selection, and guidance.
4. Update hook docs and run focused verification plus source-mode typecheck/test/doctor/status checks.

## Verification

- `WP_FORCE_SOURCE=1 ./bin/wp test --file bin/_run.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/cli/commands/init/init.integration.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts --file src/cli/commands/hooks-upgrade/index.test.ts`
- `WP_FORCE_SOURCE=1 ./bin/wp typecheck`
- `WP_FORCE_SOURCE=1 ./bin/wp hooks status --vendor codex`
- `WP_FORCE_SOURCE=1 ./bin/wp hooks doctor --skip-mcp`
