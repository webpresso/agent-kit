---
type: blueprint
title: "Pretool-guard must degrade gracefully outside a git repo"
owner: ozby
status: completed
complexity: S
created: "2026-06-24"
last_updated: "2026-06-30"
progress: "100% (fix + regression tests landed)"
depends_on: []
cross_repo_depends_on: []
tags:
  - hooks
  - pretool-guard
  - bootstrap
  - reliability
---

# Pretool-guard must degrade gracefully outside a git repo

**Goal:** Running a managed hook (`wp hook <name>`) from a directory that is not
a git repository must NOT hard-fail. Today it crashes, and the host hook wrapper
mistranslates the non-zero exit into a misleading "wp not found" deny.

## Product wedge anchor

- **Stage outcome:** agent-kit Tier-1 host reliability
  (`catalog/agent/rules/supported-agent-clis.md`) — Claude Code + Codex hooks are
  the native enforcement surface consumers depend on.
- **Consuming surface:** every consumer repo's generated `.codex/hooks.json` /
  `.claude/settings.json` hook command; Codex runs hooks with cwd at a sibling
  dir and freshly cloned repos may not be `git init`'d yet.
- **New user-visible capability:** a hook fired outside a git repo allows
  legitimate commands instead of emitting a confusing "wp not found on PATH" deny.

## Root cause

`bootstrapAk` (`src/cli/bootstrap.ts`) runs `getRepoKey()` — which throws
`NotInGitRepoError` outside a git repo — for **every** verb, before the command
switch in `cli.ts`. For `wp hook …` this propagates to a non-zero exit. The
generated hook wrapper treats any non-zero/non-2 exit from `wp-pretool-guard` as
"binary missing" and substitutes `PRETOOL_GUARD_MISSING_DENY` ("wp not found on
PATH…"), so the operator sees a wrong diagnosis.

The hook/mcp lanes never consume git-repo state and already short-circuit the
update flow (`SKIP_SUBCOMMANDS = {mcp, hook}` in `auto-update/skip.ts`), so the
git hard-fail is pure downside for them.

## Key Decisions

| Decision                    | Choice                                                              | Rationale                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Where to fix                | `bootstrapAk` short-circuits for `hook`/`mcp` before `getRepoKey()` | Mirrors the existing informational-verb short-circuit; single choke point, no per-validator changes                        |
| Which lanes are exempt      | `hook` + `mcp` (dedicated `GIT_REPO_OPTIONAL_SUBCOMMANDS`)          | Both are runtime lanes (`bin/runtime-lanes.js`) that legitimately run from any cwd; same set already skips the update flow |
| Not raising a timeout/retry | n/a                                                                 | Per `no-timeout-as-fix` — the crash is the alarm; fix degrades to fail-open instead of masking                             |

### Phase 1: Graceful degrade [Complexity: S]

#### [backend] Task 1.1: Short-circuit bootstrap for hook/mcp lanes outside git

**Status:** done

Add `GIT_REPO_OPTIONAL_SUBCOMMANDS = {hook, mcp}` and `isGitRepoOptionalCommand`
to `src/cli/bootstrap.ts`; return early in `bootstrapAk` before `getRepoKey()`
when the invoked subcommand is exempt.

**Files:**

- Modify: `src/cli/bootstrap.ts`
- Modify: `src/cli/bootstrap.test.ts`

**Acceptance:**

- [x] `wp hook pretool-guard` in a non-git cwd → `{}` exit 0 (was
      `Not inside a git repository` exit 1). Verified via rebuilt host runtime.
- [x] `bootstrapAk(['node','wp','hook','pretool-guard'])` does not call
      `getRepoKey` and does not throw even when `getRepoKey` is stubbed to throw.
- [x] `bootstrapAk(['node','wp','mcp'])` likewise short-circuits.
- [x] `wp blueprint` (repo-bound) still hard-fails outside git (D6 unchanged).
- [x] `wp typecheck` clean; `src/cli/bootstrap.test.ts` green.

## Verification Gates

| Gate        | Command                                                   | Success Criteria | Last result |
| ----------- | --------------------------------------------------------- | ---------------- | ----------- |
| Type safety | `wp typecheck`                                            | Zero errors      | pass        |
| Tests       | `wp test --file src/cli/bootstrap.test.ts`                | All pass         | pass        |
| E2E repro   | `wp hook pretool-guard` in non-git cwd (compiled runtime) | `{}` exit 0      | pass        |

## Non-goals

- Changing the wrapper's `PRETOOL_GUARD_MISSING_DENY` text (the wrapper is
  correct for a genuinely missing binary; the fix removes the false trigger).
- Altering `wp` behavior for repo-bound commands outside a git repo.

## Risks

| Risk                            | Impact                           | Mitigation                                                                                      |
| ------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| mcp now skips the git hard-fail | mcp server starts outside a repo | Intended; mcp resolves repo state lazily with bounded discovery. Existing mcp test stays green. |

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-30T21:22:00Z
- verified-head: 6554b58ad7d18b6d3b415869a680fccc934b3300
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                       | Evidence                                                                              |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| C1  | This completed blueprint has a canonical repository record. | repo:blueprints/completed/pretool-guard-must-degrade-gracefully-outside-a-git-repo.md |

### Material Decisions

| ID  | Decision        | Chosen option                                         | Rejected alternatives            | Rationale                                                                                       |
| --- | --------------- | ----------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| D1  | Lifecycle state | Keep this blueprint as a completed historical record. | Leave the record in draft state. | The implementation already landed on `main`; this record now matches shipped lifecycle reality. |

### Promotion Gates

| Gate       | Command                  | Expected outcome | Last result                  |
| ---------- | ------------------------ | ---------------- | ---------------------------- |
| trust-gate | wp audit blueprint-trust | pass             | pass at 2026-06-30T21:22:00Z |

### Residual Unknowns

None.
