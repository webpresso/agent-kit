---
type: blueprint
title: Dependency security latest discipline
owner: ozby
status: completed
complexity: M
created: "2026-06-28"
last_updated: "2026-06-30"
progress: "100% (implemented; local gates passed)"
depends_on: []
cross_repo_depends_on: []
tags:
  - dependencies
  - security
  - ci
  - release
approvals: []
historical_zero_task_waiver: true
historical_zero_task_rationale: Completed record uses older top-level task headings (`### Task N`) that predate the current lifecycle parser; shipped implementation and verification remain preserved below and landed in PR #313.
---

# Dependency security latest discipline

**Goal:** Resolve open dependency security/freshness drift and add a durable gate so declared workspace dependency surfaces and `packageManager` remain at the latest known versions unless a complete, owned, expiring exception exists.

## Planning Summary

- Upgrade direct root dependencies, optional dependencies, dev tooling, and pnpm catalog entries to the npm-registry latest versions verified on 2026-06-28.
- Regenerate the pnpm lockfile and prefer parent/package upgrades before adding transitive overrides.
- Add Dependabot coverage for npm/pnpm and GitHub Actions with no ignored packages.
- Add `vp run deps:freshness`, backed by regression tests, to fail on declared dependency drift, stale `packageManager`, or incomplete freshness exception metadata. Add a separate fast `vp run deps:security` audit in PR CI so low-or-higher vulnerable lockfile entries cannot land on main.

## Tasks

### Task 1: Upgrade declared dependency surfaces

**Status:** done

**Depends:** None

Update `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` for current latest versions of pnpm, rulesync, Vite/Vitest, Playwright, Wrangler, oxlint/oxfmt, Node types, and related catalog tooling.

**Acceptance:**

- [x] `pnpm outdated -r --format json` reports no entries where `wanted` differs from `latest`.
- [x] `pnpm audit --audit-level low` passes; remaining transitive overrides are documented in `pnpm-workspace.yaml`/patch files and are audit-clean.

### Task 2: Add durable dependency freshness automation

**Status:** done

**Depends:** Task 1

Add a repo-local freshness check script, package script, tests with synthetic outdated JSON, Dependabot configuration, and CI coverage.

**Acceptance:**

- [x] Freshness script fails on synthetic outdated JSON.
- [x] Freshness script fails when `package.json#packageManager` is behind latest pnpm.
- [x] Freshness script fails for incomplete exception metadata and passes for a complete unexpired exception.
- [x] `.github/dependabot.yml` checks npm/pnpm and GitHub Actions daily, with major updates visible outside the patch/minor group.
- [x] PR CI runs `vp run deps:security` and `vp run deps:freshness` after install.

### Task 3: Verify contracts and release metadata

**Status:** done

**Depends:** Task 1, Task 2

Update rulesync version references where they are contractual, add a patch changeset, and run targeted/full gates.

**Acceptance:**

- [x] Rulesync package contract references use `9.0.1` where the pinned runtime dependency is asserted.
- [x] Changeset documents the patch-level dependency/security discipline change.
- [x] Typecheck, lint, format, tests, build, path/secret audits, blueprint check, freshness, and audit gates pass; Dependabot alert API remains externally blocked with HTTP 404.

## Verification Gates

| Gate        | Command                                                                                                        | Success Criteria                                |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Install     | `vp install`                                                                                                   | Lockfile and workspace install succeed          |
| Freshness   | `vp run deps:freshness`                                                                                        | No declared dependency or package-manager drift |
| Security    | `vp run deps:security`                                                                                         | No low-or-higher advisories                     |
| Tests       | `vp exec vitest run scripts/check-dependency-freshness.subprocess.test.ts --project subprocess --reporter=dot` | Freshness regression tests pass                 |
| Type safety | `vp run typecheck`                                                                                             | Zero errors                                     |
| Lint        | `vp run lint`                                                                                                  | Zero blocking violations                        |
| Format      | `wp format --check`                                                                                            | Formatting clean                                |
| Build       | `vp run build`                                                                                                 | Build succeeds                                  |
| Policy      | `vp run verify:paths && vp run verify:secrets && vp run blueprints:check`                                      | Repo policy gates pass                          |

## Implementation Evidence

- Added `deps:security` and `deps:freshness` scripts and wired both into `.github/workflows/ci.agent-kit.yml` so PR CI fails fast on vulnerable lockfile entries or declared dependency drift.
- Added `.github/dependabot.yml` daily npm/pnpm and GitHub Actions monitoring; patch/minor npm updates are grouped while majors stay visible as separate PRs.
- Regenerated `pnpm-lock.yaml` with latest direct/catalog/tool versions and patched transitive overrides for the listed Dependabot advisories.
- Added regression tests for synthetic outdated JSON, stale pnpm package manager, incomplete freshness exceptions, and valid expiring exceptions.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-30T21:22:00Z
- verified-head: 6554b58ad7d18b6d3b415869a680fccc934b3300
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                       | Evidence                                                           |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| C1  | This completed blueprint has a canonical repository record. | repo:blueprints/completed/dependency-security-latest-discipline.md |

### Material Decisions

| ID  | Decision        | Chosen option                                         | Rejected alternatives            | Rationale                                                                                       |
| --- | --------------- | ----------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| D1  | Lifecycle state | Keep this blueprint as a completed historical record. | Leave the record in draft state. | The implementation already landed on `main`; this record now matches shipped lifecycle reality. |

### Promotion Gates

| Gate       | Command                  | Expected outcome | Last result                  |
| ---------- | ------------------------ | ---------------- | ---------------------------- |
| trust-gate | wp audit blueprint-trust | pass             | pass at 2026-06-30T21:22:00Z |

### Residual Unknowns

None.
