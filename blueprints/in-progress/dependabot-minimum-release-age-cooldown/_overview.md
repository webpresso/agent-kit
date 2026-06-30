---
type: blueprint
status: in-progress
owner: agent-kit
complexity: S
created: 2026-06-30
last_updated: 2026-06-30
title: Dependabot minimum-release-age cooldown
progress: "0% (0 of 3 tasks completed)"
---

# Dependabot minimum-release-age cooldown

## Intent

Repair the Dependabot version-update job so grouped npm updates respect the repository's pnpm supply-chain freshness policy instead of attempting packages still inside the minimum-release-age window.

## Acceptance Criteria

- Dependabot npm version updates are delayed long enough to avoid the observed pnpm minimum-release-age rejection for fresh package releases.
- The dependency automation invariant is locked by a repo test that would fail if the cooldown is removed.
- The fix is limited to dependency automation policy; no lockfile/package version updates are bundled.
- Blueprint progress and trust metadata are 100% complete before merge.

## Tasks

### Task 1: Confirm failure boundary

**Status:** in-progress

Capture the failed Dependabot job evidence and map it to the owning repo configuration.

**Acceptance:**

- [ ] Failure log shows pnpm minimum-release-age violations from Dependabot lockfile generation.
- [ ] Owner is identified as Dependabot version-update policy, not PR CI or optional-tool feature code.

### Task 2: Add regression proof and minimal config fix

**Status:** todo

Add a regression test for Dependabot cooldown policy and update `.github/dependabot.yml` minimally.

**Acceptance:**

- [ ] Test fails without a npm cooldown.
- [ ] `.github/dependabot.yml` npm entry has a cooldown that delays patch/minor version updates at least one day.
- [ ] No dependency versions or lockfile entries change.

### Task 3: Verify and land

**Status:** todo

Run focused checks, obtain outside review, create/merge the PR, and ensure blueprint completion remains at 100%.

**Acceptance:**

- [ ] Focused dependency policy tests pass.
- [ ] Format/lint/typecheck/blueprint checks pass or any blocker is documented with evidence.
- [ ] At least three outside voices review the patch.
- [ ] PR is merged and local main matches origin/main.
