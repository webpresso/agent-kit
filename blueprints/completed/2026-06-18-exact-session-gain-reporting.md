---
type: blueprint
title: Exact Webpresso Session Gain Reporting
owner: webpresso
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: "Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note."
complexity: M
last_updated: 2026-06-18
---

# Exact Webpresso Session Gain Reporting

## Planning Summary

Implement context-mode-style gain reporting for Webpresso session tools with a stricter contract: exact UTF-8 byte savings for a declared raw basis, plus approximate token estimates computed as `Math.floor(gainBytes / 4)`.

## Problem Statement

`wp_session_stats` did not expose clear Webpresso session gain totals, and `wp gain` only delegated to RTK. Operators needed separate Webpresso-vs-RTK reporting, exact byte accounting, zero-gain visibility, and avoidance of uncertain fixed-point measurements.

## Key Decisions

- Persist gain rows in the session-memory index SQLite DB under `session_memory_gain_events`.
- Treat `tokensSaved` as legacy byte-proxy metadata; canonical session gain estimates live under `structuredContent.gain.approxTokensSaved`.
- Measure `returnedToolResultBytes` from the final MCP result object, including `content`, `structuredContent`, and gain telemetry.
- Record zero-gain converged events; omit gain and warn when fixed-point sizing cannot converge within five iterations.
- Keep Webpresso totals and RTK totals in separate `wp gain` sections.

## Verification Gates

- `vp test src/mcp/tools/_session-gain.test.ts src/session-memory/store.test.ts src/mcp/tools/session-execute.test.ts src/mcp/tools/session-batch-execute.test.ts src/mcp/tools/session-execute-file.test.ts src/mcp/tools/session-index.test.ts src/mcp/tools/session-fetch-and-index.test.ts src/mcp/tools/session-stats.test.ts src/cli/commands/gain/index.test.ts src/mcp/tools/session-gain-docs.test.ts`
- `vp run typecheck`
- `vp run lint:pkg`

## Completion Summary

Implemented exact byte-gain telemetry for `wp_session_execute`, `wp_session_batch_execute`, `wp_session_execute_file` read-text calls, `wp_session_index`, and `wp_session_fetch_and_index`. Added SQLite persistence/aggregation, `wp_session_stats` gain totals, and `wp gain` Webpresso + RTK separated reporting. Added regression coverage for UTF-8 byte math, fixed-point convergence/fallback, zero-gain events, basis choices, batch no-double-counting, stats output, CLI RTK fallback, and docs wording.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                             |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-18-exact-session-gain-reporting.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
