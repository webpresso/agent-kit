---
type: blueprint
title: "Package-contract packed-install wall-time follow-up"
owner: ozby
status: draft
complexity: M
created: "2026-06-26"
last_updated: "2026-06-26"
progress: "0% (follow-up identified from completed reduce-test-wall-time blueprint)"
depends_on:
  - "blueprints/completed/2026-06-25-reduce-test-wall-time.md"
cross_repo_depends_on: []
tags: [performance, tests, packaging]
---

# Package-contract packed-install wall-time follow-up

**Goal:** Reduce the remaining packed-install bottleneck so the full test suite can credibly approach the original under-4-minute wall-time target without weakening coverage or increasing timeouts.

## Why this exists

`blueprints/completed/2026-06-25-reduce-test-wall-time.md` shipped the major wall-time reductions on `main`, but fresh closeout evidence on 2026-06-26 showed `package.contract.integration.test.ts --project serial-subprocess` still exceeded a 245.02-second timebox by itself. That means the remaining packed-install path now dominates the suite budget.

## Constraints

- No new dependencies.
- Do not reduce required PR coverage.
- Do not increase Vitest or CI timeouts.
- Preserve the real packed-consumer behavior that the package-contract test is meant to prove.

## Initial hypotheses to verify

1. Repeated packed-consumer installs and migration setup dominate runtime even after tarball reuse.
2. Some setup in `package.contract.integration.test.ts` can be shared or cached across cases without weakening assertions.
3. The serial-subprocess lane may still be doing avoidable rebuild or re-stage work for packed installs.

## Phase 1: Measure the packed-install path precisely

### Task 1.1: Add durable timing breakdown for package-contract installs

**Status:** pending

Instrument or otherwise measure the major phases inside `package.contract.integration.test.ts` so future optimizations are aimed at the true hotspot, not guessed.

**Acceptance:**

- [ ] A fresh timing breakdown is recorded in this blueprint.
- [ ] The dominant sub-phase is identified with evidence.

## Phase 2: Remove avoidable repeated work

### Task 2.1: Implement the smallest safe optimization for the dominant packed-install cost

**Status:** pending

Apply the minimal change that reduces packed-install wall time while preserving the same contract assertions and installation realism.

**Acceptance:**

- [ ] The optimized package-contract test still proves real packed-consumer behavior.
- [ ] No timeout increases or coverage reductions are introduced.

## Phase 3: Re-verify suite impact

### Task 3.1: Re-run package-contract timing and full-suite timing

**Status:** pending

After the optimization, rerun the package-contract test and then the full suite to determine whether the original under-4-minute target becomes realistic again or needs another follow-up.

**Acceptance:**

- [ ] Fresh package-contract timing is recorded.
- [ ] Fresh full-suite timing is recorded.
- [ ] A truthful lifecycle decision is made from evidence.
