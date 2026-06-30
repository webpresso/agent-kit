---
type: blueprint
status: completed
owner: agent-kit
complexity: M
created: 2026-06-29
last_updated: 2026-06-30
title: Optional WP-managed agent tools
progress: "100% (5 of 5 tasks completed)"
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

#### [tests] Task 1.1: Registry invariants and strict grammar tests

**Status:** done

**Depends:** None

Add direct coverage for optional-tool adapter uniqueness, alias resolution, canonical hints, non-empty update commands, strict argument grammar, and parser rejection behavior.

**Acceptance:**

- [x] Every managed id has exactly one adapter.
- [x] Direct base names do not resolve inside `oh-my`.
- [x] Oh My internal ids do not resolve as direct base tools.
- [x] `openagent` resolves only to Oh My OpenCode.
- [x] Duplicate scope, missing scope, unsupported flags, unsupported project scope, and trailing args fail with canonical examples.

#### [cli] Task 1.2: Optional-tool registry/router hardening

**Status:** done

**Depends:** Task 1.1

Make `src/cli/optional-tools.ts` the registry-owned source for optional-tool ids, aliases, usage, hints, update commands, ownership copy, and strict parsing while keeping package-manager flows delegated through VP when not optional-tool commands.

**Acceptance:**

- [x] Base installs use `wp install codex|claude-code|opencode`.
- [x] Oh My installs use `wp install oh-my codex|claude-code|opencode`.
- [x] `openagent` is accepted only as the compatibility alias for `wp install oh-my opencode`.
- [x] Non-optional package-manager commands still delegate through VP.

#### [cli] Task 1.3: Registry-driven update and ownership behavior

**Status:** done

**Depends:** Task 1.2

Keep update-step construction adapter-owned, preserve user/project scope behavior, dedupe compatible update paths, and ensure remove/update copy reflects WP ownership rather than destructive native uninstall behavior.

**Acceptance:**

- [x] `wp remove ...` clears WP ownership only and states no native uninstall was attempted.
- [x] `wp update` refreshes only WP-owned optional scopes.
- [x] Project/current-directory update behavior is registry-driven rather than special-cased in package-manager routing.

#### [hooks] Task 1.4: Hook-source status bounding

**Status:** done

**Depends:** None

Bound hook-source status display values so malformed or long project/user/system hook-source metadata cannot flood status output.

**Acceptance:**

- [x] Invalid JSON does not throw.
- [x] Missing files produce inactive or empty-hook rows.
- [x] `hooks`, `path`, and `gitPath` are bounded in formatted output.

#### [docs] Task 1.5: Docs/help/instruction surface alignment

**Status:** done

**Depends:** Tasks 1.2, 1.3

Update user-facing docs/help/instruction surfaces to make canonical optional-tool commands, alias compatibility, WP ownership semantics, and `wp`/`vp`-only guidance clear.

**Acceptance:**

- [x] Docs/help mention canonical OpenCode command and `openagent` compatibility alias.
- [x] WP ownership means future `wp update` participation.
- [x] Remove copy states native uninstall was not attempted.
- [x] User-facing install guidance avoids non-`vp` installer instructions.

## Verification

All task checkboxes are complete and the blueprint is 100% complete for this PR.

## Completion Evidence

- Focused packed-consumer regression: `vp exec vitest run package.contract.integration.test.ts -t "packed consumers receive runtime-owned setup guidance without losing authoring deps"` → 1 passed, 10 skipped.
- Changed test suite: `xargs vp exec vitest run < /tmp/changed-tests.txt` for the 21 changed test files → 21 files passed; 403 tests passed, 11 skipped.
- Sync: `./bin/wp sync --check` → in sync.
- Format: `./bin/wp format --check` → passed.
- Typecheck: `./bin/wp typecheck` → passed.
- Lint: `./bin/wp lint` → passed (reported existing parser note in `src/cli/commands/init/scaffolders/rtk/index.ts`).
- Push hook verification during `git push -u origin wp-managed-agent-tools-optional` → audit guardrails passed, affected-closure typecheck passed, tests passed, blueprint PR coverage passed.
