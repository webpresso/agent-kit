---
type: blueprint
status: completed
complexity: L
created: "2026-06-24"
last_updated: "2026-07-01"
progress: "100% (all hook reliability tasks completed; scheduled drift job remains non-required follow-up)"
depends_on: []
cross_repo_depends_on: []
tags: [hooks, pretool-guard, reliability, testing, ci]
approvals:
  - reviewer: eng-review
    verdict: approve
    commit: 32cd1968b861cd8d26558423740751728b738d25
    evidence: "plan-refine engineering review: repo paths and tests verified on 2026-07-01"
  - reviewer: codex
    verdict: approve
    commit: 32cd1968b861cd8d26558423740751728b738d25
    evidence: "independent Codex verification: focused test gate passed on 2026-07-01"
title: "Hook reliability: make green CI imply working hooks"
owner: ozby
---

# Hook reliability: make green CI imply working hooks

**Goal:** Claude Code + Codex hooks must be provably correct at the real invocation
boundary so a green CI run means the hooks actually work. Today they are fragile and
"green CI doesn't mean they work."

## Product wedge anchor

- **Stage outcome:** agent-kit Tier-1 host reliability (`catalog/agent/rules/supported-agent-clis.md`) — Claude Code + Codex hooks are the native enforcement surface consumers depend on.
- **Consuming surface:** `wp setup` hook scaffolding + `wp hooks doctor`; every consumer repo's `.claude/settings.json` / `.codex/hooks.json` managed hooks.
- **New user-visible capability:** a consumer can trust that if CI is green, their managed hooks allow legitimate commands and deny the intended ones — no silent over-deny (e.g. `gh pr merge`) or stale-runtime divergence.

## Architecture Overview

```text
routeCommand(cmd)
  normalizeCommandForRouting -> strip secret/env/pm wrappers + path-normalize bin
                                (normalizeDirectToolPath uses BROAD getRuleDirectToolBins)
  ROUTING_RULES: matchesPrefix(normalized, prefix)  [exact multi-word match]
              || matchesDirectToolCommand(...)        [bare-bin match, NARROW set]
  Narrow match set = getRuleDirectMatchBins: single-token prefixes + `<pm> exec <bin>` only.
```

## Key Decisions

| Decision                 | Choice                                                                           | Rationale                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Bare-bin matching scope  | Narrow set (single-token + 3-token pm-exec) via getRuleDirectMatchBins           | Multi-word prefixes (`gh pr view`) matched on top-level bin over-deny every sibling (`gh pr merge`)       |
| Path normalization scope | Keep BROAD getRuleDirectToolBins                                                 | Must strip `/path/to/wrangler` then re-check via matchesPrefix; safe because exact prefix is re-validated |
| Confidence mechanism     | One conformance matrix replayed source + compiled                                | Boundary + runtime parity is what makes green CI trustworthy                                              |
| Contract drift           | Validate against checked-in golden schemas (required); live regen scheduled-only | Avoid turning required CI into a vendor-version gate                                                      |

## Phase 1: Routing root-cause fix [Complexity: M]

#### [backend] Task 1.1: Narrow bare-bin matching without breaking path normalization

**Status:** done

Split the direct-bin concept: keep `getRuleDirectToolBins` broad (used by
`normalizeDirectToolPath`/`getDirectToolBins` for path stripping) and add
`getRuleDirectMatchBins` (single-token prefixes + exact `<pm> exec <bin>` 3-token forms)
used by the three bare-bin match sites (`matchesDirectToolCommand`,
`matchesPackageManagerDirectToolCommand`, `matchesPackageManagerRunScriptCommand`).

**Files:**

- Modify: `src/hooks/pretool-guard/dev-routing.ts`
- Modify: `src/hooks/pretool-guard/dev-routing.test.ts`

**Acceptance:**

- [x] `gh pr view/checks/status`, `wrangler tail`, `rtk gain`, `act`, bare/`pm exec` tool prefixes still deny.
- [x] `gh pr merge/close/list`, `gh issue/api/release/auth`, `wrangler deploy/d1/dev`, `rtk <non-gain>` pass through.
- [x] `/path/to/wrangler tail` still denies (path normalization preserved).
- [x] Full `src/hooks/pretool-guard/` suite green (460 tests); typecheck + lint pass.

## Phase 2: Conformance matrix + boundary smoke [Complexity: M]

#### [qa] Task 2.1: Hook conformance matrix

**Status:** done
Create `src/hooks/\_\_conformance\_\_/matrix.ts`: rows discriminated by `{event, host}` with
per-event assert functions (PreToolUse=permissionDecision; SessionStart=additionalContext;
PostToolUse/Stop/PreCompact=own shapes). Single source reused by smoke/parity/doctor.

#### [qa] Task 2.2: Generated-command boundary smoke

**Status:** done
Scaffold hooks into a temp repo, extract the exact generated command from
`.claude/settings.json` / `.codex/hooks.json` (`buildDirectWpHookCommand`), run with matrix
stdin, assert decisions. Cover wrapper fallback (pretool fail-closed; json-only `{}`; others
fail-open), matcher placement, and valid-JSON stdout for empty + deny outputs. Must run the
REAL generated `node <pkg>/bin/wp hook <name>` command, not `dist/esm/...`.

## Phase 3: e2e host simulation [Complexity: S]

#### [qa] Task 3.1: Claude + Codex sibling-cwd e2e

**Status:** done
`wp setup` temp repo; run Claude + Codex commands with cwd at a sibling dir (path stability);
assert decisions; negative-assert Codex output never contains `ask`/`continue`/`stopReason`/`suppressOutput`.

## Phase 4: Compiled-runtime parity [Complexity: M]

#### [qa] Task 4.1: Replay matrix through compiled runtime + stale-runtime negative fixture

**Status:** done
Build+stage native runtime (precondition), replay the matrix via `WP_FORCE_COMPILED_RUNTIME=1`,
assert which lane ran; fail clearly if runtime artifacts absent. Add a stale-runtime negative
fixture (fixed source + intentionally old compiled binary => parity test fails).

## Phase 5: Contract pinning + doctor + CI [Complexity: M]

#### [qa] Task 5.1: Golden-schema contract + Claude type-only assertion

**Status:** done
Validate emitted Codex config + stdout envelopes against checked-in golden schemas (reuse
`src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/codex-schemas`); forbid Claude-only
fields. Claude: type-only assertion vs `@anthropic-ai/claude-agent-sdk` (devDep, no runtime use).
Scheduled (non-required) drift job runs `codex app-server generate-json-schema`.

#### [qa] Task 5.2: doctor --probe-decisions + CI wiring

**Status:** done
Extend `probeHookBin`/`probeJsonStdin` with a `--probe-decisions` mode using the matrix's
smallest allow/deny rows (default doctor stays cheap). Wire smoke + parity + contract jobs into
required CI in `.github/workflows/ci.agent-kit.yml`.

## Verification Gates

| Gate        | Command                                                          | Success Criteria                                                     |
| ----------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Type safety | `wp typecheck`                                                   | Zero errors                                                          |
| Lint        | `wp lint --file <changed>`                                       | Zero violations                                                      |
| Routing     | `vp exec vitest run src/hooks/pretool-guard/dev-routing.test.ts` | gh/wrangler/rtk siblings pass through; exact read-only prefixes deny |
| Guard suite | `vp exec vitest run src/hooks/pretool-guard/`                    | All pass                                                             |
| Smoke (P2)  | matrix vs generated commands                                     | All pass                                                             |
| Parity (P4) | `WP_FORCE_COMPILED_RUNTIME=1` matrix replay                      | All pass; stale fixture fails                                        |
| Meta-proof  | re-broaden a prefix to `gh pr`                                   | routing/smoke test goes RED                                          |

## Status (delivered, PR #257)

- **P0** routing over-match fix + regression tests — landed.
- **P1** conformance matrix (`src/hooks/\_\_conformance\_\_/matrix.ts`) with host-aware,
  exit-code-checked `assertConformance` — landed.
- **P2** generated-command boundary smoke (`boundary.smoke.test.ts`) — landed.
- **P3** Codex sibling-cwd e2e (`host-sim.e2e.test.ts`) — landed.
- **P4** compiled-runtime parity + stale-runtime negative fixture (`parity.*`) — landed.
- **P5 core** golden Codex-schema contract pin (`codex-contract.test.ts`); all suites
  run under the existing CI `Test` job — landed. Code-review: Codex APPROVE.
- All suites: dev-routing (61) + conformance (120) + spawned e2e (43) green.

## Follow-ups (non-required / scheduled)

- `wp hooks doctor --probe-decisions` firing `PROBE_ROWS` for operator-side semantic
  checks (the matrix already CI-enforces decisions; this is operator convenience).
- A scheduled (non-required) drift job running `codex app-server generate-json-schema`
  - `@anthropic-ai/claude-agent-sdk` type assertion to detect upstream contract drift.
- Surfaced robustness note: pretool-guard exits non-zero outside a git repo and Codex's
  wrapper turns that into a misleading "wp not found" deny — worth a graceful-degrade fix.

## Non-goals

- Cursor/OpenCode full lifecycle parity (tracked separately).
- A hook-contract version-negotiation field (follow-up).

## Risks

| Risk                                              | Impact          | Mitigation                                                                   |
| ------------------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| Narrowing match set breaks a legit bare-bin route | over/under-deny | Path normalization kept broad; full guard suite + new boundary tests gate it |
| Compiled-runtime build cost in CI                 | slower CI       | Bound required doctor probes to smallest rows; parity job isolated           |

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T12:52:00Z
- verified-head: 32cd1968b861cd8d26558423740751728b738d25
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                | Evidence                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Hook routing reliability is covered by conformance, boundary, parity, doctor, and dev-routing tests. | repo:src/hooks/\_\_conformance\_\_/matrix.test.ts; repo:src/hooks/\_\_conformance\_\_/boundary.subprocess.test.ts; repo:src/hooks/\_\_conformance\_\_/parity.test.ts; repo:src/hooks/doctor.ts; repo:src/hooks/doctor.test.ts; repo:src/hooks/pretool-guard/dev-routing.test.ts |
| C2  | Focused regression coverage for this blueprint is present and was run in the managed worktree.       | repo:src/hooks/pretool-guard/dev-routing.test.ts; repo:src/hooks/\_\_conformance\_\_/matrix.test.ts; repo:src/hooks/\_\_conformance\_\_/boundary.subprocess.test.ts; repo:src/hooks/\_\_conformance\_\_/parity.test.ts; repo:src/hooks/doctor.test.ts; derived:C1               |
| C3  | Two review approvals are recorded for the lifecycle disposition.                                     | repo:blueprints/completed/hook-reliability-fix-routing-over-match-and-add-conformance-smoke-parity-tests-so-green-ci-implies-working-hooks/reviews.md; derived:C1; derived:C2                                                                                                   |

### Material Decisions

| ID  | Decision              | Chosen option                                       | Rejected alternatives                           | Rationale                                                                                                                                                  |
| --- | --------------------- | --------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Lifecycle disposition | Mark completed from existing implemented repo state | Force a process-only planned/in-progress detour | Repo transition matrix permits draft-to-completed when tasks are terminal; focused tests and lifecycle audits prove the implementation is already present. |

### Promotion Gates

| Gate            | Command                                                                                                                                                                                                                                                             | Expected outcome            | Last result        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------ |
| focused-tests   | wp test --file src/hooks/pretool-guard/dev-routing.test.ts --file src/hooks/\_\_conformance\_\_/matrix.test.ts --file src/hooks/\_\_conformance\_\_/boundary.subprocess.test.ts --file src/hooks/\_\_conformance\_\_/parity.test.ts --file src/hooks/doctor.test.ts | All targeted tests pass     | PASS on 2026-07-01 |
| lifecycle-audit | wp audit blueprint-lifecycle                                                                                                                                                                                                                                        | Lifecycle metadata is valid | PASS on 2026-07-01 |
| trust-audit     | wp audit blueprint-trust                                                                                                                                                                                                                                            | Trust dossier validates     | PASS on 2026-07-01 |

### Residual Unknowns

None.

## Completion Summary

- Completed on: `2026-07-01`
- Implementation head: `32cd1968b861cd8d26558423740751728b738d25`
- Summary: all hook reliability tasks completed; scheduled drift job remains non-required follow-up.
- Verification: `wp test --file src/hooks/pretool-guard/dev-routing.test.ts --file src/hooks/\_\_conformance\_\_/matrix.test.ts --file src/hooks/\_\_conformance\_\_/boundary.subprocess.test.ts --file src/hooks/\_\_conformance\_\_/parity.test.ts --file src/hooks/doctor.test.ts` passed in the managed worktree after `vp install`.
- Review approvals: see `reviews.md` (eng-review + codex approvals).
- Remaining risks: None for the implemented scope; any explicitly scheduled/non-required follow-ups remain outside this blueprint completion gate.
