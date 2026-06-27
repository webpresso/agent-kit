---
type: blueprint
title: wp calm help default
status: draft
complexity: S
owner: ozby
created: "2026-06-27"
last_updated: "2026-06-27"
progress: "0% (planned; independent — no wait)"
tags:
  - cli
  - dx
  - vision
  - help
---

# wp calm help default

## Product wedge anchor

- **Stage outcome:** VISION "Calm surface area: advanced add-ons stay off the happy path."
- **Consuming surface:** wp --help / wp help root output (src/cli/cli.ts, ROOT_HELP)
- **New user-visible capability:** wp --help shows only Core + Quality; Advanced moves behind wp help --full. Every verb still works.

## Summary

**Goal:** Make `wp --help` show only Core + Quality verbs by default and move the Advanced block behind `wp help --full`, so the default surface is calm. No command is removed or renamed.

**Why:** `wp --help` prints ~30 verbs including an Advanced block on by default (`src/cli/cli.ts:67-120`, `ROOT_HELP`). Power verbs should stay reachable but off-screen until asked for. Ref: approved plan `~/.claude/plans/i-am-still-not-effervescent-blossom.md`.

**Constraints:** Visibility-only change — no command removed, renamed, or rerouted. No new dependencies. Touches `src/cli/cli.ts` only.

**Sequencing / wait:** No wait; independent of the setup blueprints. Coordinate only if the `thin-root-release-readiness-split` worktree also edits `cli.ts`. Follow the gate: worktree → blueprint → draft PR before the first edit.

#### Task 1.1: Default vs --full help

**Status:** todo

Split ROOT_HELP into a default (Core + Quality) and a --full variant (adds Advanced).

**Acceptance:**

- [ ] Default `wp --help` output has no "Advanced:" section.
- [ ] `wp help --full` includes Advanced.
- [ ] Default verb count is bounded by a test.

#### Task 1.2: Drift guard for help groups

**Status:** todo

Add a test mapping Core/Quality help entries 1:1 to SUPPORTED_COMMANDS so a new verb can't be added to those tiers without a help line (closes the drift the init comment ~L1858 warns about).

**Acceptance:**

- [ ] Every Core/Quality help entry maps to a SUPPORTED_COMMANDS member and vice-versa for that tier.
