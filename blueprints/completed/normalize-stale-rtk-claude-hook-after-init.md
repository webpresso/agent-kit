---
type: blueprint
status: completed
complexity: S
created: "2026-06-26"
last_updated: "2026-06-30"
progress: "100% (merged in PR #279; targeted verification attached)"
depends_on: []
cross_repo_depends_on: []
tags:
  - hooks
  - rtk
  - claude
  - reliability
---

# Normalize stale RTK Claude hook after init

**Goal:** Normalize stale RTK Claude hook after init

## Planning Summary

- Goal input: `Normalize stale RTK Claude hook after init`
- Complexity: `S`
- Draft slug: `normalize-stale-rtk-claude-hook-after-init`
- Output path: `blueprints/draft/normalize-stale-rtk-claude-hook-after-init.md`
- Generated command: `wp blueprint new "Normalize stale RTK Claude hook after init" --complexity S`
- Default shape: flat file (`blueprints/<status>/<slug>.md`)
- Validation scope: parser compliance before write

## Architecture Overview

```text
scaffoldAgentHooks writes path-stable direct wp hooks into .claude/settings.json
ensureRtk runs rtk init -g --auto-patch
rtk may inject a stale relative oh-my-codex PreToolUse command
normalizeClaudeRtkSettings removes only that stale group when wp-pretool-guard is already present
```

## Key Decisions

| Decision                | Choice                                                                                                                                        | Rationale                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| RTK normalization scope | Remove only the stale relative `oh-my-codex/dist/scripts/codex-native-hook.js` Claude group when direct `wp-pretool-guard` is already present | Repairs broken generated project hooks without touching standalone/custom RTK installs |

## Quick Reference (Execution Waves)

| Wave              | Tasks | Dependencies | Parallelizable |
| ----------------- | ----- | ------------ | -------------- |
| **Wave 0**        | 1.1   | None         | 1 agent        |
| **Critical path** | 1.1   | --           | 1 wave         |

**Note:** Use t-shirt sizing (XS/S/M/L/XL) for individual task estimates, NOT day/week estimates.

**Lifecycle:** Blueprint frontmatter `status` is one of `draft`, `planned`, `parked`, `in-progress`, `completed`, `archived`. Use `parked` when the blueprint is intentionally paused but should remain distinct from active planning or abandoned work. There is no blueprint-level `blocked` status; when work waits on an external dependency, set the task **Status:** to `blocked` and add a non-empty **Blocked:** line with the reason.

> [!NOTE]
> This template reflects the current preferred blueprint structure. Repo-wide validity is determined by the live blueprint parser/audit rules, so older blueprints may still use a different-but-valid section mix.

### Phase 1: Hook normalization [Complexity: S]

#### [infra] Task 1.1: Normalize stale RTK-managed Claude hook

> **Task header (current accepted form):** Use `#### [lane] Task X.Y:` when the task has a clear lane (`[schema]`, `[backend]`, `[ui]`, `[infra]`, `[docs]`, `[qa]`). `#### Task X.Y:` is still valid, but lane-prefixed headers are preferred in new blueprints.

**Status:** done

**Depends:** None

`rtk init -g --auto-patch` can leave `.claude/settings.json` with a stale relative `oh-my-codex/dist/scripts/codex-native-hook.js` PreToolUse command. In this repo, project Claude hooks must stay path-stable and setup-managed direct `wp hook ...` commands. Add a small normalizer in `ensureRtk` that removes only the stale OMC PreToolUse group when a direct `wp-pretool-guard` hook is already present, preserving the injected `rtk-rewrite.sh` hook and avoiding broad settings rewrites.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/rtk/index.ts`
- Modify: `src/cli/commands/init/scaffolders/rtk/integration.test.ts`

**Steps (TDD):**

1. Update the RTK integration test to assert the stale OMC hook is absent after `ensureRtk`.
2. Implement the minimal normalizer in `ensureRtk`.
3. Verify `./bin/wp test --file src/cli/commands/init/scaffolders/rtk/index.test.ts --file src/cli/commands/init/scaffolders/rtk/integration.test.ts`.
4. Verify scoped typecheck + format check.

**Acceptance:**

- [x] Integration test asserts the stale OMC hook is removed
- [x] Targeted tests pass
- [x] Scoped typecheck passes
- [x] Format check passes

---

## Verification Gates

| Gate        | Command                                                                                                                                          | Success Criteria |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Type safety | `./bin/wp typecheck --file src/cli/commands/init/scaffolders/rtk/index.ts --file src/cli/commands/init/scaffolders/rtk/integration.test.ts`      | Zero errors      |
| Format      | `./bin/wp format --check --file src/cli/commands/init/scaffolders/rtk/index.ts --file src/cli/commands/init/scaffolders/rtk/integration.test.ts` | Zero diffs       |
| Tests       | `./bin/wp test --file src/cli/commands/init/scaffolders/rtk/index.test.ts --file src/cli/commands/init/scaffolders/rtk/integration.test.ts`      | All pass         |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | None      |              |
| Downstream | None      |              |

## Edge Cases and Error Handling

| Edge Case                     | Risk                                 | Solution                                                                  | Task |
| ----------------------------- | ------------------------------------ | ------------------------------------------------------------------------- | ---- |
| RTK injects no stale OMC hook | Broken PreToolUse command at runtime | Normalize only the stale OMC group when `wp-pretool-guard` already exists | 1.1  |

## Non-goals

- Reworking RTK itself or global user-level hooks.
- Changing Codex `.codex/hooks.json` ownership or trust behavior.

## Risks

| Risk                                          | Impact                         | Mitigation                                                                                                             |
| --------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Over-normalization removes a custom user hook | Legitimate custom command lost | Only remove groups containing the exact stale relative OMC command and only when `wp-pretool-guard` is already present |

## Technology Choices

| Component                         | Technology          | Version           | Why                                                 |
| --------------------------------- | ------------------- | ----------------- | --------------------------------------------------- |
| Claude project hook normalization | direct JSON rewrite | current repo code | Smallest change at the owning seam after `rtk init` |

## Trust Dossier

Targeted fix; dossier completed for this small draft branch.

### Readiness Verdict

- promotion-ready: false
- unresolved-count: 0
- verified-at: 2026-06-26T00:00:00Z
- verified-head: pending commit
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                               | Evidence                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| C1  | RTK can leave a stale relative OMC Claude PreToolUse command in project settings                                    | `__fixtures__/fake-tools/rtk-ok-bin/rtk`, RTK integration test fixture |
| C2  | Removing that stale group while preserving `wp-pretool-guard` + `rtk-rewrite.sh` restores path-stable project hooks | targeted RTK tests + current repo hook policy                          |

### Material Decisions

| ID  | Decision    | Chosen option                                                   | Rejected alternatives                                                       | Rationale                                      |
| --- | ----------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| D1  | Repair seam | Normalize `.claude/settings.json` immediately after `ensureRtk` | Hand-edit generated settings; ignore stale hook; broad rewrite of all hooks | Minimal, targeted repair at the owner boundary |

### Promotion Gates

| Gate             | Command                                                                                                                                          | Expected outcome | Last result |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------- |
| Targeted tests   | `./bin/wp test --file src/cli/commands/init/scaffolders/rtk/index.test.ts --file src/cli/commands/init/scaffolders/rtk/integration.test.ts`      | pass             | pass        |
| Scoped typecheck | `./bin/wp typecheck --file src/cli/commands/init/scaffolders/rtk/index.ts --file src/cli/commands/init/scaffolders/rtk/integration.test.ts`      | pass             | pass        |
| Format check     | `./bin/wp format --check --file src/cli/commands/init/scaffolders/rtk/index.ts --file src/cli/commands/init/scaffolders/rtk/integration.test.ts` | pass             | pass        |

### Residual Unknowns

None for this scoped draft fix.
