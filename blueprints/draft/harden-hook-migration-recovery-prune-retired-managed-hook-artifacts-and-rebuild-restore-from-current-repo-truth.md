---
type: blueprint
status: draft
complexity: S
created: "2026-06-24"
last_updated: "2026-06-24"
progress: "100% (implemented; documents PR #248)"
depends_on: []
cross_repo_depends_on: []
tags: [hooks, setup, migration, agent-config]
---

# Harden hook migration recovery: prune retired managed-hook artifacts and rebuild restore from current repo truth

**Goal:** When `wp setup` (and `wp hooks restore`) run against a repo that was
scaffolded by an older agent-kit, any retired _managed-hook_ artifacts left
behind must be cleaned up rather than carried forward, and a restore must
reflect the **current** repo's hook contract instead of replaying a possibly
stale stored manifest.

## Planning Summary

- Tracks the implementation shipped in PR #248 (`fix/durable-hook-migration-cleanup`).
- Scope is the `agent-hooks` scaffolder and the `hooks-upgrade` command only.
- No public API change; behavior change is limited to setup/restore/upgrade.

## Architecture Overview

```text
wp setup ──> scaffoldAgentHooks
                ├─ patchClaudeSettings / patchCodexHooks
                │     └─ normalize*AgentKitCommands  (strip retired managed-hook
                │        wrapper commands from .claude/settings.json + .codex/hooks.json)
                └─ pruneLegacyManagedHookDirectories  (delete orphaned wp-*
                      wrapper .sh files in .codex/managed-hooks and
                      .claude/hooks/managed; remove now-empty dirs)

wp hooks restore ──> restoreManagedHooksFromManifest(_manifest)
                        └─ rebuild from CURRENT repo via patchClaudeSettings /
                           patchCodexHooks  (ignores the passed manifest so an
                           old manifest cannot re-materialize retired wrappers)

wp hooks upgrade ──> missing/legacy manifest no longer hard-fails; warns and
                     bootstraps from current repo truth.
```

## Key Decisions

| Decision                       | Choice                                                                                                | Rationale                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restore source of truth        | Rebuild from current repo, ignore stored manifest                                                     | A stale manifest can carry retired `.codex/managed-hooks/*` wrapper commands; replaying them re-introduces the exact rot this fixes.              |
| Config cleanup vs file cleanup | `normalize*AgentKitCommands` strips retired commands from config; `prune*` deletes orphan `.sh` files | Config drives invocation, so command-stripping is the load-bearing fix; file deletion is cosmetic orphan cleanup, gated to webpresso-owned paths. |
| Legacy detection               | Match only canonical `wp-*` names under owned dirs + an explicit retired-path allowlist               | Avoids touching user/third-party hooks outside the webpresso-owned directories.                                                                   |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies | Parallelizable |
| ----------------- | --------------- | ------------ | -------------- |
| **Wave 0**        | 1.1, 1.2        | None         | 1 agent        |
| **Critical path** | 1.1 → 1.2 → 1.3 | --           | 1 wave         |

### Phase 1: Hook migration hardening [Complexity: S]

#### [backend] Task 1.1: Detect and strip retired managed-hook commands from config

**Status:** done

**Depends:** None

Extend `extractAgentKitCodexBinName` / `extractClaudeBinName` to also recognize
legacy managed-hook wrapper commands (`.codex/managed-hooks/wp-*.sh`,
`.claude/hooks/managed/wp-*.sh`) via `extractOwnedLegacyManagedHookBinName`
(regex built from `LEGACY_MANAGED_HOOK_DIRECTORY_SEGMENTS`, escaped with
`escapeRegExp`). Extend `normalizeCodexAgentKitCommands` /
`normalizeClaudeAgentKitCommands` to drop retired managed-only commands
(`isLegacyManagedOnlyHookCommand`). Detection is scoped to canonical `wp-*` names in
webpresso-owned directories so user/third-party commands are untouched.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts`

**Steps (TDD):**

1. Add a failing test asserting legacy `.codex/managed-hooks/wp-*.sh` and
   `.claude/hooks/managed/wp-*.sh` wrapper commands are migrated to direct
   `wp hook <name>` commands, and a basename-collision test proving custom
   hooks outside owned dirs survive.
2. Run scoped test recipe — verify FAIL.
3. Implement detection + normalize extensions.
4. Run scoped test recipe — verify PASS.

**Acceptance:**

- [x] Retired managed-hook commands stripped from `.claude/settings.json` and `.codex/hooks.json`.
- [x] Custom/third-party commands in owned dirs preserved (basename-collision test).
- [x] Scoped lint + typecheck pass.

#### [backend] Task 1.2: Prune orphaned managed-hook files and rebuild restore from current truth

**Status:** done

**Depends:** Task 1.1

Add `pruneLegacyManagedHookDirectories` (with `pruneLegacyGeneratedHookFiles` +
`removeDirectoryIfEmpty`) to delete orphaned `wp-*.sh` wrapper files from
`.codex/managed-hooks` and `.claude/hooks/managed`, removing now-empty
directories. Call it at the end of
`scaffoldAgentHooks` (skipped on dry-run). Rewrite
`restoreManagedHooksFromManifest` to rebuild managed hooks from the current repo
(`patchClaudeSettings` / `patchCodexHooks`, which run the same normalize) and
ignore the passed `_manifest`, so a stale manifest cannot replay retired
wrappers. `removeDirectoryIfEmpty` tolerates `ENOENT`/`ENOTDIR` (concurrent
delete) and re-throws unexpected errors.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts`

**Steps (TDD):**

1. Add failing tests: orphan `wp-*.sh` files removed while `keep-me.sh` /
   `custom-guard.sh` survive; restore with a stale manifest yields current
   direct commands, not stale `.codex/managed-hooks/*` paths.
2. Run scoped test recipe — verify FAIL.
3. Implement pruning + restore rebuild.
4. Run scoped test recipe — verify PASS.

**Acceptance:**

- [x] Orphan webpresso wrapper `.sh` files deleted; non-owned files preserved.
- [x] Restore rebuilds current contract from a stale manifest (regression test).
- [x] Dry-run performs no deletions.

#### [backend] Task 1.3: Make `hooks-upgrade` bootstrap from current truth on missing/legacy manifest

**Status:** done

**Depends:** Task 1.2

Replace the hard-fail when no hook manifest exists with a warning + bootstrap
that scaffolds from current repo truth, reporting `beforeSummary:
'legacy/no-manifest'`.

**Files:**

- Modify: `src/cli/commands/hooks-upgrade/index.ts`
- Modify: `src/cli/commands/hooks-upgrade/index.test.ts`

**Steps (TDD):**

1. Add failing tests for dry-run + apply paths with a missing manifest.
2. Run scoped test recipe — verify FAIL.
3. Implement warning + bootstrap.
4. Run scoped test recipe — verify PASS.

**Acceptance:**

- [x] Missing manifest warns instead of failing; bootstrap scaffolds correctly.
- [x] Dry-run and apply both covered by tests.

---

## Verification Gates

| Gate        | Command                                                                 | Success Criteria |
| ----------- | ----------------------------------------------------------------------- | ---------------- |
| Type safety | `wp typecheck`                                                          | Zero errors      |
| Lint        | `wp lint --file src/cli/commands/init/scaffolders/agent-hooks/index.ts` | Zero violations  |
| Tests       | scoped vitest over agent-hooks, hooks-upgrade, init.integration         | All pass (89)    |
| Tests       | scoped vitest over agent-hooks/manifest.test.ts                         | All pass (11)    |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | None      |              |
| Downstream | None      |              |

## Edge Cases and Error Handling

| Edge Case                                                   | Risk                                      | Solution                                                                         | Task |
| ----------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| Concurrent delete of `.claude/hooks` during prune           | Uncaught `ENOENT`/`ENOTDIR` crashes setup | `removeDirectoryIfEmpty` catches both and returns; re-throws others              | 1.2  |
| User hook named like a webpresso wrapper outside owned dirs | Accidental strip/delete                   | Detection scoped to owned dirs + canonical `wp-*` names; basename-collision test | 1.1  |
| Restore with a stale stored manifest                        | Re-materializing retired wrappers         | Restore ignores `_manifest`, rebuilds from current repo                          | 1.2  |

## Non-goals

- Changing the read-only `diffHooksManifest` status path (retired hooks remain "ignored" there; this blueprint only changes scaffold/restore/upgrade mutation paths).
- Any change to hook invocation matchers or the wp-hook bin set.

## Risks

| Risk                                              | Impact                       | Mitigation                                                                                            |
| ------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `rmSync(force)` hides a permission error on prune | Orphan `.sh` survives        | Low: config-normalize already removes the invoking command, so the orphan is inert; prune is cosmetic |
| Leftover retired wrapper command in an old config | Stale `wp hook` wrapper line | `normalize*AgentKitCommands` strips it from config on next setup/restore                              |

## Technology Choices

| Component      | Technology                       | Version   | Why                                        |
| -------------- | -------------------------------- | --------- | ------------------------------------------ |
| FS ops         | `node:fs` `readdirSync`/`rmSync` | Node >=24 | Stdlib; no dependency for orphan cleanup   |
| Path basenames | `node:path` `basename`           | Node >=24 | Total function; avoids non-null assertions |

## Trust Dossier

Draft note: this blueprint documents already-shipped work (PR #248). Complete
this dossier before promotion to `completed`.

### Readiness Verdict

- promotion-ready: false
- unresolved-count: 1
- verified-at: <ISO-8601 timestamp>
- verified-head: <full git commit SHA>
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                   | Evidence                                                             |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| C1  | Retired managed-hook commands are stripped from config on setup/restore | `index.test.ts` migrate + restore tests pass                         |
| C2  | Non-owned hooks are preserved                                           | `index.test.ts` basename-collision + keep-me/custom-guard tests pass |
| C3  | Restore rebuilds current contract from a stale manifest                 | `index.test.ts:1098` stale-wrapper restore test passes               |

### Material Decisions

| ID  | Decision                | Chosen option     | Rejected alternatives | Rationale                               |
| --- | ----------------------- | ----------------- | --------------------- | --------------------------------------- |
| D1  | Restore source of truth | Rebuild from repo | Apply stored manifest | Stale manifest replays retired wrappers |

### Promotion Gates

| Gate      | Command                                                      | Expected outcome | Last result |
| --------- | ------------------------------------------------------------ | ---------------- | ----------- |
| Tests     | scoped vitest (agent-hooks, hooks-upgrade, init.integration) | all pass         | 89 passed   |
| Typecheck | `wp typecheck`                                               | zero errors      | passed      |

### Residual Unknowns

Complete trust dossier (verified-at / verified-head) before promotion to `completed`.
