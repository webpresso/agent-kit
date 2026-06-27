---
type: blueprint
title: wp calm help default
status: planned
complexity: S
owner: ozby
created: "2026-06-27"
last_updated: "2026-06-27"
progress: "0% (0/2 tasks done, 0 blocked, updated 2026-06-27)"
tags:
  - cli
  - dx
  - vision
  - help
---

# wp calm help default

## Product wedge anchor

- **Stage outcome:** VISION 'Calm surface area: advanced add-ons stay off the happy path.'
- **Consuming surface:** wp --help / wp help root output and a new wp help --full route (src/cli/cli.ts, ROOT_HELP).
- **New user-visible capability:** wp --help shows only Core + Quality; Advanced moves behind a new wp help --full route. Every verb still works.

## Summary

Make `wp --help` show only Core + Quality verbs by default and move the Advanced block behind a `wp help --full` route. No command is removed or renamed.

### Why

`wp --help` prints ~30 verbs including an Advanced block on by default (src/cli/cli.ts, ROOT_HELP). The default surface should be calm; power verbs stay reachable but off-screen until asked for.

### Scope (codex changes folded in)

- Split ROOT_HELP into a default (Core + Quality) and a --full variant (adds Advanced).
- **Add/support the `wp help --full` route:** it is NOT currently a visible root command path in cli.ts, so the plan must wire it (a `help` verb accepting `--full`, or a `--full` flag honored on the root help path), not assume it exists.
- Cover all help entrypoints: default `wp --help`, bare `wp`, and `wp -h` must all show the calm default; `wp help --full` shows Advanced.
- Drift guard: a test mapping Core/Quality help entries 1:1 to SUPPORTED_COMMANDS so a new verb can't be added to those tiers without a help line.

### Sequencing

Independent; touches src/cli/cli.ts only. Coordinate only if the thin-root-release-readiness-split worktree also edits cli.ts.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-27T23:02:01.039Z
- verified-head: 2b83330804972998d3d680cfb9c1210b35031742
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                     | Evidence            |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| C1  | The root help text and the supported-command list live in cli.ts; ROOT_HELP currently shows an Advanced block by default. | repo:src/cli/cli.ts |
| C2  | wp help --full is not currently a visible root command path, so the route must be added as part of this work.             | repo:src/cli/cli.ts |

### Material Decisions

| ID  | Decision            | Chosen option                                                | Rejected alternatives   | Rationale                                                                            |
| --- | ------------------- | ------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------ |
| D1  | Advanced visibility | Default help hides Advanced; wp help --full reveals it       | Remove or reorder verbs | Calm surface without losing any command (codex: must actually add the --full route). |
| D2  | Drift protection    | Test mapping Core/Quality help entries to SUPPORTED_COMMANDS | Prose-only review       | Prevents silent regrowth of the default surface.                                     |

### Promotion Gates

| Gate       | Command                  | Expected outcome | Last result                      |
| ---------- | ------------------------ | ---------------- | -------------------------------- |
| trust-gate | wp audit blueprint-trust | pass             | pass at 2026-06-27T23:02:01.039Z |

### Residual Unknowns

None.

## Implementation notes

Tasks follow.

#### Task 1.1: Default vs --full help, including the new route

**Status:** todo
**Wave:** 0

Split ROOT_HELP into default (Core + Quality) and a --full variant (adds Advanced). Wire the wp help --full route since it does not exist today. Ensure default wp --help, bare wp, and wp -h all show the calm default.

**Acceptance:**

- [ ] Default wp --help / bare wp / wp -h have no Advanced section; wp help --full includes Advanced.
- [ ] Default verb count is bounded by a test.

#### Task 1.2: Drift guard

**Status:** todo
**Wave:** 0

Add a test mapping Core/Quality help entries 1:1 to SUPPORTED_COMMANDS.

**Acceptance:**

- [ ] Every Core/Quality help entry maps to a SUPPORTED_COMMANDS member and vice-versa for that tier.
