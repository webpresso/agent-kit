---
type: blueprint
title: "Single skill channel per host: plugin for Claude and Codex"
owner: ozby
status: draft
complexity: L
created: "2026-06-13"
last_updated: "2026-06-13"
progress: "0% (drafted + fact-checked against official Codex docs and installed codex-cli 0.139.0)"
depends_on: []
cross_repo_depends_on: []
tags:
  - skills
  - plugins
  - codex
  - claude
  - opencode
  - setup
---

# Single skill channel per host: plugin for Claude and Codex

## Product wedge anchor

- **Stage outcome:** agent-kit is the dev-toolchain building block consumed by
  the reference apps (ingest-lens, edge-matte) and dogfooded in this workspace;
  a correct `wp setup`/`wp sync` skill surface is the precondition for every
  agent session in those repos.
- **Consuming surface:** the `wp setup` / `wp sync` CLI verbs and the in-session
  **skill selector** in Claude Code and Codex CLI.
- **New user-visible capability:** every agent-kit skill appears **exactly once**
  per host (no `agent-kit:fix` + bare `fix` duplicates), and Codex receives
  skills through its native plugin (`codex plugin add agent-kit@webpresso`)
  rather than `.agents/skills/` symlinks.

## Summary

`wp setup` double-delivers Claude skills: the `agent-kit@webpresso` Claude
plugin (skills as `agent-kit:*`) **and** `.claude/skills/<skill>` symlinks
projected by `runUnifiedSync`. Root cause: the plugin-as-primary migration was
applied to `DEFAULT_SKILLS_CONSUMERS` (now `[]`, `consumers.ts:53-55`) but **not**
`DEFAULT_UNIFIED_CONSUMERS` (still has `claude-skills`, `consumers.ts:145`), and
skill-dir projection is a **fixed** list that ignores `hosts.selected`.

Fix: make skill-dir projection **host-gated**, give plugin-capable hosts (Claude,
Codex) a plugin-only skill channel, and give dir-only hosts their own root.
Add a Codex plugin channel and a `codex-plugin` scaffolder; add `.opencode/skills`
projection; make the host-visibility audit plugin-aware for Claude+Codex; prune
stale skill symlinks.

## Verified facts (official Codex docs + installed codex-cli 0.139.0, 2026-06-13)

Sources: [Codex Plugins](https://developers.openai.com/codex/plugins),
[Build plugins](https://developers.openai.com/codex/plugins/build),
[Agent Skills](https://developers.openai.com/codex/skills).

| ID      | Fact                                                                                                                                                                                                                                                                                                                                                                                                           | Implication                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | Codex plugin manifest **required** at `.codex-plugin/plugin.json`; `skills/`, `hooks/`, `.mcp.json` at plugin root; fields `name/version/description/skills/mcpServers/hooks/...` (same shape as `.claude-plugin/plugin.json`).                                                                                                                                                                                | Add `.codex-plugin/plugin.json` reusing `./skills`.                                                                                                                                                                                                                                                                                                                                                                  |
| F2      | Codex reads a legacy-compatible marketplace at `$REPO_ROOT/.claude-plugin/marketplace.json`, but the plugin folder still needs `.codex-plugin/plugin.json`.                                                                                                                                                                                                                                                    | Existing `marketplace.json` (`name: webpresso`, plugin `agent-kit`, `source: "./"`) is reused for discovery; manifest is new.                                                                                                                                                                                                                                                                                        |
| F3      | **Codex does NOT dedupe skills by name** — "both can appear in skill selectors".                                                                                                                                                                                                                                                                                                                               | Codex plugin **plus** `.agents/skills/` symlinks = double-show. Moving Codex to the plugin **requires** dropping `.agents/skills/` projection for plugin skills.                                                                                                                                                                                                                                                     |
| F4      | Codex plugin command paths use `${PLUGIN_ROOT}` (hooks doc example), **not** `${CLAUDE_PLUGIN_ROOT}`.                                                                                                                                                                                                                                                                                                          | `.codex-plugin/plugin.json` MCP command = `${PLUGIN_ROOT}/bin/wp`.                                                                                                                                                                                                                                                                                                                                                   |
| F5      | **codex-cli 0.139.0 verified (live):** `codex plugin marketplace add <local-path\|owner/repo\|git-url>` + `codex plugin add <PLUGIN>@<MARKETPLACE> [--json]`; `codex plugin list/remove`. No `codex plugin install` verb.                                                                                                                                                                                      | Non-interactive install IS available. Selector: `agent-kit@webpresso`.                                                                                                                                                                                                                                                                                                                                               |
| **F5b** | **CRITICAL (live-verified):** Codex does **not** expose a plugin whose marketplace `source` is the marketplace root (`./`), and it **ignores** the legacy `.claude-plugin/marketplace.json` string-source for plugin discovery. The plugin MUST be in a **subdirectory** referenced by an **object** source (`{source:"local",path:"./plugins/<name>"}`) in a Codex-native `.agents/plugins/marketplace.json`. | The scaffolder builds a tiny **staging marketplace** at `~/.webpresso/cache/agent-kit/codex-marketplace/` whose `plugins/agent-kit` is a **symlink** to the installed package root, then `marketplace add <staging>` + `plugin add agent-kit@webpresso`. **Verified end-to-end:** installs to `~/.codex/plugins/cache/webpresso/agent-kit/0.34.5/` with all 19 skills present; #22078 does NOT reproduce on 0.139.0. |
| F6      | `.agents/skills/` is shared by Codex + Amp + OpenCode-fallback; OpenCode primary root is `.opencode/skills/` (not currently projected).                                                                                                                                                                                                                                                                        | Add `opencode-skills → .opencode/skills`; keep `.agents/skills` only for hosts that need it (Amp, or Codex-without-plugin).                                                                                                                                                                                                                                                                                          |

## Target architecture (one channel per host)

| Host              | Skill channel (after)                                 | Dropped                                 |
| ----------------- | ----------------------------------------------------- | --------------------------------------- |
| Claude            | Claude plugin (`agent-kit:*`)                         | `.claude/skills/` symlinks              |
| Codex             | Codex plugin (`codex plugin add agent-kit@webpresso`) | `.agents/skills/` symlinks (F3)         |
| OpenCode          | `.opencode/skills/` projection (primary root)         | `.claude/`/`.agents/` fallback reliance |
| Amp (if selected) | `.agents/skills/` (host-gated)                        | —                                       |

Principle (forced by F3): a selected host with a plugin channel contributes
**no** skill-dir consumer; dir-only hosts get **only** their own root.

## Key Decisions

| Decision                              | Choice                                                                                                                     | Rationale                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Skill projection                      | host-gated by `hosts.selected`, not a fixed `DEFAULT_UNIFIED_CONSUMERS`                                                    | The bug is exactly that projection ignores selection + plugin coverage |
| Plugin-host skill dirs                | none (`.claude/skills`, `.agents/skills` not projected for claude/codex)                                                   | Plugin is the single channel; F3 makes Codex double-show otherwise     |
| Codex install                         | `codex plugin marketplace add <pkgRoot>` + `codex plugin add agent-kit@webpresso --json`, opt-out `WP_SKIP_CODEX_PLUGIN=1` | Mirror `claude-plugin` scaffolder; F5 confirms verbs exist             |
| `.codex-plugin/plugin.json` ownership | THIS blueprint creates it (skills + MCP); the XL multi-host blueprint extends it (hooks.json + full package-surface)       | Avoids two blueprints defining it; see Cross-Plan References           |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Depends                    | Parallelizable | Effort |
| ----------------- | --------------- | -------------------------- | -------------- | ------ |
| **Wave 0**        | 1.1, 2.0        | None                       | 2 agents       | S      |
| **Wave 1**        | 1.2, 1.3        | 1.1 (core), None (1.2 pkg) | 2 agents       | M      |
| **Wave 2**        | 2.1, 2.2        | 1.2 / 1.1                  | 2 agents       | M      |
| **Wave 3**        | 3.1             | all                        | 1 agent        | S      |
| **Critical path** | 1.1 → 1.3 → 3.1 | —                          | 3 waves        | M      |

### Parallel Metrics Snapshot

| Metric | Meaning                            | Target     | Actual       |
| ------ | ---------------------------------- | ---------- | ------------ |
| RW0    | Ready in Wave 0                    | ≥ agents/2 | 2            |
| CPR    | total_tasks / critical_path_length | ≥ 2.5      | 7 / 3 = 2.33 |
| DD     | dependency_edges / total_tasks     | ≤ 2.0      | 6 / 7 = 0.86 |
| CP     | same-file overlaps per wave        | 0          | 0            |

**Parallelization score:** B. Core fix (1.1) is on the critical path; packaging
(1.2) and probe (2.0) run alongside it.

## Tasks

### Phase 1: core skill-channel fix

#### [core] Task 1.1: Host-gate skill-dir projection; drop plugin-host skill dirs

**Status:** todo
**Wave:** 0
**Depends:** None

Remove the `claude-skills` consumer (`src/symlinker/consumers.ts:145`) from
`DEFAULT_UNIFIED_CONSUMERS`. Make the **skill** consumers
(`portable-skills`→`.agents/skills`, new
`opencode-skills`→`.opencode/skills`) filtered by `hosts.selected` so a selected
plugin host (claude, codex) contributes **no** skill-dir consumer, and
`.agents/skills` is contributed only when a host that needs it (amp, or
codex-without-plugin) is selected (F3, F6). Keep `claude-rules` (rules are not
plugin skills). Fix the stale `consumers.ts:143` comment. `runUnifiedSync`
(`src/symlinker/unified-sync.ts`) must receive the selected hosts (read from
`readConfig(repoRoot)` in `sync.ts`) and gate consumers accordingly.

**Files:**

- Modify: `src/symlinker/consumers.ts`
- Modify: `src/symlinker/unified-sync.ts`
- Modify: `src/cli/commands/sync.ts`
- Modify: `src/symlinker/consumers.test.ts`
- Modify: `src/symlinker/unified-sync.test.ts`

**Steps (TDD):**

1. Write failing test: `DEFAULT_UNIFIED_CONSUMERS` projects **no** skill dir for hosts `[claude]`/`[codex]`; projects `.opencode/skills` for `[opencode]`; projects `.agents/skills` only when amp/codex-without-plugin selected.
2. Run: `./bin/wp test --file src/symlinker/consumers.test.ts --file src/symlinker/unified-sync.test.ts` — verify FAIL.
3. Implement host-gated consumer selection; remove `claude-skills`; add `opencode-skills`.
4. Run the same `--file` test — verify PASS.
5. Run: `./bin/wp typecheck` and `./bin/wp lint --file src/symlinker/consumers.ts --file src/symlinker/unified-sync.ts --file src/cli/commands/sync.ts`.

**Acceptance:**

- [ ] No skill-dir consumer is produced for a selected plugin host (claude/codex).
- [ ] `.opencode/skills` projected when opencode selected; `.agents/skills` only for amp/codex-without-plugin.
- [ ] Regression test prevents the two registries diverging again.
- [ ] typecheck + lint clean.

#### [core] Task 1.2: Prune stale skill symlinks on sync

**Status:** todo
**Wave:** 1
**Depends:** Task 1.1

`src/compiler/orphans.ts`: when `.claude/skills`/`.agents/skills` are no longer
projection targets for the selected hosts, remove leftover skill symlinks that
point into the agent-kit catalog. Guard: never remove the canonical source, the
`gstack/` dir, or non-agent-kit/user-authored entries (only symlinks resolving
into the agent-kit catalog skills dir). Update `GENERATED_SKILL_DIRS` semantics
accordingly.

**Files:**

- Modify: `src/compiler/orphans.ts`
- Modify: `src/compiler/orphans.test.ts`

**Steps (TDD):**

1. Write failing test: a `.claude/skills/<skill>` symlink into the catalog is removed on sync when claude is a plugin host; `gstack/` and unrelated entries are preserved.
2. Run: `./bin/wp test --file src/compiler/orphans.test.ts` — verify FAIL.
3. Implement the guarded prune.
4. Run the same `--file` test — verify PASS.
5. Run: `./bin/wp typecheck`.

**Acceptance:**

- [ ] Stale catalog skill symlinks under plugin-host dirs are removed on sync.
- [ ] `gstack/`, canonical source, and user dirs are never touched.

#### [packaging] Task 1.3: Add `.codex-plugin/plugin.json` (skills + MCP) + package surface

**Status:** todo
**Wave:** 1
**Depends:** None

Add a Codex manifest mirroring `.claude-plugin/plugin.json`, reusing `./skills`,
with MCP `command` `${PLUGIN_ROOT}/bin/wp` (F4). Add `.codex-plugin` to
`package.json#files`. Wire version-lock into `scripts/sync-marketplace-version.ts`
so `.codex-plugin/plugin.json` tracks `package.json#version`. Public-package
safety per `package-conventions.md`/`public-package-safety.md`: no secrets, local
paths, or generated state; prove via package-surface. (Coordinates with the XL
multi-host blueprint Task 1.1, which extends this with `hooks.json` — see
Cross-Plan References.)

**Files:**

- Create: `.codex-plugin/plugin.json`
- Modify: `package.json`
- Modify: `scripts/sync-marketplace-version.ts`
- Modify: `src/build/package-manifest.test.ts`
- Modify: `src/build/validate-marketplace.test.ts` (assert `.codex-plugin` version + skill parity with `.claude-plugin`)

**Steps (TDD):**

1. Write failing test: `.codex-plugin/plugin.json` is a shipped file, version-locked to `package.json`, lists the same skills surface as `.claude-plugin/plugin.json`, uses `${PLUGIN_ROOT}` not `${CLAUDE_PLUGIN_ROOT}`, contains no denied content.
2. Run: `./bin/wp test --file src/build/package-manifest.test.ts --file src/build/validate-marketplace.test.ts` — verify FAIL.
3. Create the manifest; add to `files`; extend the version-sync script.
4. Run the same `--file` tests — verify PASS.
5. Run: `./bin/wp audit package-surface` and `vp run lint:pkg`.

**Acceptance:**

- [ ] `.codex-plugin/plugin.json` ships, version-locked, `${PLUGIN_ROOT}` MCP command.
- [ ] `package.json#files` includes `.codex-plugin`; no denied content (package-surface clean).
- [ ] `.claude-plugin` packaging unchanged.

### Phase 2: Codex install + plugin-aware audit

#### [probe] Task 2.0: Confirm install path against installed codex CLI (DONE — recorded)

**Status:** done
**Wave:** 0
**Depends:** None

Probed codex-cli **0.139.0**: `codex plugin marketplace add <SOURCE>` (local path
/ owner/repo[@ref] / git URL, `--ref`/`--sparse`/`--json`); `codex plugin add
<PLUGIN>@<MARKETPLACE>` / `--marketplace` / `--json`; `codex plugin list`,
`codex plugin remove`. No `install` verb. Selector for agent-kit:
`agent-kit@webpresso`. Disable via `~/.codex/config.toml`. Task 2.1 designs to
these verbs; verify #22078 non-reproduction in Task 3.1.

**Acceptance:**

- [x] Non-interactive verbs confirmed and recorded.

#### [setup] Task 2.1: `codex-plugin` scaffolder (marketplace add + plugin add)

**Status:** todo
**Wave:** 2
**Depends:** Task 1.3, Task 2.0

New `src/cli/commands/init/scaffolders/codex-plugin/index.ts` mirroring
`claude-plugin/index.ts`: probe `codex` on PATH; `codex plugin marketplace add
<packageRoot>` (reuses legacy `.claude-plugin/marketplace.json`); `codex plugin
add agent-kit@webpresso --json` (best-effort, parse JSON result); opt-out
`WP_SKIP_CODEX_PLUGIN=1`; dry-run + codex-not-on-PATH + add-failed branches with
actionable fallback strings. Wire result reporting into `init/index.ts` mirroring
the `claude-plugin-*` cases. `log()` the visible-after-restart step; no silent cap.

**Files:**

- Create: `src/cli/commands/init/scaffolders/codex-plugin/index.ts`
- Create: `src/cli/commands/init/scaffolders/codex-plugin/index.test.ts`
- Modify: `src/cli/commands/init/index.ts`
- Modify: `src/cli/commands/init/index.test.ts`

**Steps (TDD):**

1. Write failing tests (inject a fake `spawn`): success path runs `marketplace add` then `plugin add agent-kit@webpresso`; `WP_SKIP_CODEX_PLUGIN=1` skips; codex-not-on-PATH returns actionable hint; dry-run no-ops.
2. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/codex-plugin/index.test.ts --file src/cli/commands/init/index.test.ts` — verify FAIL.
3. Implement the scaffolder + init wiring.
4. Run the same `--file` tests — verify PASS.
5. Run: `./bin/wp lint --file src/cli/commands/init/scaffolders/codex-plugin/index.ts --file src/cli/commands/init/index.ts`.

**Acceptance:**

- [ ] Non-interactive Codex install via marketplace add + plugin add, opt-out env, dry-run, not-on-PATH branches.
- [ ] init output reports codex-plugin result like claude-plugin.
- [ ] Manual/visible-after-restart step is logged, not hidden.

#### [audit] Task 2.2: Plugin-aware host-visibility for claude + codex

**Status:** todo
**Wave:** 2
**Depends:** Task 1.1

`src/cli/commands/init/host-visibility.ts`: for `claude` and `codex`, treat a
capability as visible when its `SKILL.md` exists in the installed plugin cache
(`~/.claude/plugins/cache/.../skills/<cap>/SKILL.md`,
`~/.codex/plugins/cache/.../skills/<cap>/SKILL.md`) — not only the now-removed
`.claude/skills`/`.agents/skills` roots. Reuse plugin-root resolution from
`src/hooks/doctor.ts`. Without this the audit goes red after Task 1.1.

**Files:**

- Modify: `src/cli/commands/init/host-visibility.ts`
- Modify: `src/cli/commands/init/host-visibility.test.ts`

**Steps (TDD):**

1. Write failing test: with no `.claude/skills` symlink but a plugin-cache `SKILL.md`, claude/codex capability is `visible-after-restart`/`visible-now`, not `not-visible`.
2. Run: `./bin/wp test --file src/cli/commands/init/host-visibility.test.ts` — verify FAIL.
3. Add plugin-cache roots for claude/codex.
4. Run the same `--file` test — verify PASS.
5. Run: `./bin/wp typecheck`.

**Acceptance:**

- [ ] claude/codex visibility reads the plugin cache.
- [ ] opencode visibility still reads `.opencode/skills`.

### Phase 3: verify + ship

#### [qa] Task 3.1: Full QA, end-to-end host smoke, changeset

**Status:** todo
**Wave:** 3
**Depends:** 1.1, 1.2, 1.3, 2.1, 2.2

`./bin/wp qa` (bookend). In a scratch consumer repo: `wp sync` leaves **no**
agent-kit skill symlinks in `.claude/skills` or `.agents/skills`; `.opencode/skills`
populated; `wp audit` host visibility for claude+codex = visible (plugin);
`codex plugin add agent-kit@webpresso` then `codex plugin list --json` shows the
plugin and a Codex session exposes `agent-kit:*` skills once (verify #22078
non-reproduction on 0.139.0). `vp run changeset` (minor), commit.

**Files:**

- Create: `.changeset/<slug>.md`

**Acceptance:**

- [ ] No duplicate skills in any selected host; Codex shows plugin skills once.
- [ ] Full `wp qa` green; package-surface + lint:pkg green.
- [ ] Changeset added.

## Cross-Plan References

| Type    | Blueprint                                                                              | Relationship                                                                                        | Alignment note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sibling | `blueprints/planned/2026-06-13-multi-host-plugin-and-instruction-surface-expansion.md` | Both touch `.codex-plugin/plugin.json`, `package.json#files`, `host-visibility.ts`, `init/index.ts` | **This blueprint owns** `.codex-plugin/plugin.json` (skills+MCP), `package.json#files` Codex inclusion, host-gated skill projection, the `codex-plugin` install scaffolder, and plugin-aware skill visibility. The XL blueprint's **Task 1.1 should be updated to EXTEND** the shipped `.codex-plugin/` (add `hooks.json`/`.mcp.json` + full package-surface coverage) rather than create the manifest, and its **Task 4.1** builds on the plugin-aware `host-visibility.ts` here. No hook ownership changes here. |

## Risks / Edge Cases

| ID  | Sev  | Item                                                          | Mitigation                                                                                                                                    | Task     |
| --- | ---- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| F3  | CRIT | Codex shows skills twice if plugin + `.agents/skills` coexist | Host-gate skill dirs; verify e2e                                                                                                              | 1.1, 3.1 |
| F6  | HIGH | Dropping `.claude/`+`.agents/` skill dirs breaks OpenCode/Amp | Add `.opencode/skills`; gate `.agents/skills` to amp/codex-no-plugin                                                                          | 1.1      |
| F5b | MED  | openai/codex#22078 (local-marketplace skills not exposed)     | Verify non-reproduction on 0.139.0; fall back to personal `~/.agents/plugins/marketplace.json` + `~/.codex/plugins/` staging if it reproduces | 2.1, 3.1 |
| A1  | MED  | host-visibility goes red after removing symlinks              | Plugin-aware audit                                                                                                                            | 2.2      |
| P1  | MED  | `.codex-plugin/` leaks private content to npm                 | package-surface + lint:pkg gates                                                                                                              | 1.3      |

## Verification Gates

| Gate                | Command                                                                                                                                                                                                                                                                                                 | Success     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Type safety         | `./bin/wp typecheck`                                                                                                                                                                                                                                                                                    | zero errors |
| Lint                | `./bin/wp lint --file src/symlinker --file src/compiler --file src/cli/commands/init --file src/cli/commands/sync.ts`                                                                                                                                                                                   | clean       |
| Focused tests       | `./bin/wp test --file src/symlinker/consumers.test.ts --file src/symlinker/unified-sync.test.ts --file src/compiler/orphans.test.ts --file src/build/package-manifest.test.ts --file src/cli/commands/init/scaffolders/codex-plugin/index.test.ts --file src/cli/commands/init/host-visibility.test.ts` | all pass    |
| Package surface     | `./bin/wp audit package-surface` + `vp run lint:pkg`                                                                                                                                                                                                                                                    | clean       |
| Full QA             | `./bin/wp qa`                                                                                                                                                                                                                                                                                           | green       |
| Blueprint lifecycle | `./bin/wp audit blueprint-lifecycle`                                                                                                                                                                                                                                                                    | valid       |

## Non-goals

- Changing Claude hook ownership or moving hooks into the plugin manifest.
- Building a generic plugin-host abstraction (Amp etc. stay on `.agents/skills`).
- Codex `hooks.json`/instruction-surface work (owned by the XL multi-host blueprint).
