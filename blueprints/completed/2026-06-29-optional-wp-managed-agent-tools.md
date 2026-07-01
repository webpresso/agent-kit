---
type: blueprint
status: completed
owner: agent-kit
complexity: M
created: 2026-06-29
last_updated: 2026-07-01
title: Optional WP-managed agent tools
progress: "100% (5 of 5 tasks completed)"
---

# Optional WP-managed agent tools

## Intent

Harden optional WP-managed agent-tool install/remove/update behavior without adding dependencies or destructive native uninstall behavior.

## Acceptance Criteria

- `wp install codex|claude-code|opencode` and `wp install oh-my codex|claude-code|opencode` use explicit adapter-owned command specs.
- `openagent` and `omo` are accepted only as aliases for canonical `wp install oh-my opencode`.
- Optional-tool args accept only no args, `--scope user|project`, or `--scope=user|project`; typoed flags/trailing args fail with canonical examples.
- `wp remove ...` clears WP ownership only and states no native uninstall was attempted.
- `wp update` refreshes only WP-owned optional scopes and keeps non-optional package-manager flows delegated through VP.
- Hook-source status output clearly lists project and system hook sources with available hooks, bounding `hooks`, `path`, and `gitPath` fields.
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
- [x] `openagent` and `omo` resolve only to Oh My OpenCode.
- [x] Duplicate scope, missing scope, unsupported flags, unsupported project scope, and trailing args fail with canonical examples.

#### [cli] Task 1.2: Optional-tool registry/router hardening

**Status:** done

**Depends:** Task 1.1

Make `src/cli/optional-tools.ts` the registry-owned source for optional-tool ids, aliases, usage, hints, update commands, ownership copy, and strict parsing while keeping package-manager flows delegated through VP when not optional-tool commands.

**Acceptance:**

- [x] Base installs use `wp install codex|claude-code|opencode`.
- [x] Oh My installs use `wp install oh-my codex|claude-code|opencode`.
- [x] `openagent` and `omo` are accepted only as compatibility aliases for `wp install oh-my opencode`.
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
- [x] Project sources include git-relative paths and absolute paths.
- [x] System sources include absolute paths for Claude, Codex, and OpenCode.
- [x] `hooks`, `path`, and `gitPath` are bounded in formatted output.

#### [docs] Task 1.5: Docs/help/instruction surface alignment

**Status:** done

**Depends:** Tasks 1.2, 1.3

Update user-facing docs/help/instruction surfaces to make canonical optional-tool commands, alias compatibility, WP ownership semantics, and `wp`/`vp`-only guidance clear.

**Acceptance:**

- [x] Docs/help mention canonical OpenCode command and `openagent`/`omo` compatibility aliases.
- [x] WP ownership means future `wp update` participation.
- [x] Remove copy states native uninstall was not attempted.
- [x] User-facing install guidance avoids non-`vp` installer instructions.

## Verification

All task checkboxes are complete and the blueprint is 100% complete for this PR.

2026-07-01 follow-up delta: aligned Oh My OpenAgent with the upstream `oh-my-openagent` one-shot installer shape through `vp dlx`, added the `omo` Oh My namespace alias, expanded hook-source status to project/system paths for Claude/Codex/OpenCode, and tightened the verify skill docs/help/instruction drift contract.

## Completion Evidence

- Focused packed-consumer regression: `vp exec vitest run package.contract.integration.test.ts -t "packed consumers receive runtime-owned setup guidance without losing authoring deps"` → 1 passed, 10 skipped.
- Changed test suite: `xargs vp exec vitest run < /tmp/changed-tests.txt` for the 21 changed test files → 21 files passed; 403 tests passed, 11 skipped.
- Sync: `./bin/wp sync --check` → in sync.
- Format: `./bin/wp format --check` → passed.
- Typecheck: `./bin/wp typecheck` → passed.
- Lint: `./bin/wp lint` → passed (reported existing parser note in `src/cli/commands/init/scaffolders/rtk/index.ts`).
- Push hook verification during `git push -u origin wp-managed-agent-tools-optional` → audit guardrails passed, affected-closure typecheck passed, tests passed, blueprint PR coverage passed.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-30T19:11:33.000Z
- verified-head: 01e8d9e3f5bfb89cd3824bb75975b8b93ea98955
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                   | Evidence                                                                                                                                           |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Optional tool lifecycle behavior is implemented and covered directly.   | repo:src/cli/optional-tools.ts; repo:src/cli/optional-tools.test.ts; repo:src/cli/commands/package-manager.test.ts                                 |
| C2  | Hook-source status output bounding is implemented and covered.          | repo:src/hooks/status/index.ts; repo:src/hooks/status/index.test.ts                                                                                |
| C3  | Docs/help surfaces document canonical commands and ownership semantics. | repo:docs/add-ons.md; repo:src/cli/commands/docs-core.test.ts                                                                                      |
| C4  | Outside-review blockers were addressed before merge.                    | repo:src/blueprint/lifecycle/audit.approval-gate.test.ts; repo:src/cli/commands/blueprint/mutations.test.ts; repo:src/github/pr-governance.test.ts |

### Material Decisions

| ID  | Decision                           | Chosen option                                                     | Rejected alternatives                       | Rationale                                                                          |
| --- | ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| D1  | Optional tool ownership semantics. | WP records ownership and remove clears records only.              | Native uninstall during `wp remove`.        | Avoid destructive external-tool mutations while preserving future update intent.   |
| D2  | Optional update failure behavior.  | Advisory optional-tool refresh failures.                          | Make optional-agent refresh failures fatal. | Core `wp update` should not fail because an optional external tool is unavailable. |
| D3  | Review evidence gate hardening.    | Repo-bounded, git-tracked review evidence with matching metadata. | Count reviewer names from arbitrary files.  | Promotion evidence must be auditable and resistant to local untracked spoofing.    |

### Promotion Gates

| Gate       | Command             | Expected outcome | Last result                      |
| ---------- | ------------------- | ---------------- | -------------------------------- |
| sync       | wp sync --check     | pass             | pass at 2026-06-30T19:11:33.000Z |
| format     | wp format --check   | pass             | pass at 2026-06-30T19:11:33.000Z |
| typecheck  | wp typecheck        | pass             | pass at 2026-06-30T19:11:33.000Z |
| lint       | wp lint             | pass             | pass at 2026-06-30T19:11:33.000Z |
| guardrails | wp audit guardrails | pass             | pass at 2026-06-30T19:11:33.000Z |

### Residual Unknowns

None.
