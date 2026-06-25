---
type: blueprint
status: draft
complexity: S
created: "2026-06-24"
last_updated: "2026-06-24"
progress: "100% (flag + probe + tests + docs landed)"
depends_on: []
cross_repo_depends_on: []
tags: [hooks, doctor, conformance, reliability]
---

# wp hooks doctor --probe-decisions semantic probe

**Goal:** Give operators an on-demand way to confirm the installed
pretool-guard makes the _right_ routing decision — not just that it exits 0.
`wp hooks doctor` already proves liveness (empty stdin → exit 0 + JSON); this
adds optional semantic confirmation reusing the conformance matrix.

## Product wedge anchor

- **Stage outcome:** agent-kit Tier-1 host reliability
  (`catalog/agent/rules/supported-agent-clis.md`).
- **Consuming surface:** `wp hooks doctor --probe-decisions` (CLI verb) in any
  consumer repo.
- **New user-visible capability:** an operator debugging a consumer repo can
  confirm `gh pr merge` is allowed and `gh pr view` is denied by the actual
  installed guard, in one command — the exact over-deny class that previously
  shipped green.

## Key Decisions

| Decision             | Choice                                                                              | Rationale                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source of probe rows | Reuse `PROBE_ROWS` + `assertConformance` from `src/hooks/__conformance__/matrix.js` | Single source of truth; the same rows CI enforces. `matrix.ts` is pure (no test-framework imports) and in the build graph, so prod `doctor.ts` may import it |
| Default behavior     | Off by default; opt-in `--probe-decisions`                                          | Default doctor must stay cheap (no extra spawns per bin)                                                                                                     |
| Failure mode         | `probeDecisionRow` returns `ok:false` on assertion failure, never throws            | A bad row degrades to a failing check, not a doctor crash                                                                                                    |

### Phase 1: Decision probe [Complexity: S]

#### [backend] Task 1.1: Add --probe-decisions to hooks doctor

**Status:** done

**Files:**

- Modify: `src/hooks/doctor.ts` (import matrix, `probeDecisions` option,
  `probeDecisionRow`, probe loop in `runHooksDoctor`)
- Modify: `src/cli/commands/hooks.ts` (`--probe-decisions` flag + plumb-through)
- Modify: `src/hooks/doctor.test.ts` (default-off, allow/deny pass, broken-guard fail)
- Modify: `docs/hooks-doctor.md`

**Acceptance:**

- [x] Default `wp hooks doctor` adds no `decision probe:` checks.
- [x] `--probe-decisions` fires `PROBE_ROWS`, asserts via `assertConformance`,
      reports one check per row; allow + deny rows pass against a correct guard.
- [x] A guard that returns the wrong decision makes the probe check fail and
      `result.ok === false` (proves the probe is not a no-op).
- [x] `wp typecheck` clean; `doctor.test.ts` green; scoped lint clean.

## Verification Gates

| Gate        | Command                                   | Success Criteria | Last result |
| ----------- | ----------------------------------------- | ---------------- | ----------- |
| Type safety | `wp typecheck`                            | Zero errors      | pass        |
| Tests       | `wp test --file src/hooks/doctor.test.ts` | All pass         | pass        |
| Lint        | `wp lint --file <changed>`                | Zero violations  | pass        |

## Non-goals

- Making `--probe-decisions` part of required CI (the boundary suite already
  enforces decisions in CI; this is operator convenience).
- Extending probe rows beyond pretool-guard allow/deny (the smallest set).

## Risks

| Risk                                    | Impact                    | Mitigation                                                                                           |
| --------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Prod doctor imports test-support matrix | bundle includes matrix.ts | matrix.ts is pure data/functions (~320 lines), already in the build graph; no test-framework imports |
