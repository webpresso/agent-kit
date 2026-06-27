---
type: blueprint
title: "wp setup charger flag collapse"
owner: ozby
status: draft
complexity: M
created: "2026-06-27"
last_updated: "2026-06-27"
progress: "0% (planned; blocked on secret-orchestration-docs-parity merge)"
depends_on:
  - "blueprints/planned/2026-06-26-secret-orchestration-docs-parity-safe-legacy-cleanup.md"
cross_repo_depends_on: []
tags: [cli, setup, dx, vision, breaking]
---

# wp setup charger flag collapse

**Goal:** Collapse `wp setup` from 16 flags to a 4-flag "charger" happy path and
relocate every recovery/maintenance flag into a new `wp setup repair`
subcommand, so the primary verb matches the VISION ("plugging in a charger: one
motion, no manual wiring", "Calm surface area: advanced add-ons stay off the
happy path").

## Why this exists

`VISION.md` promises `wp setup` is the whole product for ~95% of users, but
`src/cli/commands/init/index.ts` exposes 16 flags on the primary verb. Several
are dead or redundant; five are recovery flows that belong off the happy path.
The surface contradicts the stated North star.

Reference: approved plan
`~/.claude/plans/i-am-still-not-effervescent-blossom.md`.

## Product wedge anchor

- **Stage outcome:** VISION North star — "one command gives every coding agent
  the same repo contract" / "Default first: install, setup, doctor, done".
- **Consuming surface:** `wp setup` verb + new `wp setup repair` subverb
  (`src/cli/commands/init/index.ts`).
- **New user-visible capability:** A new user runs `wp setup` with zero flags to
  learn; advanced recovery is a discoverable `wp setup repair` instead of
  cluttering the primary verb.

## Constraints

- **Breaking change is allowed** (pre-1.0; only ingest-lens + edge-matte
  consume it). Removed/moved flags must error with one-line migration guidance.
- Reuse existing `runInit` branches — relocate flags, do not reimplement logic
  (KISS).
- No new dependencies. No timeout increases.
- **Locked safety surfaces (VISION principle 7) — do NOT change behavior:**
  hook restore/disable stay guarded (git-root requirement, manifest restore)
  and never silent/default; the self-repo guard (`isAgentKitSourceRepo`) stays
  — `--source-maintenance` only relocates; preflight checks keep running (only
  the `--strict` _abort_ escalation moves); do not touch any secret surface
  (`with-secrets`, `wp secrets run`, `wp migrate secrets`).

## Sequencing / wait

- **MUST merge AFTER** `blueprints/planned/2026-06-26-secret-orchestration-docs-parity-safe-legacy-cleanup.md`
  — its Task 1.4 rewrites init/setup copy in the **same file**
  (`src/cli/commands/init/index.ts`). Do not start `index.ts` edits until it
  lands.
- Rebase after agent-kit **PR #283** (`pr-276-package-contract-dedupe`).
- Stay out of the `global-home-secret-config-discovery` draft's territory.
- Follow the gate: worktree → blueprint → draft PR before the first edit.

## Phase 1: Collapse the happy-path flags

### Task 1.1: Delete dead/redundant flags

**Status:** pending

- Delete `--yes` (no-op vs default `acceptDefaults = flags.yes ?? true`, ~L929).
- Collapse `--all` → accept an `all` token in `--with` (mirror
  `parseAgentHosts`' `all` handling); delete the standalone flag.
- Grep `--project` consumers; if only the now-external OMX/OMC scope uses it
  (`docs/add-ons.md`), delete; else demote to `repair`.

**Acceptance:**

- [ ] `--yes` and `--all` removed from `registerInitCommand`.
- [ ] `--with all` reproduces prior `--all` behavior (test).
- [ ] `--project` decision recorded with grep evidence.

## Phase 2: Relocate recovery flags to `wp setup repair`

### Task 2.1: Add `wp setup repair` subcommand routing the same runInit branches

**Status:** pending

Move `--restore-hooks`, `--disable-hooks`, `--prune`, `--overwrite`,
`--source-maintenance`, `--strict`, and the explicit `--user-only` /
`--project-init` overrides onto `wp setup repair`. Reuse the existing `runInit`
code paths (hooks recovery ~L921, preflight strict ~L890, `userOnlyReason`
~L873).

**Acceptance:**

- [ ] `wp setup repair --restore-hooks` / `--prune` / `--overwrite` reproduce
      prior `runInit` outcomes (reuse existing recovery assertions).
- [ ] Removed/moved flags on `wp setup` exit non-zero with a "moved to
      `wp setup repair`" message.
- [ ] Scope auto-inference (~L873-882), host default = all hosts,
      `DEFAULT_PRESETS`, and reconcile-by-default are unchanged.

## Phase 3: Guard the surface and update consumers

### Task 3.1: Flag-budget guard + happy-path help test

**Status:** pending

- Extend `init.integration.test.ts`: `wp setup --help` exposes ≤ 4 options
  (`--with`, `--without`, `--dry-run`, `--cwd`); removed flags absent from
  `setup`, present on `wp setup repair`.
- Add a flag-budget guard test so the happy-path surface can't silently regrow.

**Acceptance:**

- [ ] Happy-path option count asserted ≤ 4.
- [ ] Negative test: `wp setup --restore-hooks` errors with migration guidance.

### Task 3.2: Consumer fix-up (cross-repo)

**Status:** pending

Update ingest-lens + edge-matte if any script/docs invoke a removed flag
(separate commits; no workspace link). Re-run `wp setup` in both to confirm the
charger path still works.

**Acceptance:**

- [ ] No consumer script/doc relies on a removed flag.
- [ ] `wp setup` smoke green in ingest-lens and edge-matte.
