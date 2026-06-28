---
type: blueprint
title: wp setup charger flag collapse
status: planned
complexity: M
owner: ozby
created: "2026-06-27"
last_updated: "2026-06-27"
progress: "0% (0/3 tasks done, 0 blocked, updated 2026-06-27)"
tags:
  - cli
  - setup
  - dx
  - vision
  - breaking
---

# wp setup charger flag collapse

## Product wedge anchor

- **Stage outcome:** VISION North star: 'one command gives every coding agent the same repo contract' / 'Default first: install, setup, doctor, done'.
- **Consuming surface:** wp setup verb + new wp setup repair subverb (src/cli/commands/init/index.ts).
- **New user-visible capability:** A new user runs wp setup with zero flags to learn; advanced recovery is a discoverable wp setup repair instead of cluttering the primary verb.

## Summary

Collapse `wp setup` from 16 flags to a calm happy path and relocate recovery/maintenance flags into a new `wp setup repair` subcommand, matching VISION ('plugging in a charger', 'Calm surface area').

### Why

`src/cli/commands/init/index.ts` exposes 16 flags on the primary verb (InitFlags ~L253, registerInitCommand ~L1869). `--yes` is a no-op vs its default (~L929); `--all` duplicates `--with all`; `--user-only`/`--project-init`/`--strict` re-assert inferred values (~L873-882); five are recovery flows (`--restore-hooks`, `--disable-hooks`, `--prune`, `--overwrite`, `--source-maintenance`).

### Scope (breaking allowed; pre-1.0)

- Delete `--yes`; collapse `--all` into a `--with all` token; verify-then-handle `--project`.
- Demote to `wp setup repair`: `--restore-hooks`, `--disable-hooks`, `--prune`, `--overwrite`, `--source-maintenance`, `--strict`, and explicit `--user-only`/`--project-init` overrides. Reuse existing runInit branches (relocate, do not reimplement).
- **`--host` decision (codex):** PRESERVE `--host` as an explicit override on `wp setup` (rare narrowing; default stays all hosts via parseAgentHosts). It is NOT collapsed and NOT counted among the removed flags; document it as the one power-flag that stays on the primary verb.
- Happy-path learning surface: `wp setup [--with <skills|all>] [--without <skills>] [--dry-run] [--cwd <dir>]`, with `--host` as a documented override.
- **`wp init` alias (codex):** `wp init` mirrors `wp setup`'s surface exactly; moved/removed flags on `wp init` error with the same one-line 'moved to wp setup repair' migration guidance.

### Locked (VISION principle 7)

Hook restore/disable stay guarded and never silent/default; self-repo guard (isAgentKitSourceRepo) stays (--source-maintenance only relocates); preflight checks keep running (only the --strict abort escalation moves); no secret surface touched.

### Sequencing / wait

MUST merge AFTER blueprints/planned/2026-06-26-secret-orchestration-docs-parity-safe-legacy-cleanup (its Task 1.4 rewrites the same init/index.ts copy). Rebase after PR #283. Stay out of the global-home-secret-config-discovery draft. Gate: worktree -> blueprint -> draft PR.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-27T23:03:08.627Z
- verified-head: 2b83330804972998d3d680cfb9c1210b35031742
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                             | Evidence                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| C1  | wp setup/init registers ~16 flags on the primary verb, several dead or redundant, and the setup logic lives in one file.          | repo:src/cli/commands/init/index.ts                 |
| C2  | Host selection has its own resolver that defaults to all hosts, so --host can stay an explicit override rather than be collapsed. | repo:src/cli/commands/init/host-visibility.ts       |
| C3  | A setup integration test surface exists to assert the collapsed happy-path and the repair subcommand.                             | repo:src/cli/commands/init/init.integration.test.ts |

### Material Decisions

| ID  | Decision            | Chosen option                                                       | Rejected alternatives           | Rationale                                                                                          |
| --- | ------------------- | ------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| D1  | Recovery flags      | Move to a wp setup repair subcommand                                | Keep them on the primary verb   | Calm surface: recovery is off-path; reuse the same runInit branches.                               |
| D2  | --host              | Preserve as an explicit override on wp setup                        | Remove it; collapse into --with | Default already targets all hosts; narrowing is a rare power-flag, not happy-path clutter (codex). |
| D3  | Removed/moved flags | Error with one-line migration guidance on both wp setup and wp init | Silent removal                  | Pre-1.0 breaking is allowed but must guide the two known consumers.                                |

### Promotion Gates

| Gate       | Command                  | Expected outcome | Last result                      |
| ---------- | ------------------------ | ---------------- | -------------------------------- |
| trust-gate | wp audit blueprint-trust | pass             | pass at 2026-06-27T23:03:08.627Z |

### Residual Unknowns

None.

## Implementation notes

Tasks follow.

#### Task 1.1: Delete dead/redundant flags

**Status:** todo
**Wave:** 0

Delete --yes (no-op vs default ~L929); collapse --all into a --with all token (mirror parseAgentHosts all handling); grep --project consumers and delete if only the now-external OMX/OMC scope uses it, else demote to repair.

**Acceptance:**

- [ ] --yes and --all removed from registerInitCommand.
- [ ] --with all reproduces prior --all behavior (test).
- [ ] --project decision recorded with grep evidence.

#### Task 1.2: Add wp setup repair routing the same runInit branches

**Status:** todo
**Wave:** 0

Move --restore-hooks, --disable-hooks, --prune, --overwrite, --source-maintenance, --strict, and explicit --user-only/--project-init overrides onto wp setup repair, reusing the existing runInit code paths. Preserve --host as an explicit override on wp setup.

**Acceptance:**

- [ ] wp setup repair --restore-hooks / --prune / --overwrite reproduce prior runInit outcomes.
- [ ] Moved flags on wp setup AND wp init exit non-zero with a 'moved to wp setup repair' message.
- [ ] Scope auto-inference, host default = all hosts, DEFAULT_PRESETS, and reconcile-by-default unchanged; --host override still works.

#### Task 1.3: Flag-budget guard + alias + consumer fix-up

**Status:** todo
**Wave:** 1

Extend init.integration.test.ts for the collapsed surface and the wp init alias; add a flag-budget guard so the happy path can't silently regrow; update ingest-lens + edge-matte if any script/docs invoke a removed flag.

**Acceptance:**

- [ ] wp setup --help exposes the calm surface (the 4 learning flags plus the documented --host override); removed flags absent, present on wp setup repair.
- [ ] wp init alias mirrors wp setup including migration errors.
- [ ] No consumer script/doc relies on a removed flag; wp setup smoke green in both consumers.
