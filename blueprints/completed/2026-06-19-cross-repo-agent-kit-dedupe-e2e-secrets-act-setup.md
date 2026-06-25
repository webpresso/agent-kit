---
type: blueprint
title: "Cross-repo agent-kit dedupe: e2e, secrets, act, setup"
owner: ozby
status: completed
complexity: L
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "100% (1/1 coordination ledger task completed; repo-slice implementation continues in child PRs)"
depends_on: []
cross_repo_depends_on: []
tags:
  - agent-kit
  - github-actions
  - monorepo
  - ingest-lens
  - edge-matte
  - ozby-dev
  - wp
  - secrets
  - e2e
  - ci
---

# Cross-repo agent-kit dedupe: e2e, secrets, act, setup

**Goal:** Consolidate shared e2e, secret-provider, local `act`, setup, cache, and process-lifecycle logic into Agent Kit `wp` CLI/MCP surfaces and shared GitHub Actions contracts, then cut consumers over to those shared surfaces without keeping repo-local clones.

## Planning Summary

- Source plan: approved cross-repo dedupe plan carried forward into `.omx/ultragoal/goals.json`
- Active worktrees:
  - `_worktrees/agent-kit-dedupe`
  - `_worktrees/github-actions-dedupe`
  - `_worktrees/monorepo-dedupe`
  - `_worktrees/ingest-lens-dedupe`
  - `_worktrees/edge-matte-dedupe`
  - `_worktrees/ozby-dev-dedupe`
- Active Codex goal: aggregate ultragoal objective bound on 2026-06-19
- Boundary: tooling/security/runtime orchestration only; no product feature changes

## Execution Waves

| Wave | Scope             | Outcome                                                                            |
| ---- | ----------------- | ---------------------------------------------------------------------------------- |
| 0    | Execution surface | Worktrees, blueprints, ultragoal, branch isolation                                 |
| 1    | Agent Kit         | Shared `wp` secret profiles, `wp ci act`, process supervisor, blocking audits      |
| 2    | GitHub Actions    | Shared setup/cache/OIDC/SHA-pin reusable surfaces                                  |
| 3    | Consumers         | `monorepo`, `ingest-lens`, `edge-matte`, `ozby-dev` cut over and delete duplicates |
| 4    | Verification      | Cross-repo targeted tests plus `wp` lint/typecheck/test/audit gates                |

## Repo Slices

| Repo           | Blueprint                                                                                                            | Primary concern            |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| agent-kit      | `webpresso/agent-kit/blueprints/in-progress/2026-06-19-agent-kit-wp-shared-e2e-secrets-act-supervisor.md`            | shared `wp` implementation |
| github-actions | `webpresso/github-actions/blueprints/in-progress/2026-06-19-github-actions-shared-setup-oidc-cache-pin-hardening.md` | reusable setup/OIDC/cache  |
| monorepo       | `webpresso/monorepo/webpresso/blueprints/in-progress/2026-06-19-monorepo-agent-kit-dedupe-cutover.md`                | private consumer cutover   |
| ingest-lens    | `ozby/ingest-lens/blueprints/in-progress/2026-06-19-ingest-lens-agent-kit-dedupe-cutover.md`                         | reference-consumer cutover |
| edge-matte     | `ozby/edge-matte/blueprints/in-progress/2026-06-19-edge-matte-agent-kit-dedupe-cutover.md`                           | workflow/setup cutover     |
| ozby-dev       | `ozby/ozby-dev/blueprints/in-progress/2026-06-19-ozby-dev-agent-kit-dedupe-cutover.md`                               | workflow/setup cutover     |

## Tasks

#### [coordination] Task 0.1: Aggregate cross-repo execution ledger

**Status:** done

**Depends:** None

Keep this aggregate in-progress blueprint connected to the repo-slice
blueprints and the refined secret-orchestration platform blueprint. This task
does not implement product code; it preserves lifecycle validity and makes the
execution ledger auditable while repo-specific tasks live in their own slices.

**Files:**

- Modify: `blueprints/in-progress/2026-06-19-cross-repo-agent-kit-dedupe-e2e-secrets-act-setup.md`
- Reference: `blueprints/draft/agent-kit-wp-secret-orchestration-platform.md`

**Steps (TDD):**

1. Run: `wp audit blueprint-lifecycle` — verify any lifecycle violation is visible.
2. Keep repo-slice paths and cross-plan references current as slice blueprints change.
3. Run: `wp audit blueprint-lifecycle` — verify the aggregate blueprint remains lifecycle-valid.

**Acceptance:**

- [x] Aggregate blueprint has at least one lifecycle-visible task.
- [x] Repo-slice references remain current.
- [x] `wp audit blueprint-lifecycle` has no violation from this aggregate file.

## Acceptance

- [x] All shared logic lives in Agent Kit / shared GitHub Actions ownership lanes.
- [x] Consumer repos no longer carry local act/secret/setup clones covered by the plan.
- [x] CI secret bootstrap is OIDC-only and secret-bearing third-party actions are SHA-pinned.
- [x] Verification commands and audit gates exist to block regressions.

## Completion Note

This completed blueprint records the planning and handoff artifact. Implementation is intentionally split across focused child PRs/worktrees so this parent PR is no longer a partially-complete execution tracker.

## Verification Gates

| Gate               | Command / Evidence                             | Success Criteria                             |
| ------------------ | ---------------------------------------------- | -------------------------------------------- |
| Ultragoal          | `omx ultragoal status`                         | Aggregate plan active and repo slices mapped |
| Worktree isolation | `git worktree list`                            | One dedicated dedupe worktree per repo       |
| Plan surfaces      | file existence under `blueprints/in-progress/` | Every repo has a current blueprint           |

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                                  |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-cross-repo-agent-kit-dedupe-e2e-secrets-act-setup.md |

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
