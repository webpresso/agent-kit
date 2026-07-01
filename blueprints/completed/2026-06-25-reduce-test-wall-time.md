---
type: blueprint
title: "Reduce test wall-time"
owner: ozby
status: completed
complexity: M
created: "2026-06-25"
last_updated: "2026-06-26"
progress: "100% (shipped wall-time reductions landed; residual packed-install bottleneck split to a follow-up blueprint)"
depends_on: []
cross_repo_depends_on: []
tags: [performance, tests, ci]
---

# Reduce test wall time

**Goal:** Reduce local and CI test wall-time while keeping every PR on the full required suite.

**Final outcome:** The scoped reductions in this blueprint shipped on `main` via PR #276 and materially improved the suite, but the original under-4-minute full-suite target was not met. The remaining packed-install bottleneck was split to, reduced in, and closed by `blueprints/completed/2026-06-26-package-contract-packed-install-wall-time-followup.md`; the suite still remains above the original under-4-minute target.

## Planning Summary

- Source plan: previous agent's Test Wall-Time Reduction Plan, accepted as current user intent.
- Success target: after warmup, `vp run test` should complete in under 4 minutes without increasing timeouts or dropping coverage from PR gates.
- Immediate blocker to address first: `scripts/bench/lib/claim-surfaces.test.ts` can spend more than 15 minutes because unit paths invoke packed-surface discovery through `npm pack --dry-run`.
- Constraints: no new dependencies, no timeout increases, preserve production packed-surface scanning, keep full PR CI suite.

## Architecture Overview

```text
unit tests
  -> enumerateClaimSurfaces(default: source/workspace filesystem only)
  -> no npm pack subprocess unless packed-surface mode is explicitly requested

packed-surface tests / production release checks
  -> enumerateClaimSurfaces({ includePackedSurface: true })
  -> existing npm pack dry-run behavior remains covered

Vitest projects
  -> normal unit tests use bounded forks workers
  -> subprocess-heavy tests run with bounded worker parallelism
  -> only reproducible shared-resource offenders move to serial isolation

CI
  -> cancel superseded runs
  -> Rust setup/cache before native checks
  -> JS and native checks structured to reduce critical path without weakening required gates
```

## Key Decisions

| Decision               | Choice                                                                | Rationale                                                                               |
| ---------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Packed-surface default | Make packed-surface enumeration opt-in for tests/callers that need it | Unit tests should not pay `npm pack --dry-run` cost unless asserting packaged behavior. |
| Vitest parallelism     | Use `forks` plus bounded workers (`CI=2`, local=3)                    | Keeps subprocess tests isolated while avoiding full serialization.                      |
| Timeouts               | Keep current test timeouts unchanged                                  | Slowness should be fixed at source, not hidden with larger timeouts.                    |
| Dependencies           | Add no new dependencies                                               | Small runner/config changes are enough and match repo policy.                           |

## Quick Reference (Execution Waves)

| Wave              | Tasks             | Dependencies     | Parallelizable          |
| ----------------- | ----------------- | ---------------- | ----------------------- |
| **Wave 0**        | 1.1               | Gate complete    | 1 agent                 |
| **Wave 1**        | 2.1, 2.2          | 1.1 verified     | Mostly parallel         |
| **Wave 2**        | 3.1, 3.2          | 2.1/2.2 verified | Sequential verification |
| **Critical path** | 1.1 -> 2.1 -> 3.2 | --               | 3 waves                 |

### Phase 1: Remove unit-suite pack subprocess cost [Complexity: M]

#### [backend] Task 1.1: Make packed claim-surface scanning explicit

**Status:** done

**Depends:** None

Update `enumerateClaimSurfaces()` and its tests so default unit behavior scans source/workspace surfaces without invoking `npm pack --dry-run`. Preserve the production path and explicit tests that validate packed tarball/file-list behavior.

**Files:**

- Modify: `scripts/bench/lib/claim-surfaces.ts`
- Modify: `scripts/bench/lib/claim-surfaces.test.ts`
- Modify related call sites only where needed to request packed-surface scanning intentionally.

**Steps (TDD):**

1. Reproduce targeted test slowness or identify the pack subprocess path from code.
2. Add/adjust tests that prove default enumeration does not call the pack command and explicit packed enumeration still does.
3. Implement the smallest option/branch change to separate default source scanning from packed scanning.
4. Run `vp run test -- scripts/bench/lib/claim-surfaces.test.ts` and record timing.

**Acceptance:**

- [x] Default unit tests avoid `npm pack --dry-run`.
- [x] Explicit packed-surface behavior remains covered.
- [x] Targeted claim-surface test passes quickly.

### Phase 2: Bounded test parallelism and local QA runner [Complexity: M]

#### [qa] Task 2.1: Tune Vitest worker pool for subprocess tests

**Status:** done

**Depends:** Task 1.1

Configure Vitest to use fork isolation with bounded file workers: CI max workers 2, local max workers 3. Do not increase test timeouts. If full-suite stability exposes reproducible shared-resource races, isolate only those exact files in a tiny serial project.

**Files:**

- Modify: `vitest.config.ts`
- Modify tests/config support only for reproducible offenders.

**Steps (TDD):**

1. Inspect current project/test pool configuration.
2. Apply bounded worker settings.
3. Run targeted subprocess-heavy tests and then repeated full suite stability checks.

**Acceptance:**

- [x] Subprocess tests are no longer globally serialized.
- [x] CI workers capped at 2 and local workers capped at 3.
- [x] The original under-4-minute full-suite target was re-verified as still unmet without timeout increases, and the residual packed-install bottleneck was explicitly split to follow-up PR #283 / `blueprints/completed/2026-06-26-package-contract-packed-install-wall-time-followup.md`.

#### [qa] Task 2.2: Parallelize local QA after build

**Status:** done

**Depends:** Task 1.1

Replace sequential independent post-build QA checks with a small dependency-free runner that streams child output and exits non-zero if any child fails.

**Files:**

- Modify: `package.json`
- Create/modify: a script under `scripts/` if existing repo facades do not already support this.

**Steps (TDD):**

1. Identify current `qa` script phases and dependencies.
2. Keep `build` before dependent checks.
3. Run independent checks concurrently after build with streamed output and aggregate failure.

**Acceptance:**

- [x] Local `qa` preserves all checks.
- [x] Child output remains visible.
- [x] Any failing child check fails `qa` (observed format-child failure produced aggregate non-zero result).

### Phase 3: CI critical path improvements [Complexity: M]

#### [infra] Task 3.1: Reduce superseded and native CI wall-time

**Status:** done

**Depends:** Task 1.1

Improve GitHub Actions without weakening gates: add workflow concurrency with cancel-in-progress, ensure Rust cache/toolchain setup happens before native checks, use the prebuilt `cargo-deny` installer, and split native Rust checks from JS tests if that shortens the critical path.

**Files:**

- Modify: `.github/workflows/ci.agent-kit.yml`

**Steps (TDD):**

1. Inspect current CI jobs and native guardrail steps.
2. Add concurrency and native setup/cache improvements.
3. Keep full PR suite required and avoid artifact action regressions.

**Acceptance:**

- [x] Superseded PR runs cancel safely via workflow `concurrency.cancel-in-progress`.
- [x] Native Rust checks use cached/prebuilt setup where applicable.
- [x] Full PR suite still runs; native checks are split into a required `native-session-memory` job included in `wp-check`.

#### [qa] Task 3.2: Full verification and timing evidence

**Status:** done

**Depends:** Tasks 2.1, 2.2, 3.1

Run targeted and broad verification, including repeated full suite attempts after subprocess parallelism. Capture timing and any residual gaps.

**Files:**

- Modify: `blueprints/draft/reduce-test-wall-time.md`

**Acceptance:**

- [x] Scoped direct Vitest target passes: `pnpm exec vitest run scripts/bench/lib/claim-surfaces.test.ts src/build/native-session-memory-ci.test.ts --project unit` (13 tests, 6.99s Vitest duration). `vp run test -- <file>` selected broader project tests in this repo and was stopped.
- [x] Fresh 2026-06-26 evidence captured after the merged work landed on local `main`: targeted unit coverage passes in 32.07s real, `runner.subprocess.test.ts` passes alone in 61.47s real, `vp run typecheck` passes in 20.16s real, and `vp run lint` passes in 16.90s real.
- [x] Residual blocker confirmed: `package.contract.integration.test.ts --project serial-subprocess` exceeded a 245.02s timebox by itself, proving the original under-4-minute full-suite target is still unmet even after the shipped reductions.
- [x] Remaining packed-install work was split into follow-up blueprint `blueprints/completed/2026-06-26-package-contract-packed-install-wall-time-followup.md`, so this blueprint closes without overstating the original target.

---

## Verification Gates

| Gate           | Command                                                                                                                   | Success Criteria                                         | Last result                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Targeted tests | `pnpm exec vitest run scripts/bench/lib/claim-surfaces.test.ts src/build/native-session-memory-ci.test.ts --project unit` | Passes quickly without unit timeout                      | pass (32.07s real on 2026-06-26)                                              |
| Full tests     | `vp run test`                                                                                                             | Passes under 4 minutes after warmup                      | follow-up rerun passed in 521.68s; original under-4 target still unmet        |
| Stability      | `vp run test` repeated 3 times                                                                                            | All pass; no reproducible shared-state races             | deferred to follow-up; suite target still blocked by packed-install wall time |
| Type safety    | `vp run typecheck`                                                                                                        | Zero errors                                              | pass (20.16s real on 2026-06-26)                                              |
| Format         | `wp format --check`                                                                                                       | Zero formatting violations                               | pending final blueprint-only check                                            |
| Lint           | `vp run lint`                                                                                                             | Zero lint violations                                     | pass (16.90s real on 2026-06-26)                                              |
| CI             | PR #276 Actions                                                                                                           | Full required suite passes; timing compared before/after | pass (merged 2026-06-26 with required checks green)                           |

## Cross-Plan References

| Type      | Blueprint                                                                                          | Relationship                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Related   | `blueprints/draft/subprocess-test-pool-isolation-via-subprocess-test-ts-suffix-vitest-projects.md` | Prior/related approach for subprocess test pool isolation; reuse only if reproducible races require serial isolation. |
| Follow-up | `blueprints/completed/2026-06-26-package-contract-packed-install-wall-time-followup.md`            | Owns the remaining packed-install bottleneck that keeps the suite above the original under-4-minute target.           |

## Edge Cases and Error Handling

| Edge Case                                         | Risk                                                     | Solution                                                                    | Task |
| ------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- | ---- |
| Production release checks need packed file list   | Removing default pack scan could weaken release evidence | Keep packed scan behind explicit option and update production callers/tests | 1.1  |
| Subprocess tests share global files or HOME state | Parallelism could introduce flakes                       | Move only reproducible offenders to serial isolation                        | 2.1  |
| CI split accidentally drops a required gate       | Faster but weaker PR protection                          | Keep all existing commands represented in CI and verify workflow diff       | 3.1  |
| Local QA output interleaves                       | Debugging failures gets harder                           | Prefix streamed child output by check name                                  | 2.2  |

## Non-goals

- Do not reduce required PR coverage.
- Do not increase Vitest or CI timeouts.
- Do not add test-sharding unless measured single-runner improvements still miss the target.
- Do not add dependencies.

## Risks

| Risk                                                           | Impact                          | Mitigation                                                                     |
| -------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| Full suite still exceeds 4 minutes because of other slow tests | Target unmet                    | Capture top offenders and isolate/fix next bottleneck without weakening gates. |
| CI credentials unavailable from this environment               | Draft PR/CI evidence incomplete | Attempt repo-standard `gh` flow and document auth blocker if present.          |

## Technology Choices

| Component       | Technology                                 | Version                          | Why                                                              |
| --------------- | ------------------------------------------ | -------------------------------- | ---------------------------------------------------------------- |
| Test runner     | Vitest                                     | repo-pinned                      | Existing test infrastructure supports forks/maxWorkers.          |
| CI              | GitHub Actions                             | current workflow                 | Existing PR gate surface.                                        |
| Native setup    | Rust cache + prebuilt cargo-deny installer | workflow action versions in repo | Reduces native guardrail setup time.                             |
| Local QA runner | Node.js built-ins                          | repo runtime                     | Streams output and aggregates failures without new dependencies. |

## Verification Notes (2026-06-25)

- Draft PR opened before implementation: https://github.com/webpresso/agent-kit/pull/276.
- Targeted claim/native CI contract tests pass: `pnpm exec vitest run scripts/bench/lib/claim-surfaces.test.ts src/build/native-session-memory-ci.test.ts --project unit` -> 2 files, 13 tests passed.
- `vp run typecheck` -> pass.
- `./bin/wp typecheck --affected --branch` -> pass after fixing the affected-typecheck no-op path for test/config-only branches.
- `vp run lint` -> pass.
- `pnpm exec vitest run src/typecheck/affected.test.ts --project unit` -> pass (4 tests).
- `bun scripts/check-workflow-action-pins.ts .` -> pass.
- Changed-file format check -> pass. Full `wp format --check` remains blocked by pre-existing non-task formatting drift in six files.
- `vp run test` with bounded subprocess workers exposed reproducible shared-state/time bottlenecks instead of passing under 4 minutes: package/release subprocess files and `src/hooks/pretool-guard/runner.subprocess.test.ts`. A tiny `serial-subprocess` project isolates package/release files; hook runner still fails alone because spawned hook binary exceeds its internal 8s timeout under this environment.
- `pnpm exec vitest run package.contract.integration.test.ts --project serial-subprocess` -> pass (6 tests, 305.37s). With hook-style `GIT_DIR`/`GIT_WORK_TREE` inherited, the same contract passes (6 tests, 301.03s) after hermetic test setup strips Git control variables. The package contract uses packed tarball reuse and skips redundant dist rebuilds when Vitest globalSetup already built artifacts; at this checkpoint, native packed installs were the dominant wall-time bottleneck split to the follow-up.

## Verification Notes (2026-06-26 closeout)

- Reconciliation: PR #276 (`Reduce test wall-time`) is merged on local `main` at `6d8bbf7c` with all required GitHub checks green.
- Fresh targeted verification:
  - `pnpm exec vitest run scripts/bench/lib/claim-surfaces.test.ts src/build/native-session-memory-ci.test.ts --project unit` -> pass, 13 tests, `real 32.07`.
  - `pnpm exec vitest run src/hooks/pretool-guard/runner.subprocess.test.ts --project subprocess` -> pass, 9 tests, `real 61.47`.
  - `vp run typecheck` -> pass, `real 20.16`.
  - `vp run lint` -> pass, `real 16.90`.
- Fresh bottleneck proof:
  - `package.contract.integration.test.ts --project serial-subprocess` was re-run under a 245-second timebox and hit `EXIT=TIMEOUT` at `ELAPSED_SECONDS=245.02`, so the remaining packed-install path still consumes more than the blueprint's entire under-4-minute full-suite budget by itself.
- Lifecycle decision:
  - This blueprint is completed as the truthful record of the landed reductions and their verification.
  - The unmet under-4-minute target is explicitly continued in `blueprints/completed/2026-06-26-package-contract-packed-install-wall-time-followup.md`.

## Post-follow-up reconciliation (2026-06-28)

- PR #283 completed the packed-install follow-up and reduced the `package.contract.integration.test.ts --project serial-subprocess` path from the closeout timeout/baseline to a final `./bin/wp test --file package.contract.integration.test.ts --full` pass in `173.88s`.
- The same follow-up recorded the missing full-suite evidence: `vp run test` passed in `521.68s`, so this parent blueprint remains truthful: the shipped reductions helped, but the original under-4-minute suite target is still not met.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-26T00:00:00.000Z
- verified-head: 6d8bbf7c04835cb794089b441c43453b650455aa
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                          | Evidence                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| C1  | PR #276 landed the wall-time reductions on `main` and this completed blueprint is now the durable historical record.           | repo:blueprints/completed/2026-06-25-reduce-test-wall-time.md                              |
| C2  | The original under-4-minute suite target remains unmet because `package.contract.integration.test.ts` is still the bottleneck. | repo:blueprints/completed/2026-06-25-reduce-test-wall-time.md                              |
| C3  | The remaining packed-install work now has explicit follow-up ownership instead of staying ambiguous in a completed blueprint.  | repo:blueprints/completed/2026-06-26-package-contract-packed-install-wall-time-followup.md |

### Material Decisions

| ID  | Decision           | Chosen option               | Rejected alternatives                       | Rationale                                                        |
| --- | ------------------ | --------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| D1  | Unit pack behavior | Opt-in packed enumeration   | Mock every subprocess; increase timeout     | Removes source of slowness while preserving production behavior. |
| D2  | Test parallelism   | Bounded fork workers        | Global serialization; unbounded concurrency | Balances speed and shared-resource safety.                       |
| D3  | QA parallelization | Dependency-free Node runner | Add package; keep sequential                | Matches no-dependency constraint and reduces local wall-time.    |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-26T00:00:00.000Z |

### Residual Unknowns

None.
