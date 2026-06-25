---
type: blueprint
status: draft
complexity: L
created: "2026-06-24"
last_updated: "2026-06-24"
progress: "90% (P0-P5 landed; doctor-probe + live-drift job are follow-ups)"
depends_on: []
cross_repo_depends_on: []
tags: [hooks, pretool-guard, reliability, testing, ci]
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

**Status:** todo
Create `src/hooks/__conformance__/matrix.ts`: rows discriminated by `{event, host}` with
per-event assert functions (PreToolUse=permissionDecision; SessionStart=additionalContext;
PostToolUse/Stop/PreCompact=own shapes). Single source reused by smoke/parity/doctor.

#### [qa] Task 2.2: Generated-command boundary smoke

**Status:** todo
Scaffold hooks into a temp repo, extract the exact generated command from
`.claude/settings.json` / `.codex/hooks.json` (`buildDirectWpHookCommand`), run with matrix
stdin, assert decisions. Cover wrapper fallback (pretool fail-closed; json-only `{}`; others
fail-open), matcher placement, and valid-JSON stdout for empty + deny outputs. Must run the
REAL generated `node <pkg>/bin/wp hook <name>` command, not `dist/esm/...`.

## Phase 3: e2e host simulation [Complexity: S]

#### [qa] Task 3.1: Claude + Codex sibling-cwd e2e

**Status:** todo
`wp setup` temp repo; run Claude + Codex commands with cwd at a sibling dir (path stability);
assert decisions; negative-assert Codex output never contains `ask`/`continue`/`stopReason`/`suppressOutput`.

## Phase 4: Compiled-runtime parity [Complexity: M]

#### [qa] Task 4.1: Replay matrix through compiled runtime + stale-runtime negative fixture

**Status:** todo
Build+stage native runtime (precondition), replay the matrix via `WP_FORCE_COMPILED_RUNTIME=1`,
assert which lane ran; fail clearly if runtime artifacts absent. Add a stale-runtime negative
fixture (fixed source + intentionally old compiled binary => parity test fails).

## Phase 5: Contract pinning + doctor + CI [Complexity: M]

#### [qa] Task 5.1: Golden-schema contract + Claude type-only assertion

**Status:** todo
Validate emitted Codex config + stdout envelopes against checked-in golden schemas (reuse
`src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/codex-schemas`); forbid Claude-only
fields. Claude: type-only assertion vs `@anthropic-ai/claude-agent-sdk` (devDep, no runtime use).
Scheduled (non-required) drift job runs `codex app-server generate-json-schema`.

#### [qa] Task 5.2: doctor --probe-decisions + CI wiring

**Status:** todo
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
- **P1** conformance matrix (`src/hooks/__conformance__/matrix.ts`) with host-aware,
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

Draft note: complete before promotion to planned/completed.

### Readiness Verdict

- promotion-ready: false
- unresolved-count: 4
- verified-at: <ISO-8601 timestamp>
- verified-head: <full git commit SHA>
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                    | Evidence                                                                                  |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| C1  | P0 fixes gh/wrangler/rtk over-deny without regressing path normalization | dev-routing.test.ts (61) + pretool-guard suite (460) green; source-guard behavioral check |

### Material Decisions

| ID  | Decision        | Chosen option                         | Rejected alternatives         | Rationale                                               |
| --- | --------------- | ------------------------------------- | ----------------------------- | ------------------------------------------------------- |
| D1  | Match-set scope | Narrow match set, broad path-norm set | Drop multi-word bins entirely | Dropping broke `/path/wrangler tail` path normalization |

### Promotion Gates

| Gate        | Command                                     | Expected outcome | Last result |
| ----------- | ------------------------------------------- | ---------------- | ----------- |
| Guard suite | vp exec vitest run src/hooks/pretool-guard/ | all pass         | 460 passed  |

### Residual Unknowns

Complete P2-P5 and trust dossier before promotion.
