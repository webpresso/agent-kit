---
type: blueprint
title: "Codify wp test summary-first default with full opt-out"
owner: ozby
status: parked
complexity: S
created: '2026-06-11'
last_updated: '2026-06-15'
progress: "Implemented in PR #139; parked for legal lifecycle transition from planned pending finalization"
tags:
  - cli
  - test
  - quality
  - output
---

# Codify `wp test` summary-first default with full opt-out

## Implementation Update (2026-06-15)

Implemented in PR #139 on branch `work/ultragoal-9-blueprints-20260614221933`.
Task status and acceptance checkboxes below were reconciled from the landed code paths and focused verification evidence in this PR. The file is parked because CI enforces the legal first transition from `planned`; finalization can move parked/resumed work through the lifecycle after merge.


## Planning Summary

The original draft assumed `wp test` still needed to be changed to default to a
summary-first CLI view with a full-output escape hatch. Repo inspection shows
that behavior already exists and is implemented at the shared quality command
layer, not uniquely inside `wp test`.

This blueprint therefore does **not** introduce a new default-output feature.
It hardens, documents, and verifies the existing contract so the user-facing
behavior is intentional, stable, and clearly owned. (F1-F8)

## Fact-Check Summary

| ID | Severity | Claim checked | Repo evidence | Planning consequence |
| -- | -------- | ------------- | ------------- | -------------------- |
| F1 | HIGH | `wp test` already exposes a full-output opt-out flag. | `src/cli/commands/test.ts` registers `--full` with help text “Print the full raw output instead of the default summary-first view”. | Do not plan a net-new flag or default flip. |
| F2 | HIGH | Summary-first rendering is shared infra, not `wp test`-local logic. | `src/cli/commands/quality-runner.ts` implements `emitCliCommandOutput(...)` and returns raw logs only when `full` or `rawMode` is set. | Put owner-side hardening at the shared quality-runner boundary. |
| F3 | HIGH | Shared behavior already has baseline tests. | `src/cli/commands/quality-runner.test.ts` verifies summary-first default and raw output with `--full`. | Strengthen exact raw-only assertions instead of duplicating the whole renderer in command tests. |
| F4 | MEDIUM | `wp test` command tests only verify flag exposure, not end-to-end output behavior. | `src/cli/commands/test.test.ts` currently checks that `--full` exists but does not assert its help wording or command-action passthrough semantics. | Add targeted command-layer tests so `wp test` explicitly owns its contract too. |
| F5 | MEDIUM | Other quality commands use the same summary-first contract. | `src/cli/commands/audit.ts`, `format.ts`, `lint.ts`, `qa.ts`, `typecheck.ts`, and `e2e.ts` also expose the same `--full` help text and pass `full: Boolean(flags.full)` to the shared renderer. | Keep this blueprint narrowly about `wp test`; do not fragment the shared CLI contract. |
| F6 | MEDIUM | Current test helper cannot inspect option descriptions or execute the registered action. | `buildFakeCli()` in `src/cli/commands/test.test.ts` records only option names and discards the action callback. | First harden the test harness, then add `wp test` contract assertions. |
| F7 | MEDIUM | The shared full-mode test allows extra raw-output text as long as it omits the log hint. | `quality-runner.test.ts` checks `fullWrites` contains the raw TypeScript line and omits `Full log: ...`, but does not assert equality with the persisted log content. | Add an exact raw-only assertion so summary text, transformed snippets, and hints cannot leak into full mode. |
| F8 | LOW | Repo command examples in recent blueprints use `./bin/wp ...` for focused gates. | Planned blueprints such as `2026-06-13-multi-host-plugin-and-instruction-surface-expansion.md` use repeated `--file` flags with `./bin/wp test`. | Use repo-local `./bin/wp` commands in task steps and verification gates. |

## Scope

### In scope

- Make the `wp test` summary-first contract explicit in command tests and help
  assertions. (F1, F4, F6)
- Tighten owner-side tests around the shared `quality-runner` output path and
  `wp test` command wiring. (F2, F3, F7)
- Verify `--full` remains the complete opt-out for raw log output. (F1, F7)

### Out of scope

- Changing the default output mode for other commands. (F5)
- Introducing a second opt-out flag or deprecating `--full`. (F1)
- Reworking log persistence, transform strategy, or `wp logs` UX. (F2)
- Editing generated agent surfaces or release/package metadata.

## Technology Choices

| Surface | Current choice | Refinement decision | Evidence / fix tag |
| ------- | -------------- | ------------------- | ------------------ |
| Command runner | `runCliCommandSequence(...)` plus `emitCliCommandOutput(...)` in `quality-runner.ts` | Preserve shared ownership; do not move rendering policy into `test.ts`. | F2, F5 |
| Raw-output opt-out | `--full` flag passed as `full: Boolean(flags.full)` | Keep as the only full raw-output opt-out for `wp test`. | F1 |
| Test command | `./bin/wp test --file ...` | Use repeated `--file` flags for focused test slices. | F8 |
| Testability | Existing fake CAC chain in `test.test.ts` | Extend locally to capture option metadata/action instead of adding broad abstractions. | F6 |

## Key Decisions

| Decision | Rationale | Consequence |
| -------- | --------- | ----------- |
| Preserve behavior and add tests before production edits. | The repo already has the desired default and opt-out behavior. | Most work should be test hardening; production source changes are allowed only for a minimal command-action testability seam or help wording correction. |
| Keep rendering semantics in `quality-runner.ts`. | Other quality commands share the same output contract. | `test.ts` must not duplicate summary rendering or log hint logic. |
| Treat README/package docs as out of scope unless a test exposes stale public wording. | Public docs are package-surface material and add release-safety scope. | If docs are touched anyway, add package-surface/secret checks before completion. |

## Architecture Notes

- `wp test` should continue to delegate rendering policy to
  `src/cli/commands/quality-runner.ts`.
- Command-local code in `src/cli/commands/test.ts` should only declare the CLI
  contract, build the test command, and pass `full: Boolean(flags.full)` into
  the shared renderer.
- Help text, tests, and any touched docs should all describe the same contract:
  default output is concise summary-first; raw persisted output is available
  through `--full` and recent logs remain available through `wp logs`.
- Engineering-principles gate: do not add new config, flags, render adapters, or
  dependency seams; prefer a small local test harness enhancement. (F6)

## Edge Cases

| ID | Severity | Edge case | Mitigation |
| -- | -------- | --------- | ---------- |
| E1 | HIGH | `--full` prints raw log content plus summary-first text or `Full log: ...`, making the opt-out incomplete. | Task 1.2 asserts full-mode output equals the persisted raw log. (F7) |
| E2 | HIGH | A future refactor drops or inverts `flags.full`, so `wp test --full` still emits summary-first output. | Task 2.1 adds a command-level regression test around action wiring. (F4, F6) |
| E3 | MEDIUM | Command tests assert only option presence while help wording drifts away from the shared contract. | Task 1.1 captures option descriptions and asserts summary-first/raw wording. (F1, F6) |
| E4 | MEDIUM | `wp test` introduces command-local rendering logic that diverges from `lint`, `typecheck`, `qa`, and `e2e`. | Acceptance criteria prohibit duplicate rendering logic in `test.ts`. (F2, F5) |
| E5 | MEDIUM | Public docs are edited with local-path or package-surface leaks. | Keep docs out of scope by default; if touched, run package-surface/secret gates. |

## Risks

| ID | Severity | Risk | Mitigation |
| -- | -------- | ---- | ---------- |
| R1 | HIGH | Tests overfit implementation internals rather than the user-visible `--full` behavior. | Prefer action-level or output-level assertions; keep helper seams minimal and named around command behavior. |
| R2 | HIGH | Shared quality-runner changes unintentionally alter other quality commands. | Task 1.2 is shared-runner-only; final verification includes focused runner tests and `./bin/wp typecheck`. |
| R3 | MEDIUM | Parallel agents contend for `test.test.ts` or `quality-runner.test.ts`. | Execution waves serialize same-file edits; Wave 0 tasks touch separate files. |
| R4 | MEDIUM | Scope expands into docs/package surfaces. | Treat docs as conditional; if touched, add `./bin/wp audit package-surface` and secret/path checks before completion. |

## Cross-Plan References

- No blocking upstream dependency was found for this blueprint.
- Related but non-blocking: `blueprints/planned/2026-06-13-multi-host-plugin-and-instruction-surface-expansion.md` also uses summary-first as a quality/status-output contract. Avoid changes that weaken the shared summary-first semantics relied on by that plan.
- Cross-plan conflict check: none found. This plan touches `src/cli/commands/test.ts`, `src/cli/commands/test.test.ts`, and `src/cli/commands/quality-runner.test.ts`; no other inspected planned blueprint declares those exact files as primary task targets.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents | XS |
| **Wave 1** | 2.1 | Task 1.1 | 1 agent | S |
| **Wave 2** | 3.1, 3.2 | Tasks 1.2, 2.1 | 2 agents | XS-S |
| **Wave 3** | 3.3 | Tasks 3.1, 3.2 | 1 agent | XS |
| **Critical path** | 1.1 → 2.1 → 3.1 → 3.3 | — | 4 waves | S |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 2 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 6 / 4 = 1.5 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 6 / 6 = 1.0 |
| CP | same-file overlaps per wave | 0 | 0 |

**Parallelization score:** C. This is an intentionally small S-sized hardening
plan; task splitting improved same-wave file conflict pressure to zero, but the
critical path remains narrow because command wiring must follow command test
harness work. Do not split further unless new implementation scope appears.

## Phases

### Phase 1: Encode existing contracts in tests [Complexity: XS]

#### [test] Task 1.1: Assert `wp test --full` help and option metadata

**Status:** done

**Depends:** None

Harden `src/cli/commands/test.test.ts` so it proves the command advertises the
existing summary-first default and raw-output opt-out, not just that an option
named `--full` exists. Extend the local fake CAC chain only as much as needed to
capture option descriptions and the registered action callback for later tasks;
do not add production abstractions for hypothetical commands. (F1, F4, F6)

**Files:**

- Modify: `src/cli/commands/test.test.ts`

**Steps (TDD):**

1. Write a failing test that registers `wp test` with the fake CLI and asserts the `--full` option description contains both “full raw output” and “summary-first view”.
2. Run: `./bin/wp test --file src/cli/commands/test.test.ts` — verify FAIL.
3. Update the test helper to retain option metadata; change production help text only if the current wording fails the contract.
4. Run: `./bin/wp test --file src/cli/commands/test.test.ts` — verify PASS.
5. Refactor only the local fake CLI helper if needed; keep complexity low and avoid shared test utilities.
6. Run: `./bin/wp typecheck`.

**Acceptance:**

- [x] `test.test.ts` asserts the `--full` help text describes raw output and the summary-first default.
- [x] The fake CLI captures option metadata without introducing a repo-wide helper or production-only seam.
- [x] No rendering logic is introduced into `test.ts`.
- [x] `./bin/wp test --file src/cli/commands/test.test.ts` passes.

#### [test] Task 1.2: Assert full mode is exactly raw output in the shared runner

**Status:** done

**Depends:** None

Strengthen `quality-runner.test.ts` so `emitCliCommandOutput({ full: true })`
proves a complete opt-out from summary rendering. The full-mode output should
match the persisted raw log content exactly; summary lines, transformed failure
snippets, and `Full log: wp logs ...` hints must not be appended. (F2, F3, F7)

**Files:**

- Modify: `src/cli/commands/quality-runner.test.ts`

**Steps (TDD):**

1. Tighten the existing full-mode test to compare `fullWrites.join('')` with `readText(result.entry.logPath)` and to reject the summary string.
2. Run: `./bin/wp test --file src/cli/commands/quality-runner.test.ts` — verify FAIL if the current assertion is not yet exact.
3. Update only the test or the minimal shared-runner behavior needed to make full mode raw-only; do not change default summary-first rendering.
4. Run: `./bin/wp test --file src/cli/commands/quality-runner.test.ts` — verify PASS.
5. Refactor test naming to make the default-vs-full contract clear.
6. Run: `./bin/wp typecheck`.

**Acceptance:**

- [x] Full mode output equals the persisted raw log content exactly.
- [x] Full mode output does not include the summary string, transformed snippets beyond the raw log, or `Full log: wp logs ...`.
- [x] Default mode still emits summary-first output and a log hint on failure.
- [x] `./bin/wp test --file src/cli/commands/quality-runner.test.ts` passes.

### Phase 2: Prove `wp test` action wiring [Complexity: S]

#### [cli] Task 2.1: Add a command-level regression test for `full: Boolean(flags.full)`

**Status:** done

**Depends:** Task 1.1

Add a targeted `wp test` command test that fails if the registered action drops,
inverts, or bypasses `flags.full` before calling `emitCliCommandOutput`. Prefer a
small test harness enhancement that invokes the captured action with mocked
quality-runner functions. If Vitest module mocking makes that impractical with
the current static imports, extract the smallest command-local helper from
`test.ts` that can be tested directly; do not duplicate renderer behavior or add
new public API. (F2, F4, F6)

**Files:**

- Modify: `src/cli/commands/test.ts`
- Modify: `src/cli/commands/test.test.ts`

**Steps (TDD):**

1. Write a failing regression test that exercises the command action with `flags.full` false and true and observes the `full` value sent to `emitCliCommandOutput`.
2. Run: `./bin/wp test --file src/cli/commands/test.test.ts` — verify FAIL.
3. Implement the smallest testability change needed, preserving `full: Boolean(flags.full)` and existing command-building behavior.
4. Run: `./bin/wp test --file src/cli/commands/test.test.ts` — verify PASS.
5. Refactor only to remove duplication introduced by the testability change; do not add new flags, config, or renderer wrappers.
6. Run: `./bin/wp typecheck`.

**Acceptance:**

- [x] A regression that removes, flips, or hardcodes the `full` value fails `test.test.ts`.
- [x] `test.ts` still delegates output rendering to `emitCliCommandOutput`.
- [x] No new `as any`, non-null assertions, or broad mock-bypass seams are introduced.
- [x] `./bin/wp test --file src/cli/commands/test.test.ts` passes.

### Phase 3: Verify the hardened contract [Complexity: XS]

#### [verify] Task 3.1: Run the focused output-contract test slice

**Status:** done

**Depends:** Tasks 1.2, 2.1

Run the narrowest test slice that proves the command contract and shared runner
semantics. This task is verification-only and should not edit source files.

**Files:**

- Verify only

**Steps (TDD):**

1. Confirm Tasks 1.1, 1.2, and 2.1 are complete.
2. Run: `./bin/wp test --file src/cli/commands/test.test.ts --file src/cli/commands/quality-runner.test.ts`.
3. If the command fails, capture the failing assertion and route the fix back to the owning implementation task instead of patching here.
4. Re-run the same command after the owning task fixes the issue.
5. Record the passing command in the blueprint task log.
6. Do not modify files in this verification task.

**Acceptance:**

- [x] `./bin/wp test --file src/cli/commands/test.test.ts --file src/cli/commands/quality-runner.test.ts` passes.
- [x] Failures, if any, are assigned back to Task 1.2 or 2.1 with evidence.
- [x] No source files are changed by this task.

#### [verify] Task 3.2: Run typecheck and lint gates for the touched sources

**Status:** done

**Depends:** Tasks 1.2, 2.1

Run repository quality gates that catch type or lint fallout from the test
harness and any minimal command-source changes. This task is verification-only
and can run in parallel with Task 3.1 after implementation tasks finish.

**Files:**

- Verify only

**Steps (TDD):**

1. Confirm implementation edits are limited to the files listed in Tasks 1.1, 1.2, and 2.1.
2. Run: `./bin/wp typecheck`.
3. Run: `./bin/wp lint`.
4. If either gate fails, capture the failure and route the fix back to the task that touched the failing file.
5. Re-run the failed gate after the owning task fixes the issue.
6. Do not raise timeouts or add checked-in skips to make gates pass.

**Acceptance:**

- [x] `./bin/wp typecheck` passes.
- [x] `./bin/wp lint` passes.
- [x] No timeout bumps, checked-in skips, or unrelated cleanup are introduced.

#### [verify] Task 3.3: Complete final scoped QA and package-safety check if needed

**Status:** done

**Depends:** Tasks 3.1, 3.2

Run the final scoped QA appropriate to the actual files changed. If execution
stayed within `src/cli/commands/test.ts`, `test.test.ts`, and
`quality-runner.test.ts`, focused tests plus typecheck/lint are sufficient. If
README, docs, `package.json`, `files`, `bin`, `exports`, catalog assets, or
release workflows were touched, add public package-safety checks before marking
complete. (R4)

**Files:**

- Verify only

**Steps (TDD):**

1. Inspect `git diff --name-only` and confirm whether any public package-surface files were touched.
2. If only the scoped CLI/test files changed, run: `./bin/wp test --file src/cli/commands/test.test.ts --file src/cli/commands/quality-runner.test.ts`.
3. If public docs/package surfaces changed, additionally run: `./bin/wp audit package-surface` and the repo secret/path guardrail available in the current branch.
4. Optionally run `./bin/wp qa` before merge if the branch carries other quality-runner changes or maintainers require the full gate.
5. Record all commands and outcomes in the blueprint before finalization.
6. Stop if package-surface or secret/path checks find publishable leaks; fix the package surface rather than documenting the leak as acceptable.

**Acceptance:**

- [x] Final focused test command passes.
- [x] Public package-safety checks pass if any docs/package surfaces were touched.
- [x] `./bin/wp qa` is run or explicitly deferred with rationale.
- [x] Verification evidence is recorded before the blueprint is finalized.

## Verification Matrix

| Gate | Command | Required when | Expected result |
| ---- | ------- | ------------- | --------------- |
| Command tests | `./bin/wp test --file src/cli/commands/test.test.ts` | Tasks 1.1 and 2.1 | Pass |
| Shared runner tests | `./bin/wp test --file src/cli/commands/quality-runner.test.ts` | Task 1.2 | Pass |
| Focused output contract | `./bin/wp test --file src/cli/commands/test.test.ts --file src/cli/commands/quality-runner.test.ts` | Task 3.1 and final verification | Pass |
| Typecheck | `./bin/wp typecheck` | Any source/test edit | Pass |
| Lint | `./bin/wp lint` | Any source/test edit | Pass |
| Package surface | `./bin/wp audit package-surface` | Only if docs/package/public surfaces are touched | Pass with no leaks |
| Full QA | `./bin/wp qa` | Before merge if maintainers require full gate or shared runner behavior changed beyond tests | Pass or documented blocker |

## Merge Criteria

Do not mark this blueprint complete until:

- `wp test` still defaults to summary-first output.
- `--full` remains the documented and tested raw-output opt-out.
- Shared owner tests and `wp test` command tests both cover the contract.
- Same-wave file conflict pressure remains zero.
- Verification passes on the focused repo gates, with full QA or package-safety
  gates added if the final diff requires them.
