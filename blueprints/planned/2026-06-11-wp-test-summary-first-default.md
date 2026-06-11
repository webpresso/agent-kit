---
type: blueprint
title: "Codify wp test summary-first default with full opt-out"
owner: ozby
status: planned
complexity: S
created: '2026-06-11'
last_updated: '2026-06-11'
progress: '0% (0/6 tasks done, 0 blocked, updated 2026-06-11)'
tags:
  - cli
  - test
  - quality
  - output
---

# Codify `wp test` summary-first default with full opt-out

## Planning Summary

The original draft assumed `wp test` still needed to be changed to default to a
summary-first CLI view with a full-output escape hatch. Repo inspection shows
that behavior already exists today and is implemented at the shared quality
command layer, not uniquely inside `wp test`.

This blueprint therefore does **not** introduce a new default-output feature.
It hardens, documents, and verifies the existing contract so the user-facing
behavior is intentional, stable, and clearly owned.

## Fact-Check Summary

| ID | Severity | Claim checked | Repo evidence | Planning consequence |
| -- | -------- | ------------- | ------------- | -------------------- |
| F1 | HIGH | `wp test` already exposes a full-output opt-out flag. | `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/test.ts` defines `--full` with help text “Print the full raw output instead of the default summary-first view”. | Do not plan a net-new flag or default flip. |
| F2 | HIGH | Summary-first rendering is shared infra, not `wp test`-local logic. | `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/quality-runner.ts` implements `emitCliCommandOutput(...)` and returns raw logs only when `full` or `rawMode` is set. | Put owner-side hardening at the shared quality-runner boundary. |
| F3 | HIGH | Shared behavior already has baseline tests. | `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/quality-runner.test.ts` verifies summary-first default and raw output with `--full`. | Add missing `wp test`-specific contract coverage instead of duplicating broad infra tests. |
| F4 | MEDIUM | `wp test` command tests only verify flag exposure, not end-to-end output behavior. | `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/test.test.ts` checks that `--full` exists but does not assert rendered default-vs-full output semantics. | Add targeted command-layer tests so `wp test` explicitly owns its contract too. |
| F5 | MEDIUM | Other quality commands use the same summary-first contract. | `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/audit.ts`, `format.ts`, `lint.ts`, `qa.ts`, `typecheck.ts`, and `e2e.ts` also expose the same `--full` help text. | Keep the blueprint narrowly about `wp test`, but avoid changes that fragment the shared CLI contract. |

## Scope

### In scope
- Make the `wp test` summary-first contract explicit in docs/help/tests.
- Tighten owner-side tests around the shared `quality-runner` output path and
  `wp test` command wiring.
- Verify `--full` remains the complete opt-out for raw log output.

### Out of scope
- Changing the default output mode for other commands.
- Introducing a second opt-out flag or deprecating `--full`.
- Reworking log persistence, transform strategy, or `wp logs` UX.

## Architecture Notes

- `wp test` should continue to delegate rendering policy to
  `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/quality-runner.ts`.
- Command-local code in
  `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/test.ts` should only
  declare the CLI contract and pass `full: Boolean(flags.full)` into the shared
  renderer.
- Help text, tests, and docs should all describe the same contract: default
  output is concise summary-first; raw persisted output is available through
  `--full` and `wp logs`.

## Quick Reference

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| 0 | 1.1, 1.2 | None | Yes | XS-S |
| 1 | 2.1, 2.2 | 1.1, 1.2 | Yes | S |
| 2 | 3.1, 3.2 | 2.1, 2.2 | Yes | XS-S |

## Phases

### Phase 1: Align the contract [Complexity: XS]

#### [docs] Task 1.1: Document the existing behavior accurately

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/test.ts`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/quality-runner.ts`
- **Change:** Tighten inline comments and help/description text so the owner
  boundary is explicit: default output is summary-first, `--full` is the raw
  output escape hatch, and persisted logs remain available through `wp logs`.
- **Verify:** `wp test --file /Users/ozby/repos/webpresso/agent-kit/src/cli/commands/test.test.ts`
- **Acceptance:**
  - [ ] Help text and code comments agree on the summary-first contract.
  - [ ] No duplicate rendering logic is introduced into `test.ts`.

#### [docs] Task 1.2: Record the CLI contract in tests

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/test.test.ts`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/quality-runner.test.ts`
- **Change:** Expand tests so `wp test` owns its user-facing contract, while the
  shared runner continues to own render semantics.
- **Verify:** `wp test --file /Users/ozby/repos/webpresso/agent-kit/src/cli/commands/test.test.ts --file /Users/ozby/repos/webpresso/agent-kit/src/cli/commands/quality-runner.test.ts`
- **Acceptance:**
  - [ ] `test.test.ts` asserts more than mere flag presence.
  - [ ] `quality-runner.test.ts` still proves default summary-first vs `--full` raw output.

### Phase 2: Harden command behavior [Complexity: S]

#### [cli] Task 2.1: Verify `wp test` passes the flag through correctly

- [ ] **Status:** todo
- **Depends:** Task 1.2
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/test.ts`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/test.test.ts`
- **Change:** Add a targeted assertion that the command wiring passes
  `full: Boolean(flags.full)` into the shared renderer and does not invert or
  bypass the option during future refactors.
- **Verify:** `wp test --file /Users/ozby/repos/webpresso/agent-kit/src/cli/commands/test.test.ts`
- **Acceptance:**
  - [ ] A regression that drops or flips `flags.full` fails the command test.
  - [ ] No new `as any`, non-null assertions, or mock-bypass seams are introduced.

#### [cli] Task 2.2: Prove raw output remains a complete opt-out

- [ ] **Status:** todo
- **Depends:** Task 1.2
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/quality-runner.test.ts`
- **Change:** Add or strengthen a test that confirms `--full` bypasses summary
  rendering and `Full log: wp logs ...` hints, emitting the persisted raw output
  directly.
- **Verify:** `wp test --file /Users/ozby/repos/webpresso/agent-kit/src/cli/commands/quality-runner.test.ts`
- **Acceptance:**
  - [ ] Full mode prints raw output only.
  - [ ] Summary-only affordances do not leak into full mode.

### Phase 3: Lock the contract with repo verification [Complexity: XS]

#### [verify] Task 3.1: Run targeted CLI command verification

- [ ] **Status:** todo
- **Depends:** Tasks 2.1, 2.2
- **Files:**
  - Verify only
- **Change:** Run the narrowest test slice covering the command contract.
- **Verify:** `wp test --file /Users/ozby/repos/webpresso/agent-kit/src/cli/commands/test.test.ts --file /Users/ozby/repos/webpresso/agent-kit/src/cli/commands/quality-runner.test.ts`
- **Acceptance:**
  - [ ] Both files pass.
  - [ ] Failures point at the owner boundary, not callers.

#### [verify] Task 3.2: Reconfirm repo gates after any implementation edits

- [ ] **Status:** todo
- **Depends:** Task 3.1
- **Files:**
  - Verify only
- **Change:** Re-run the relevant repo gates for touched sources.
- **Verify:** `wp typecheck`; `wp qa`
- **Acceptance:**
  - [ ] Typecheck passes.
  - [ ] QA remains green without timeout bumps or checked-in skips.

## Merge Criteria

Do not mark this blueprint complete until:
- `wp test` still defaults to summary-first output.
- `--full` remains the documented and tested raw-output opt-out.
- Shared owner tests and `wp test` command tests both cover the contract.
- Verification passes on the real repo gates.
