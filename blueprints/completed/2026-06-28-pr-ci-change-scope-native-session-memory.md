---
type: blueprint
title: "PR CI change-scope gating for redundant jobs"
owner: ozby
status: completed
complexity: M
created: "2026-06-28"
last_updated: "2026-06-28"
progress: "100% (change-scope gating implemented, locally verified, and ready for PR CI validation)"
depends_on:
  - "blueprints/completed/2026-06-25-reduce-test-wall-time.md"
cross_repo_depends_on: []
tags: [ci, github-actions, performance, native]
historical_zero_task_waiver: true
historical_zero_task_rationale: "Historical completed blueprint preserved as a zero-task record during lifecycle hardening; no executable task blocks were authored in the original document."
---

# PR CI change-scope gating for redundant jobs

**Goal:** Reduce redundant PR checks by skipping expensive jobs when a pull request cannot affect them, starting with the `Native session-memory` Rust job and the currently no-op `E2E` job when no Playwright config exists, while preserving required-check and branch-protection semantics.

**Final outcome:** The CI workflow now runs a cheap `ci-change-scope` job before expensive optional jobs. Pull requests whose changed files are only docs paths or markdown files (including blueprint markdown) skip `Native session-memory`; native-impact or unknown paths, `push`, and `workflow_dispatch` run it fail-closed. The same change-scope job skips the `E2E` job when this repository still has no `playwright.config.ts`, replacing the previous no-op job body with a job-level skip that branch protection treats as successful.

## Research and planning evidence

`$best-practice-research` found the current GitHub Actions best practice for required checks: keep required workflows always triggered, avoid workflow-level `paths` filters for required checks because skipped workflows can stay pending, and use job-level conditions plus a stable aggregate gate because skipped jobs report success. Official GitHub docs cited during planning:

- GitHub workflow syntax path filters and diff semantics: <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore>
- Required-check skipped workflow/job behavior: <https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks#handling-skipped-but-required-checks>
- Job conditions: <https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions>
- Job outputs and needs context: <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs>

`$ralplan` consensus selected a narrow first slice: add a cheap all-events change-scope job, gate high-confidence redundant jobs (`native-session-memory` and absent-Playwright `e2e`), make classification fail-closed, keep `wp-check` as the stable aggregate, and prove behavior with workflow contract tests.

## Decision summary

- Do **not** add workflow-level `paths` filters to required CI.
- Do **not** add a third-party path-filter action.
- Add a repo-owned classifier script and a cheap `ci-change-scope` job.
- Default `native_session_memory_changed=true`; set it to `false` only for pull requests whose changed files are all known documentation/blueprint-only paths.
- Default `playwright_e2e_present=true`; set it to `false` only when the checkout has no `playwright.config.ts`, matching the E2E job's previous internal skip behavior before install.
- Keep `push` and `workflow_dispatch` fail-closed by always running native checks.
- Keep `wp-check` green when a gated job is skipped, but red when the classifier or any required job fails/cancels.

## Conservative path policy

Native session-memory must run for unknown paths and for at least:

- `native/session-memory-engine/**`
- `src/session-memory/**`
- `scripts/build-session-memory-native-artifacts.ts`
- `scripts/stage-session-memory-native-artifacts.ts`
- `scripts/build-runtime-binaries.ts`
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- `.github/workflows/ci.agent-kit.yml`
- `src/build/native-session-memory-ci.test.ts`

This first slice may still run native checks for many non-Rust code changes. That is intentional: false positives waste CI, but false negatives weaken coverage. Future slices can safely expand the known-safe skip set after evidence.

## Acceptance criteria

- [x] PRs with only docs paths or markdown-file changes skip `native-session-memory`.
- [x] PRs changing native source, session-memory source, workflow, package scripts/lockfiles, or unknown paths run `native-session-memory`.
- [x] `push` and `workflow_dispatch` keep running `native-session-memory`.
- [x] `wp-check` accepts skipped gated jobs but still fails on failed/cancelled required jobs or failed change-scope detection.
- [x] No new third-party GitHub Actions are introduced.
- [x] Workflow contract tests prove native gating, absent-Playwright E2E gating, and false-negative prevention fixtures.

## Verification plan

- `vp run test -- src/build/native-session-memory-ci.test.ts`
- `bun scripts/check-workflow-action-pins.ts .`
- `vp run blueprints:check`
- `./bin/wp format --check --file .github/workflows/ci.agent-kit.yml --file scripts/ci/change-scope.sh --file src/build/native-session-memory-ci.test.ts --file blueprints/completed/2026-06-28-pr-ci-change-scope-native-session-memory.md`
- `vp run typecheck`
- `vp run lint`

## Implementation evidence

- `.github/workflows/ci.agent-kit.yml` adds `ci-change-scope` after `auth-preflight`, using the existing pinned `actions/checkout` SHA with `fetch-depth: 0`.
- `scripts/ci/change-scope.sh` is repo-owned, dependency-free shell logic. It defaults to `native_session_memory_changed=true` and only emits `false` for PR diffs made entirely of known docs paths or markdown files.
- `native-session-memory` now depends on `ci-change-scope` and keeps running for non-PR events or when `native_session_memory_changed == 'true'`.
- `e2e` now depends on `ci-change-scope` and runs only when `playwright_e2e_present == 'true'`; this repository currently has no `playwright.config.ts`, so the previous no-op E2E body becomes a branch-protection-safe skipped job.
- `wp-check` depends on `ci-change-scope` and keeps failing on `failure`/`cancelled`, not on `skipped`, so required-check semantics remain stable.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-28T03:35:52.000Z
- verified-head: 7d8acb4d66aeaf1b80d3465b28fd40874bd4c258
- trust-gate-version: v1

The `verified-head` records the local validation checkpoint for the implementation commit. The final merge proof is the PR CI run on the published head and merge commit, because a commit cannot literally contain its own final hash after trust-dossier edits.

### Material Claims

| ID  | Claim                                                                                                                            | Evidence                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| C1  | Required CI keeps an always-triggered workflow and moves redundant-work decisions to job-level conditions.                       | repo:.github/workflows/ci.agent-kit.yml                                          |
| C2  | Native session-memory gating is fail-closed for non-PR events, unknown paths, package/workflow changes, and native-impact paths. | repo:scripts/ci/change-scope.sh; repo:src/build/native-session-memory-ci.test.ts |
| C3  | The current no-op E2E job is skipped only when the checkout has no `playwright.config.ts`.                                       | repo:scripts/ci/change-scope.sh; repo:.github/workflows/ci.agent-kit.yml         |
| C4  | The plan used official GitHub required-check guidance and RALPLAN consensus before implementation.                               | repo:blueprints/completed/2026-06-28-pr-ci-change-scope-native-session-memory.md |

### Material Decisions

| ID  | Decision                    | Chosen option                                                         | Rejected alternatives                                    | Rationale                                                                               |
| --- | --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| D1  | Required-check gating shape | Always run workflow; skip selected jobs with `if` and outputs.        | Workflow-level `paths` filters.                          | Avoids required checks stuck pending while still reducing redundant job work.           |
| D2  | Classifier dependency       | Repo-owned shell classifier.                                          | Third-party path-filter action.                          | Avoids new action dependency and keeps action-pin surface unchanged.                    |
| D3  | Native path policy          | Only docs paths and markdown files are known-safe skips in slice one. | Attempting broad source-code classification immediately. | Conservative false-positive bias prevents missing native-impact changes.                |
| D4  | E2E no-op handling          | Skip E2E at job level when `playwright.config.ts` is absent.          | Keep running install/setup only to skip inside the job.  | Removes redundant PR work while preserving success semantics for required skipped jobs. |

### Promotion Gates

| Gate       | Command                       | Expected outcome | Last result                      |
| ---------- | ----------------------------- | ---------------- | -------------------------------- |
| format     | wp format --check             | pass             | pass at 2026-06-28T03:35:52.000Z |
| lifecycle  | wp audit blueprint-lifecycle  | pass             | pass at 2026-06-28T03:35:52.000Z |
| action-pin | wp audit workflow-action-pins | pass             | pass at 2026-06-28T03:35:52.000Z |
| typecheck  | wp typecheck                  | pass             | pass at 2026-06-28T03:35:52.000Z |
| lint       | wp lint                       | pass             | pass at 2026-06-28T03:35:52.000Z |

### Residual Unknowns

None.
