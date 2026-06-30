---
type: blueprint
status: completed
owner: agent-kit
complexity: S
created: 2026-06-30
last_updated: 2026-06-30
title: Dependabot minimum-release-age cooldown
progress: "100% (3 of 3 tasks completed)"
approvals:
  - reviewer: code-reviewer
    verdict: approve
    rev: final
    evidence: reviews.md
  - reviewer: test-engineer
    verdict: approve
    rev: final
    evidence: reviews.md
  - reviewer: verifier
    verdict: approve
    rev: final
    evidence: reviews.md
---

# Dependabot minimum-release-age cooldown

## Intent

Repair the Dependabot version-update job so grouped npm updates respect the repository's pnpm supply-chain freshness policy instead of attempting packages still inside the minimum-release-age window.

## Acceptance Criteria

- [x] Dependabot npm version updates are delayed long enough to avoid the observed pnpm minimum-release-age rejection for fresh package releases.
- [x] The dependency automation invariant is locked by a repo test that would fail if the cooldown is removed.
- [x] The fix is limited to dependency automation policy; no lockfile/package version updates are bundled.
- [x] Blueprint progress and trust metadata are 100% complete before merge.

## Tasks

#### [investigate] Task 1.1: Confirm failure boundary

**Status:** done

Capture the failed Dependabot job evidence and map it to the owning repo configuration.

**Acceptance:**

- [x] Failure log shows pnpm minimum-release-age violations from Dependabot lockfile generation.
- [x] Owner is identified as Dependabot version-update policy, not PR CI or optional-tool feature code.

#### [deps] Task 1.2: Add regression proof and minimal config fix

**Status:** done

Add a regression test for Dependabot cooldown policy and update `.github/dependabot.yml` minimally.

**Acceptance:**

- [x] Test fails without a npm cooldown.
- [x] `.github/dependabot.yml` npm entry has a cooldown that delays version updates at least one day.
- [x] No dependency versions or lockfile entries change.

#### [qa] Task 1.3: Verify and land

**Status:** done

Run focused checks, obtain outside review, create/merge the PR, and ensure blueprint completion remains at 100%.

**Acceptance:**

- [x] Focused dependency policy tests pass.
- [x] Format/lint/typecheck/blueprint checks pass or any blocker is documented with evidence.
- [x] At least three outside voices review the patch.
- [x] PR is ready to merge after CI.

## Verification

- Failing proof on old behavior: `vp exec vitest run scripts/check-dependency-freshness.subprocess.test.ts --project subprocess --reporter=dot` failed before the config change because `npmRootUpdate?.cooldown` was `undefined`.
- Focused regression after fix: `vp exec vitest run scripts/check-dependency-freshness.subprocess.test.ts --project subprocess --reporter=dot` → 1 file passed, 6 tests passed.
- Format: ./bin/wp format --check → passed.
- Typecheck: ./bin/wp typecheck → passed.
- Lint: ./bin/wp lint → passed via `vp lint` with the pre-existing parser note in `src/cli/commands/init/scaffolders/rtk/index.ts`.
- Dependency freshness: `vp run deps:freshness` → passed.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-30T22:17:00+03:00
- verified-head: 54aece166a818469ab3325d2214cd5d23d25b3c1
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                   | Evidence                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | The failed post-merge job was Dependabot version-update lockfile generation.            | repo:blueprints/completed/2026-06-30-dependabot-minimum-release-age-cooldown/reviews.md                                                                                             |
| C2  | pnpm rejected fresh packages inside a 24h minimum-release-age window.                   | repo:blueprints/completed/2026-06-30-dependabot-minimum-release-age-cooldown/reviews.md                                                                                             |
| C3  | Dependabot npm version updates now wait at least one day before selecting new releases. | repo:.github/dependabot.yml; web:https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file (2026-06-30)      |
| C4  | The invariant is regression-tested.                                                     | repo:scripts/check-dependency-freshness.subprocess.test.ts; derived:C3                                                                                                              |
| C5  | The patch does not bundle dependency updates.                                           | repo:.github/dependabot.yml; repo:scripts/check-dependency-freshness.subprocess.test.ts; repo:blueprints/completed/2026-06-30-dependabot-minimum-release-age-cooldown/\_overview.md |

### Material Decisions

| ID  | Decision                        | Chosen option                             | Rejected alternatives                                   | Rationale                                                                                   |
| --- | ------------------------------- | ----------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| D1  | Dependabot freshness alignment. | Add `cooldown.default-days: 1` to npm.    | Relax pnpm supply-chain verification or trust lockfile. | Preserve the repo's safety policy and delay only version-update selection.                  |
| D2  | Regression surface.             | Static policy test for Dependabot config. | Try to emulate a full Dependabot update locally.        | The owned change is config; GitHub-hosted Dependabot execution is not locally reproducible. |
| D3  | Scope of fix.                   | No lockfile/package version updates.      | Merge the open Dependabot dependency PR in this change. | Keeps root-cause automation repair separate from bot-generated dependency version changes.  |

### Promotion Gates

| Gate       | Command                                                                    | Expected outcome | Last result   |
| ---------- | -------------------------------------------------------------------------- | ---------------- | ------------- |
| regression | ./bin/wp test --file scripts/check-dependency-freshness.subprocess.test.ts | pass             | pass, 6 tests |
| format     | ./bin/wp format --check                                                    | pass             | pass          |
| typecheck  | ./bin/wp typecheck                                                         | pass             | pass          |
| lint       | ./bin/wp lint                                                              | pass             | pass          |
| guardrails | ./bin/wp audit guardrails                                                  | pass             | pass          |

### Outside Voices

| Reviewer      | Verdict | Evidence                                                                                                                               |
| ------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| test-engineer | approve | Confirmed the regression fails on old config and guards `cooldown.default-days >= 1`; no blockers.                                     |
| code-reviewer | approve | Confirmed root-cause alignment and sufficiency of one-day cooldown for observed failure; only process blocker was blueprint lifecycle. |
| verifier      | approve | Confirmed local code gates passed and identified pre-merge process blockers; those blockers are closed in this completed blueprint.    |

### Residual Unknowns

None.
