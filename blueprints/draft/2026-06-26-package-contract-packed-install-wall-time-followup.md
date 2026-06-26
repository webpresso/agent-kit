---
type: blueprint
title: "Package-contract packed-install wall-time follow-up"
owner: ozby
status: draft
complexity: M
created: "2026-06-26"
last_updated: "2026-06-26"
progress: "85% (single packed local install landed; global parity install now uses one deterministic umbrella install and no longer dominates the file)"
depends_on:
  - "blueprints/completed/2026-06-25-reduce-test-wall-time.md"
cross_repo_depends_on: []
tags: [performance, tests, packaging]
---

# Package-contract packed-install wall-time follow-up

**Goal:** Reduce the remaining packed-install bottleneck so the full test suite can credibly approach the original under-4-minute wall-time target without weakening coverage or increasing timeouts.

## Why this exists

`blueprints/completed/2026-06-25-reduce-test-wall-time.md` shipped the major wall-time reductions on `main`, but fresh closeout evidence on 2026-06-26 showed `package.contract.integration.test.ts --project serial-subprocess` still exceeded a 245.02-second timebox by itself. That means the remaining packed-install path now dominates the suite budget.

## Fresh evidence (2026-06-26)

- Previous merged-main baseline from the closeout blueprint:
  - `pnpm exec vitest run package.contract.integration.test.ts --project serial-subprocess --reporter verbose` -> `real 420.82`
  - slowest subtests in that baseline:
    - setup-guidance smoke: `119.775s`
    - global typecheck parity smoke: `226.206s`
    - migration smoke: `39.467s`
    - packed-surface metadata pack: `23.019s`
- Current worktree evidence after this slice:
  - previous optimization checkpoint:
    - `./node_modules/.bin/vitest run package.contract.integration.test.ts --project serial-subprocess --reporter verbose` -> pass, `real 372.24`, Vitest duration `363.26s`
  - current optimization checkpoint:
    - `./node_modules/.bin/vitest run package.contract.integration.test.ts --project serial-subprocess --reporter verbose` -> pass, duration `211.12s`
  - local packed-consumer assertions now break down as:
    - packed-surface metadata assertions: `8ms`, `1ms`, `0ms` (prewarmed in `beforeAll`)
    - setup-guidance smoke: `24.987s`
    - migration smoke: `1.936s`
    - packed global install + parity smoke, previous shape: `224.740s`
    - packed global install + parity smoke, current one-install shape: `141.630s`
  - `./node_modules/.bin/vitest run src/hooks/pretool-guard/runner.subprocess.test.ts --project subprocess --reporter verbose` -> pass, 9 tests, duration `38.99s`
  - `./bin/wp test --file package.contract.integration.test.ts --file src/typecheck/runtime-parity.test.ts --full` -> pass, 2 files / 12 tests, duration `263.52s`
  - `vp run typecheck` -> pass
  - `vp run lint` -> pass
  - `./bin/wp format --check --file package.contract.integration.test.ts --file src/typecheck/runtime-parity.ts --file src/typecheck/runtime-parity.test.ts --file blueprints/draft/2026-06-26-package-contract-packed-install-wall-time-followup.md` -> pass
  - attempted warm `vp run test` remeasure did **not** yield a trustworthy whole-suite wall time:
    - before completion, the suite surfaced broader failures in `src/hooks/pretool-guard/runner.subprocess.test.ts` and `src/cli/commands/init/init.integration.test.ts`
    - that means this slice can truthfully claim the targeted hotspot win, but not a clean end-to-end suite timing yet

## Decision this slice

- Keep the real tarball as the only packed-surface source.
- Keep one shared local installed-consumer fixture across the setup-guidance and migration assertions.
- Prewarm the tarball artifact and shared installed consumer in `beforeAll` so per-test timeouts cover only the assertion work, not the one-time package preparation.
- The previous global parity test shape was doing an unsupported umbrella install (`--omit=optional`) and then compensating with a second top-level global runtime install that collided on `bin/wp`, required `--force`, and duplicated npm work.
- The deterministic fix is to install the umbrella package globally only once, while rewiring just the host runtime optional dependency inside the test-local tarball fixture to the local runtime tarball. That keeps the real umbrella tarball and real runtime tarball in play, avoids registry dependence, and lets npm install the runtime as a dependency instead of as a second global owner of `wp`.
- After that change, the global parity case is no longer the dominant majority of the file runtime, though it remains the largest single case.

## Constraints

- No new dependencies.
- Do not reduce required PR coverage.
- Do not increase Vitest or CI timeouts.
- Preserve the real packed-consumer behavior that the package-contract test is meant to prove.

## Initial hypotheses to verify

1. Repeated packed-consumer installs and migration setup dominate runtime even after tarball reuse.
2. Some setup in `package.contract.integration.test.ts` can be shared or cached across cases without weakening assertions.
3. The serial-subprocess lane may still be doing avoidable rebuild or re-stage work for packed installs.
4. The packed global install slowdown may be amplified by test-local install shape rather than by the packed artifact itself.

## Phase 1: Measure the packed-install path precisely

### Task 1.1: Add durable timing breakdown for package-contract installs

**Status:** done

Instrument or otherwise measure the major phases inside `package.contract.integration.test.ts` so future optimizations are aimed at the true hotspot, not guessed.

**Acceptance:**

- [x] A fresh timing breakdown is recorded in this blueprint.
- [x] The dominant sub-phase is identified with evidence (`packed global installs keep bare wp typecheck targeting aligned...` at `224.740s`).

## Phase 2: Remove avoidable repeated work

### Task 2.1: Implement the smallest safe optimization for the dominant packed-install cost

**Status:** done

Apply the minimal change that reduces packed-install wall time while preserving the same contract assertions and installation realism.

**Acceptance:**

- [x] The optimized package-contract test still proves real packed-consumer behavior.
- [x] No timeout increases or coverage reductions are introduced.
- [x] The installed global parity case now follows the supported runtime-dependency direction instead of omitting optional dependencies and force-installing a second global `wp` owner.

## Phase 3: Re-verify suite impact

### Task 3.1: Re-run package-contract timing and full-suite timing

**Status:** in_progress

After the optimization, rerun the package-contract test and then the full suite to determine whether the original under-4-minute target becomes realistic again or needs another follow-up.

**Acceptance:**

- [x] Fresh package-contract timing is recorded.
- [x] Fresh hook-runner watch timing is recorded.
- [ ] Fresh full-suite timing is recorded.
- [x] A truthful lifecycle decision is made from evidence: this slice materially helped, but the original full-suite target still needs a fresh whole-suite measurement and may now be blocked more by the parity probes themselves than by packed install duplication.
