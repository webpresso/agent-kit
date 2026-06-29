---
type: blueprint
title: Diagnose and fix wp_blueprint_promote gate failures (discovery-first)
status: completed
complexity: S
owner: ozby
created: "2026-06-28"
last_updated: "2026-06-28"
progress: "100% (3/3 tasks done, 0 blocked, updated 2026-06-28)"
tags:
  - blueprint-tooling
  - mcp
  - reliability
  - diagnostics
---

# Diagnose and fix wp_blueprint_promote gate failures (discovery-first)

## Product wedge anchor

- **Stage outcome:** Promotion gates are trustworthy: a gate either passes for a real reason or reports exactly why it failed, so draft->planned is not blocked by tooling artifacts.
- **Consuming surface:** The wp_blueprint_promote MCP tool's gate-evaluation path in src/mcp/blueprint-server.ts.
- **New user-visible capability:** When a promotion gate fails, the agent sees the real cause (exit code / stderr / log path) instead of an empty failure string.

## Summary

`wp_blueprint_promote` blocked a promotion with `Promotion gate failed (wp test --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts): ` and an **empty message**, even though that exact command **passes standalone** (exit 0). The diagnostics are unusable: no exit code, no stderr, no log path.

### Codex REWORK note (folded in)

A read of `handlePromote` found `applyPromotionTrustGate` plus a local lifecycle transition, with **no obviously visible subprocess gate runner** in the cited function (codex's repo scans also timed out, so this is not conclusive). The empty `Promotion gate failed (<the wp test command>)` string is empirical proof that SOMETHING evaluates/executes the gate command, but the exact mechanism is unconfirmed. Therefore this blueprint is **discovery-first**: do not prescribe a launcher/path-stability fix until Task 1.1 identifies the real failing path. The path-stability hypothesis (shared root with the flaky-pretool-guard blueprint) is a candidate, not a conclusion.

### Likely-but-unconfirmed hypotheses (to test in 1.1)

- The gate command is executed in a subprocess that inherits a sanitized PATH / the vite-plus node shim (same root as fix-flaky-pretool-guard), so a heavy `wp test` fails to launch or times out.
- The gate command is parsed/validated and a non-launch failure is mis-rendered as an empty string.
- A budget/timeout fires and the cause is discarded.

### Fix (contingent on 1.1)

Whatever the mechanism: (a) always surface exit code + bounded stderr/stdout tail + a log path (never an empty reason); (b) if a subprocess launch is involved, make it path-stable (reuse the launcher resolver from fix-flaky-pretool-guard if it exists) with a usable PATH; (c) bound with an explicit, documented timeout that reports a timeout cause (per no-timeout-as-fix: bound + report, do not silently raise).

### Relationship

The diagnostics half (b/a) is independent and can land first. Any launcher fix should reuse, not duplicate, the resolver from fix-flaky-pretool-guard-in-agent-kit-source-repo-via-path-stable-bun-hook-launch (planned).

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-27T23:09:06.451Z
- verified-head: 2b83330804972998d3d680cfb9c1210b35031742
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                                                      | Evidence                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| C1  | wp_blueprint_promote evaluates promotion-gate commands and blocks promotion on failure; the failure was observed live with an empty reason string.         | repo:src/mcp/blueprint-server.ts |
| C2  | A path-stable launcher resolver is being introduced for the source-repo hook and may be reusable here; the shared root cause is plausible but unconfirmed. | repo:bin/\_run.js                |

### Material Decisions

| ID  | Decision         | Chosen option                                                          | Rejected alternatives                   | Rationale                                                                                          |
| --- | ---------------- | ---------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| D1  | Approach         | Discovery-first: identify the real gate-evaluation path before any fix | Prescribe a path-stability fix up front | Codex: the subprocess runner is not confirmed; fixing a guessed path risks missing the real cause. |
| D2  | Diagnostics      | Always surface exit code + stderr tail + log path                      | Keep the current empty failure string   | An empty reason makes the gate untrustworthy and undebuggable.                                     |
| D3  | Timeout handling | Bound and report a timeout cause                                       | Raise the timeout silently              | no-timeout-as-fix: a timeout is a diagnostic, not a knob to turn up.                               |

### Promotion Gates

| Gate       | Command                  | Expected outcome | Last result                      |
| ---------- | ------------------------ | ---------------- | -------------------------------- |
| trust-gate | wp audit blueprint-trust | pass             | pass at 2026-06-27T23:09:06.451Z |

### Residual Unknowns

None.

## Implementation notes

### Discovery findings (2026-06-28)

- `wp_blueprint_promote` reaches promotion-gate evaluation through `applyPromotionTrustGate(...)` in `src/blueprint/trust/promotion.ts:18-67`.
- The exact subprocess runner is `runPromotionCommand(...)` in `src/blueprint/trust/promotion.ts:86-218`.
- The empty failure-string root cause was the old error rendering: it only surfaced `(result.stderr || result.stdout || "").slice(0, 500)` from `spawnSync`, which drops exit code, signal, timeout, and `result.error` details.
- Bare `wp ...` gates were also PATH-sensitive because they relied on ambient command resolution instead of a package-resolved launcher.

### Landed fix

- Added path-stable bare-`wp` resolution through the packaged `bin/wp` launcher (`resolvePackageAssetPreferred(...)`).
- Preserved direct execution for explicit `./bin/wp` repo-local gates.
- Added structured failure diagnostics: exit code, signal, spawn error, explicit timeout marker, bounded stderr/stdout tails, and a persisted log path.
- Persist full gate logs under `.webpresso/logs/promotion-gates/`.

### Verification evidence

- `vp exec vitest run src/blueprint/trust/promotion.test.ts --project unit --reporter=verbose`
- `./bin/wp lint --file src/blueprint/trust/promotion.ts --file src/blueprint/trust/promotion.test.ts`
- `./bin/wp typecheck`

Tasks follow.

#### Task 1.1: Discover the real promotion-gate evaluation path (mandatory first)

**Status:** done
**Wave:** 0

Trace how wp_blueprint_promote turns a Promotion Gate command into a pass/fail and produces the 'Promotion gate failed (<cmd>): ' string. Find handlePromote, applyPromotionTrustGate, and any helper that runs or validates the gate command. Determine whether a subprocess is spawned, what PATH/launcher it uses, whether stderr is captured, and whether a timeout exists. Record findings here.

**Acceptance:**

- [x] The exact code path that evaluates a gate command is identified with file:line. `applyPromotionTrustGate` dispatches each gate via `runPromotionCommand` in `src/blueprint/trust/promotion.ts:50-52`, and the subprocess launch/diagnostic path lives in `src/blueprint/trust/promotion.ts:86-218`.
- [x] The root cause of the empty-message failure is confirmed (launch failure vs timeout vs discarded stderr vs validation mis-render). The old implementation rendered only `(result.stderr || result.stdout || "").slice(0, 500)` from `spawnSync`, so spawn errors / timeout metadata / exit code were discarded when stderr/stdout were empty or unhelpful.

#### Task 1.2: Surface gate failure detail

**Status:** done
**Wave:** 0

Based on 1.1, ensure a failing gate reports exit code + bounded stderr/stdout tail + a log path. Never emit an empty 'Promotion gate failed (cmd): ' string.

**Acceptance:**

- [x] A deliberately failing gate reports a non-empty reason with exit code and stderr tail (summary-first, log path for overflow). `runPromotionCommand` now reports exit/signal/spawn error/timeout plus bounded stderr/stdout tails and writes a full log under `.webpresso/logs/promotion-gates/`. Covered by `src/blueprint/trust/promotion.test.ts`.

#### Task 1.3: Fix the confirmed failure mode

**Status:** done
**Wave:** 1

Apply the fix indicated by 1.1: if a subprocess launch is involved, make it path-stable (reuse the fix-flaky-pretool-guard resolver) with a usable PATH; if a timeout, bound and report it; if a validation mis-render, fix the rendering. Do not implement a launcher fix unless 1.1 confirms a subprocess launch is the cause.

**Acceptance:**

- [x] The confirmed subprocess execution path no longer depends on `repoRoot/bin/wp` for bare `wp ...` gates. Bare `wp` gates resolve the packaged launcher via `resolvePackageAssetPreferred(...)`, while explicit `./bin/wp` gates still execute the repo-local launcher directly. Covered by `src/blueprint/trust/promotion.test.ts`.
- [x] Regression test covers the confirmed failure mode and the diagnostics payload.
