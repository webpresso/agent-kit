---
type: blueprint
title: "Skip native session-memory CI for non-Rust PR changes"
owner: ozby
status: completed
complexity: S
created: "2026-06-28"
last_updated: "2026-06-28"
progress: "100%"
depends_on:
  - "blueprints/completed/2026-06-28-pr-ci-change-scope-native-session-memory.md"
cross_repo_depends_on: []
tags: [ci, github-actions, performance]
---

# Skip native session-memory CI for non-Rust PR changes

## Goal

Tighten the PR change-scope classifier so the expensive native session-memory Rust job is skipped for PRs that do not touch Rust/native-session-memory CI inputs, while still failing closed for non-PR events and native-impacting files.

## Final outcome

The classifier now uses an explicit native-impact allowlist instead of treating every non-doc path as native-impacting. Ordinary non-Rust source, test, package, blueprint, and benchmark-script changes classify as `native_session_memory_changed=false`; native Rust crate files and native CI/package-manager inputs still classify as `true`.

This completes the original motivating case: a PR with no Rust/native-session-memory CI input changes does not run the native session-memory job, while the existing required-check-safe `ci-change-scope` + `wp-check` aggregate pattern remains intact.

## Why this exists

The prior slice added the required-check-safe `ci-change-scope` job and skipped native checks for docs/markdown-only PRs. The original request explicitly called out the broader case: if a PR has no Rust/native-session-memory changes, the native session-memory job should not run. This slice expands the classifier from docs-only to native-impact paths.

## Constraints

- Keep required checks safe: do not use workflow-level `paths` filters.
- Keep fail-closed defaults for non-PR events and indeterminate diffs.
- No new dependencies.
- Preserve native checks for Rust crate files, native CI wiring, package manager scripts/lockfiles, and classifier tests.

## Implementation

- `scripts/ci/change-scope.sh` now classifies native-session-memory impact by explicit native inputs:
  - `native/session-memory-engine/**`
  - Rust manifests/locks/toolchain/deny files
  - `*.rs`
  - `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
  - native workflow/classifier files
  - native runtime artifact build/stage scripts
  - the native CI classifier test file
- Non-PR events and empty/unreadable file lists still emit/run the conservative native path.
- The workflow continues to use job-level gating and keeps skipped jobs acceptable to `wp-check` by failing only on `failure` or `cancelled` needs results.

## Acceptance criteria

- [x] `scripts/ci/change-scope.sh classify-native src/cli/cli.ts` returns `false`.
- [x] Native-impact paths under `native/session-memory-engine/**` return `true`.
- [x] Native CI/workflow/package-manager/classifier changes return `true`.
- [x] Empty/unreadable diff and non-PR events still fail closed.
- [x] PR CI remains required-check-safe via `ci-change-scope` + `wp-check` aggregation.
- [x] Outside voice review blocker for native-file renames was fixed and covered by regression test.
- [x] PR CI `WP check` passes after push.

## Verification evidence

Local validation on 2026-06-28:

- `./bin/wp format --check --file scripts/ci/change-scope.sh --file src/build/native-session-memory-ci.test.ts --file blueprints/draft/2026-06-28-pr-ci-nonrust-native-scope.md` -> failed before formatting, identifying `src/build/native-session-memory-ci.test.ts` formatting.
- `./bin/wp format --file scripts/ci/change-scope.sh --file src/build/native-session-memory-ci.test.ts --file blueprints/draft/2026-06-28-pr-ci-nonrust-native-scope.md` -> applied formatting.
- `./bin/wp format --check --file scripts/ci/change-scope.sh --file src/build/native-session-memory-ci.test.ts --file blueprints/draft/2026-06-28-pr-ci-nonrust-native-scope.md` -> pass.
- `./node_modules/.bin/vitest run src/build/native-session-memory-ci.test.ts --project unit --reporter verbose` -> pass, 1 file / 8 tests.
- After outside review found a native-file rename fail-open edge, `git diff --name-only --no-renames` plus a temp-git-repo rename regression was added.
- `./node_modules/.bin/vitest run src/build/native-session-memory-ci.test.ts --project unit --reporter verbose` -> pass, 1 file / 9 tests.
- `bun scripts/check-workflow-action-pins.ts .` -> pass.
- `vp run blueprints:check` -> pass.
- `vp run typecheck` -> pass.
- `vp run lint` -> pass (with pre-existing `src/cli/commands/init/scaffolders/rtk/index.ts:94` oxlint parse advisory, command exit 0).
- `./bin/wp audit guardrails` -> pass after trust-dossier metadata refresh.
- PR #306 GitHub checks -> pass on run `28311109109`; `E2E` skipped by design/config; `WP check` passed.
- PR #306 merged at 2026-06-28T04:26:38Z as merge commit `48554354056d4760caf5f56d785e4af95d018f8c`.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-28T04:08:58Z
- verified-head: a8b4cfa1181e73254a09e8ad0531db165d94d294
- trust-gate-version: v1

The verified-head field records the local validation checkpoint before the final trust-dossier self-reference update. The final merge proof is PR CI on the published branch head.

### Material Claims

| ID  | Claim                                                                                                | Evidence                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| C1  | Ordinary non-Rust PR changes skip the native session-memory job.                                     | repo:scripts/ci/change-scope.sh; repo:src/build/native-session-memory-ci.test.ts         |
| C2  | Rust/native CI inputs still run the native session-memory job.                                       | repo:scripts/ci/change-scope.sh; repo:src/build/native-session-memory-ci.test.ts         |
| C3  | Required-check-safe aggregation is preserved; skipped optional jobs do not fail `wp-check`.          | repo:.github/workflows/ci.agent-kit.yml; repo:src/build/native-session-memory-ci.test.ts |
| C4  | Empty diffs, native-file renames, and non-PR events retain conservative fail-closed native behavior. | repo:scripts/ci/change-scope.sh; repo:src/build/native-session-memory-ci.test.ts         |

### Material Decisions

| ID  | Decision               | Chosen option                                        | Rejected alternatives                           | Rationale                                                                   |
| --- | ---------------------- | ---------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| D1  | Native gating shape    | Explicit native-impact classifier.                   | Docs-only classifier; workflow-level path skip. | Matches the no-Rust-change requirement without pending checks.              |
| D2  | Unknown non-Rust paths | Skip unless the path matches native-impact patterns. | Treat all unknown paths as native-impacting.    | The requested end state is no native job when no Rust/native input changes. |
| D3  | Fail-closed boundary   | Keep empty diffs and non-PR events native-running.   | Apply PR diff skip behavior to all events.      | Push/manual events lack the same PR diff contract.                          |

### Promotion Gates

| Gate      | Command                       | Expected outcome | Last result                      |
| --------- | ----------------------------- | ---------------- | -------------------------------- |
| format    | wp format --check             | pass             | pass at 2026-06-28T04:08:14.000Z |
| unit      | wp test                       | pass             | pass at 2026-06-28T04:08:14.000Z |
| workflow  | wp audit workflow-action-pins | pass             | pass at 2026-06-28T04:08:14.000Z |
| lifecycle | wp audit blueprint-lifecycle  | pass             | pass at 2026-06-28T04:08:14.000Z |
| typecheck | wp typecheck                  | pass             | pass at 2026-06-28T04:08:14.000Z |
| lint      | wp lint                       | pass             | pass at 2026-06-28T04:08:14.000Z |

### Residual Unknowns

None.
