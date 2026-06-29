---
type: blueprint
status: draft
last_updated: 2026-06-29
title: Optional WP-managed agent tools
---

# Optional WP-managed agent tools

## Intent

Harden optional WP-managed agent-tool install/remove/update behavior without adding dependencies or destructive native uninstall behavior.

## Acceptance Criteria

- `wp install codex|claude-code|opencode` and `wp install oh-my codex|claude-code|opencode` use explicit adapter-owned command specs.
- `openagent` is accepted only as an alias for canonical `wp install oh-my opencode`.
- Optional-tool args accept only no args, `--scope user|project`, or `--scope=user|project`; typoed flags/trailing args fail with canonical examples.
- `wp remove ...` clears WP ownership only and states no native uninstall was attempted.
- `wp update` refreshes only WP-owned optional scopes and keeps non-optional package-manager flows delegated through VP.
- Hook-source status output bounds `hooks`, `path`, and `gitPath` fields.
- Docs/help/instruction surfaces mention the canonical OpenCode command, `openagent` alias, WP ownership semantics, and `wp`/`vp`-only user-facing install guidance.

## Tasks

- [x] Add registry invariants and strict grammar tests.
- [x] Implement optional-tool registry/router hardening.
- [x] Add hook-source edge tests and bounded formatter.
- [x] Update docs/help/instruction surfaces.
- [x] Run focused Vitest plus repo checks (`wp format --check`, `wp typecheck`, `wp lint`, `wp sync --check`) as feasible.

## Verification

Record exact commands and outcomes in the final report.

## Completion Evidence

- Focused tests: `vp exec vitest run src/cli/cli.test.ts src/cli/commands/init/scaffold-agents-md.test.ts src/cli/optional-tools.test.ts src/cli/commands/package-manager.test.ts src/hooks/status/index.test.ts` → 92 passed.
- Typecheck: `./bin/wp typecheck` → passed.
- Lint: `./bin/wp lint` → passed (reported existing parser note in `src/cli/commands/init/scaffolders/rtk/index.ts`).
- Sync: `./bin/wp sync --check` → in sync.
- Package/surface audits: `./bin/wp audit package-surface`, `./bin/wp audit gitignore-agent-surfaces`, `./bin/wp audit agents`, `vp run docs:check` → passed.
- Targeted format check for changed files → passed.
- Full `./bin/wp format --check` still reports pre-existing formatting drift outside this task.
