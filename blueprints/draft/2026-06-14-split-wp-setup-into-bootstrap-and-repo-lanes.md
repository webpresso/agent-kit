---
type: blueprint
title: "Split wp setup into wp bootstrap (global) + wp setup (repo) on a phase registry"
owner: ozby
status: draft
complexity: L
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (drafted + fact-checked against the live src/cli/commands/init tree on 2026-06-14)'
depends_on: []
cross_repo_depends_on: []
tags:
  - setup
  - bootstrap
  - cli
  - dx
  - idempotency
  - concurrency
---

# Split `wp setup` into `wp bootstrap` (global) + `wp setup` (repo) on a phase registry

## Product wedge anchor

- **Stage outcome:** agent-kit toolchain DX — the reference consumers
  (`ozby/ingest-lens`, `ozby/edge-matte`) and this repo onboard through the `wp`
  CLI; setup ergonomics are the first-touch surface for "does agent-kit work for
  a 3rd party." Tracks the same surface as
  [[2026-06-13-wp-setup-output-guardrail-self-consistency]].
- **Consuming surface:** the new `wp bootstrap` verb and the slimmed `wp setup` verb.
- **New user-visible capability:** a developer runs `wp bootstrap` once per machine
  (fast on repeat — skip-when-fresh — and runnable **inside agent-kit itself**) and
  `wp setup` per repo in seconds, instead of paying the full re-install of omx +
  `vp install -g` + plugins on every invocation in every repo.

## Summary

`runInit` in `src/cli/commands/init/index.ts` is one ~990-line linear `await`
chain (lines 338–1324) that does four jobs at once with no separation:

1. **Slow** — independent network/install workloads run strictly sequentially.
2. **Re-installs every run** — `ensureAgentKitGlobal` runs `vp install -g`
   unconditionally; the `omx` scaffolder runs full `omx setup` unconditionally
   (`scaffolders/omx/index.ts:398`). Only **gstack** is correct — it skips with
   `already configured (set WP_GSTACK_REFRESH=1 to refresh)`.
3. **No system-vs-repo split** — one run bundles user-global mutations with
   repo-local scaffolding; `--project` only toggles OMX/OMC scope.
4. **Refuses to run inside agent-kit** — the self-repo guard (lines 357–368)
   hard-errors unless `--source-maintenance`, blocking even the harmless global
   tool install.

This blueprint converts orchestration to a **declarative phase registry** with two
lanes (`global` / `repo`), adds a **`wp bootstrap`** verb for the global lane,
slims **`wp setup`** to the repo lane, runs independent global phases
**concurrently**, and applies one **uniform skip-when-fresh** idempotency helper —
generalizing gstack's existing gate. The ~50 inline `switch`/`console.log` arms
collapse into a single `reporter.ts`.

> **Verification standard:** behaviour-preserving relocation of scaffolder calls
> into registry entries; existing scaffolders are reused verbatim as phase `run`
> bodies (see `catalog/agent/rules/extraction-parity.md` for the parity bar where
> a phase is a pure move).

## Decisions (locked with user)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Full architectural refactor (phase registry + lane split + concurrency + uniform idempotency) | All four complaints share one root cause: the monolithic sequential orchestrator. |
| D2 | **Separate verbs** `wp bootstrap` + `wp setup` (breaking change) | Cleanest mental model; user chose it over modes-on-one-verb. Requires a migration/back-compat path (Task 3.2). |
| D3 | **Skip-when-fresh by default**, `--refresh` forces | Generalizes the gstack `WP_GSTACK_REFRESH` gate already shipped. |
| D4 | **Dedicated competitive-research pass first** (Task 0.1) | User asked to "check similar repos"; output informs final verb/flag naming. |

## Technology / surface choices

| Choice | Decision | Source of truth |
|--------|----------|-----------------|
| New verb registration | Add `'bootstrap'` to `SUPPORTED_COMMANDS` + dispatch in `src/cli/cli.ts` (verb list at lines ~20–58, dispatch switch ~line 235) | `cli.ts` verified 2026-06-14 — no `bootstrap` verb today (F2) |
| Concurrency | New bounded-pool runner (no existing helper — `rg` for `pLimit`/pool found only unrelated `command-builder`) built on the repo's deterministic-boundary helpers (`withDeadline`/`pollUntil`) | `agent-guide.md` § Deterministic External Boundaries |
| Shared-file writes | Consume the atomic-write helper from [[2026-06-14-add-atomic-file-write-helper]] / [[2026-06-14-shared-filesystem-io-utilities]] rather than rolling our own | F6 cross-plan dep |
| Output | Single `reporter.ts` rendering `PhaseResult[]`; align format with [[2026-06-13-wp-setup-output-guardrail-self-consistency]] | F7 overlap |
| Freshness state | global: `~/.webpresso/cache/agent-kit/bootstrap-state.json`; repo: existing `.webpressorc.json` / `.webpresso/` (repo phases already drift-aware via `merge.ts`) | gstack precedent |
| Version probes | Reuse omx's bounded `PROBE_TIMEOUT_MS = 3000` for staleness checks; **install workloads stay unbounded** | `no-timeout-as-fix.md` |

---

## Fact-Check Findings (Phases 1–4)

| ID | Sev | Claim in original plan | Reality (verified 2026-06-14) | Fix |
|----|-----|------------------------|-------------------------------|-----|
| F1 | — | `runInit` is a ~990-line sequential chain; ~50 switch arms | CONFIRMED `index.ts:338–1324`; scaffolders modular under `scaffolders/*/index.ts` | none — basis for design |
| F2 | HIGH | new `wp bootstrap` verb is free | CONFIRMED no `bootstrap` in `SUPPORTED_COMMANDS`, **but** `src/cli/bootstrap.ts` + `bootstrapAk()` already exist (CLI startup, `cli.ts:14,167`) | Name the new module `commands/bootstrap/` (verb handler), never reuse `bootstrap.ts`/`bootstrapAk` symbol (Task 3.1) |
| F3 | HIGH | omx re-runs every time | CONFIRMED `scaffolders/omx/index.ts:398` `spawn('omx',['setup','--yes','--scope',scope])` is unconditional; only the `vp` refresh is gated by `WP_SKIP_UPDATE_CHECK` | Add freshness gate (Task 2.4) |
| F4 | HIGH | `ensureAgentKitGlobal` runs `vp install -g` every run | CONFIRMED; opt-outs only `--dry-run`/`WP_SKIP_AUTO_INSTALL`/`WP_FORCE_SOURCE`/no-vp | Add freshness gate (Task 2.3) |
| F5 | CRITICAL | "user-config MCP writers (claude + codex)" are global-lane | PARTLY WRONG. codex MCP → `~/.codex/config.toml` (global). **Claude MCP (`ensureClaudePlaywrightMcp`/`ensureClaudeContext7Mcp`) writes `<repoRoot>/.mcp.json` (REPO lane)**. `~/.claude.json` is written by the *plugin* install, not MCP. `codex-mcp/index.ts:201,536` | Lane assignment: codex MCP = global; Claude MCP = repo. Shared-file groups: `~/.codex/config.toml` (global serial group: omx + codex-webpresso + codex-context7 + codex-playwright); `<repoRoot>/.mcp.json` (repo serial group: claude-playwright + claude-context7) |
| F6 | HIGH | concurrency runner writes shared files directly | Concurrent writes to the same `config.toml`/`.mcp.json` race | Serialize same-target writers via `dependsOn`; use atomic-write helper ([[2026-06-14-add-atomic-file-write-helper]]) (Task 2.5) |
| F7 | MEDIUM | new `reporter.ts` is greenfield | [[2026-06-13-wp-setup-output-guardrail-self-consistency]] already governs `wp setup` output self-consistency | Align reporter contract; cross-reference both blueprints (Task 1.3, Task 4.3) |
| F8 | MEDIUM | agent-hooks is repo-lane | Straddles. `index.ts:310` `normalizeGlobalCodexHooksFile` (`~/.codex`), `index.ts:1138` `claudeUser` facet, `trustCodexPresetHooksForUser` (user) vs repo `.claude/settings.json`/`.codex/hooks.json` | Split: global codex-hook normalization + user trust = global lane; repo `.claude`/`.codex` hook writes = repo lane (Task 2.1/2.2) |
| F9 | MEDIUM | callers of `wp setup` are docs only | `package.json` `setup:agent` → `./bin/wp setup`; `scaffold-base-kit.ts:236` injects `scripts['setup:agent']='wp setup'`; preflight/detect-consumer hint strings | Audit + update all call sites (Task 4.1) |
| F10 | LOW | blueprint goes in a draft dir | agent-kit draft = single `.md` files with YAML frontmatter schema (`type/title/owner/status/complexity/created/last_updated/progress/depends_on/cross_repo_depends_on/tags`) | this file matches that schema |

**Cross-plan alignment (Phase 4):** no existing blueprint covers this split.
Intersecting planned blueprints referenced above: atomic-write + shared-fs-io
(consume), wp-setup-output-guardrail (align reporter),
[[2026-06-13-single-skill-channel-per-host]] (shares `wp setup` skill-delivery
surface — coordinate, no code conflict).

## Architecture

`SetupPhase` is data, not inline code:

```ts
type Lane = 'global' | 'repo'
interface SetupPhase {
  id: string
  lane: Lane
  label: string
  enabled(ctx: SetupCtx): boolean       // preset/host/CI/env gating, moved out of runInit
  freshnessKey?: string                  // present => skip-when-fresh participant
  currentVersion?(ctx: SetupCtx): string | undefined
  run(ctx: SetupCtx): Promise<PhaseResult>
  dependsOn?: readonly string[]          // ordering + shared-file-write serialization
}
type PhaseResult = {
  id: string
  status: 'created' | 'updated' | 'fresh-skipped' | 'unchanged' | 'skipped' | 'failed'
  detail?: string
  exitImpact?: 'setup-fail' | 'write-fail'  // preserves current per-failure exit codes
}
```

`wp bootstrap` runs `lane==='global'` phases concurrently (respecting
`dependsOn` serial groups, F5/F6). `wp setup` runs `lane==='repo'` phases.
A topo-sort runner schedules ready phases up to a concurrency cap (~4).

---

## Tasks

#### [docs] Task 0.1: Competitive setup-DX research deliverable

**Status:** todo

**Depends:** None

Independent research pass (D4). Write a comparison of how mature CLIs separate
machine-bootstrap from project-init, handle idempotency, and keep repeat-run
output quiet. Targets: `husky init`, `biome init`, `nx`/`turbo` generators,
`shadcn add`, `oclif` topic-commands, `create-t3-app`/`npm init <x>`, `gh`
extension setup. Use Context7/WebFetch for current docs — do not trust memory.
Compare on five axes only: global-vs-repo separation, run-once bootstrap +
staleness gating, verb-surface shape, repeat-run verbosity, "already set up"
handling. Conclude with concrete recommendations for **our final verb names,
flag surface, and the skip-when-fresh window** that later tasks adopt.

**Files:**
- Create: `docs/research/2026-06-14-setup-dx-comparison.md`

**Steps (TDD-N/A, doc task):**
1. Fetch + read current docs for each target CLI.
2. Fill the five-axis comparison table.
3. Write the recommendation section (verb names, flags, freshness window).
4. Run: `wp docs lint docs/research/2026-06-14-setup-dx-comparison.md`

**Acceptance:**
- [ ] All targets covered with cited sources (URLs + retrieval date).
- [ ] Recommendation section names verb/flag/window choices later tasks reference.
- [ ] `wp docs lint` passes.

---

#### [infra] Task 1.1: Freshness state-store + `isFresh` helper

**Status:** todo

**Depends:** None

Generalize gstack's skip-when-fresh gate. A phase records
`{ version?, appliedAt }` under a `freshnessKey`; `isFresh` returns true when
the recorded version matches `currentVersion` **or** `appliedAt` is within the
refresh window (window value from Task 0.1). `--refresh` and existing per-tool
env bypasses (`WP_GSTACK_REFRESH`, etc.) force re-run. Global store path
`~/.webpresso/cache/agent-kit/bootstrap-state.json`. Use the atomic-write helper
from [[2026-06-14-add-atomic-file-write-helper]] for the state file; if that
blueprint has not landed, write a local `writeJsonAtomic` and leave a TODO
referencing it (do not block).

**Files:**
- Create: `src/cli/commands/init/freshness.ts`
- Create: `src/cli/commands/init/freshness.test.ts`

**Steps (TDD):**
1. Write failing test: stale (version mismatch) → not fresh; matching version → fresh; within-window timestamp → fresh; `--refresh` → not fresh.
2. Run: `wp test --file src/cli/commands/init/freshness.test.ts` — verify FAIL
3. Implement minimal helper + state read/write.
4. Run: `wp test --file src/cli/commands/init/freshness.test.ts` — verify PASS
5. Run: `wp lint --file src/cli/commands/init/freshness.ts src/cli/commands/init/freshness.test.ts` and `wp typecheck --file src/cli/commands/init/freshness.ts`

**Acceptance:**
- [ ] Tests cover version-match, window, and `--refresh` bypass.
- [ ] State file written atomically.
- [ ] lint + typecheck pass.

---

#### [infra] Task 1.2: Bounded-concurrency phase runner (topo-sort)

**Status:** todo

**Depends:** None

New runner that takes `SetupPhase[]`, topo-sorts by `dependsOn`, and executes
ready phases concurrently up to a cap (~4). Same-target writers serialize purely
through `dependsOn` (the caller declares the groups in Task 2.5). Build on
`withDeadline`/`pollUntil`; **no global timeout** wraps install workloads
(`no-timeout-as-fix.md`). A failed phase blocks only its dependents and surfaces
its `exitImpact`.

**Files:**
- Create: `src/cli/commands/init/run-phases.ts`
- Create: `src/cli/commands/init/run-phases.test.ts`

**Steps (TDD):**
1. Write failing test: independent phases run concurrently; `dependsOn` enforces order; a failed phase skips dependents; cap is respected.
2. Run: `wp test --file src/cli/commands/init/run-phases.test.ts` — verify FAIL
3. Implement topo-sort + pool.
4. Run: `wp test --file src/cli/commands/init/run-phases.test.ts` — verify PASS
5. Run: `wp lint --file src/cli/commands/init/run-phases.ts src/cli/commands/init/run-phases.test.ts` and `wp typecheck --file src/cli/commands/init/run-phases.ts`

**Acceptance:**
- [ ] Test asserts two same-`dependsOn` phases never overlap (CP=0 guarantee).
- [ ] Failed phase blocks dependents, not siblings.
- [ ] lint + typecheck pass.

---

#### [infra] Task 1.3: `reporter.ts` — single `PhaseResult[]` renderer

**Status:** todo

**Depends:** None

Replace the ~50 inline `switch`/`console.log` arms with one renderer over
`PhaseResult[]`. Output format MUST satisfy the self-consistency contract in
[[2026-06-13-wp-setup-output-guardrail-self-consistency]] (F7) — read that
blueprint's output rules first and mirror them. Preserve the existing summary
shape (`created/identical/overwritten/drifted`) plus the new `fresh-skipped`.

**Files:**
- Create: `src/cli/commands/init/reporter.ts`
- Create: `src/cli/commands/init/reporter.test.ts`

**Steps (TDD):**
1. Write failing test: a mixed `PhaseResult[]` renders the expected summary lines incl. `fresh-skipped`; output passes the guardrail self-consistency assertion.
2. Run: `wp test --file src/cli/commands/init/reporter.test.ts` — verify FAIL
3. Implement renderer.
4. Run: `wp test --file src/cli/commands/init/reporter.test.ts` — verify PASS
5. Run: `wp lint --file src/cli/commands/init/reporter.ts src/cli/commands/init/reporter.test.ts` and `wp typecheck --file src/cli/commands/init/reporter.ts`

**Acceptance:**
- [ ] Renders every `PhaseResult.status` incl. `fresh-skipped`.
- [ ] Asserted against the output-guardrail contract.
- [ ] lint + typecheck pass.

---

#### [infra] Task 1.4: `SetupPhase` types + empty registry skeleton

**Status:** todo

**Depends:** None

Define `SetupPhase`, `PhaseResult`, `Lane`, `SetupCtx` types and two empty
phase-list modules so global/repo population (2.1/2.2) touch **different files**
(no conflict). No phase bodies yet.

**Files:**
- Create: `src/cli/commands/init/phases/types.ts`
- Create: `src/cli/commands/init/phases/global.ts` (exports `[]` placeholder)
- Create: `src/cli/commands/init/phases/repo.ts` (exports `[]` placeholder)
- Create: `src/cli/commands/init/phases/types.test.ts`

**Steps (TDD):**
1. Write failing test asserting the type contract compiles + `global`/`repo` arrays are importable.
2. Run: `wp test --file src/cli/commands/init/phases/types.test.ts` — verify FAIL
3. Implement types + placeholders.
4. Run: `wp test --file src/cli/commands/init/phases/types.test.ts` — verify PASS
5. Run: `wp lint --file src/cli/commands/init/phases/*.ts` and `wp typecheck --file src/cli/commands/init/phases/types.ts`

**Acceptance:**
- [ ] Types compile; both phase arrays importable.
- [ ] lint + typecheck pass.

---

#### [infra] Task 2.1: Populate global-lane phases (wrap existing scaffolders)

**Status:** todo

**Depends:** Task 1.1, Task 1.4

Wrap existing global scaffolders as `SetupPhase` entries in `phases/global.ts`,
reusing their `ensure*` functions verbatim (behaviour-preserving). Global lane:
`codex-cli`, `omx`, `omc`, `agent-kit-global`, `claude-user-plugin`,
`codex-user-plugin`, `gstack`, `rtk-install`, `workspace-config`
(`~/.agent/workspace.yaml`), `codex-webpresso-mcp`, `codex-context7-mcp`,
`codex-playwright-mcp`, and the **global** agent-hooks facets
(`normalizeGlobalCodexHooksFile`, `trustCodexPresetHooksForUser` — F8). Attach
`freshnessKey`/`currentVersion` to omx, agent-kit-global, plugins. Map each
result kind to a `PhaseResult` + `exitImpact` preserving today's exit codes.

**Files:**
- Modify: `src/cli/commands/init/phases/global.ts`
- Create: `src/cli/commands/init/phases/global.test.ts`

**Steps (TDD):**
1. Write failing test: every global phase has `lane:'global'`, an `enabled` gate, and CI/env gating matches current behaviour; omx/agent-kit-global carry a `freshnessKey`.
2. Run: `wp test --file src/cli/commands/init/phases/global.test.ts` — verify FAIL
3. Implement entries (reuse existing `ensure*`).
4. Run: `wp test --file src/cli/commands/init/phases/global.test.ts` — verify PASS
5. Run: `wp lint --file src/cli/commands/init/phases/global.ts ...test.ts` and `wp typecheck --file src/cli/commands/init/phases/global.ts`

**Acceptance:**
- [ ] All listed global phases present with correct lane + gating.
- [ ] Freshness keys on omx/agent-kit-global/plugins.
- [ ] lint + typecheck pass.

---

#### [infra] Task 2.2: Populate repo-lane phases (wrap existing scaffolders)

**Status:** todo

**Depends:** Task 1.4

Wrap repo scaffolders as `SetupPhase` entries in `phases/repo.ts`: `preflight`,
`catalog` (`scaffoldAgent`), `agent-rules`, `agent-skills`, `catalog-ignore`,
`gitignore`, `postinstall-pin`, `base-kit`, `docs`, `blueprints`, `monorepo-nav`,
`unified-sync`, `agent-hooks` (repo `.claude/settings.json` + `.codex/hooks.json`
facet + `trustCodexWebpressoHooksForRepo`), `audit-hooks`, `opencode-plugin`,
`claude-rules`, `subagents`, `agents-md`, `config`, `vision`, `lore-commits`,
`example-skill`, **`claude-playwright-mcp` + `claude-context7-mcp` (`<repoRoot>/.mcp.json`,
F5)**, `host-visibility`, `runtime-check`. Preserve ordering: `agent-hooks` after
`unified-sync` (reads SKILL.md).

**Files:**
- Modify: `src/cli/commands/init/phases/repo.ts`
- Create: `src/cli/commands/init/phases/repo.test.ts`

**Steps (TDD):**
1. Write failing test: every repo phase has `lane:'repo'`; `agent-hooks` `dependsOn` includes `unified-sync`; Claude MCP phases are repo-lane.
2. Run: `wp test --file src/cli/commands/init/phases/repo.test.ts` — verify FAIL
3. Implement entries.
4. Run: `wp test --file src/cli/commands/init/phases/repo.test.ts` — verify PASS
5. Run: `wp lint --file src/cli/commands/init/phases/repo.ts ...test.ts` and `wp typecheck --file src/cli/commands/init/phases/repo.ts`

**Acceptance:**
- [ ] All listed repo phases present; Claude MCP correctly repo-lane.
- [ ] `unified-sync → agent-hooks` ordering preserved.
- [ ] lint + typecheck pass.

---

#### [backend] Task 2.3: Skip-when-fresh in `ensureAgentKitGlobal`

**Status:** todo

**Depends:** Task 1.1

Gate `vp install -g` on `isFresh` (published agent-kit version vs recorded; or
within window). `--refresh` bypasses. Return a new `agent-kit-global-fresh-skipped`
kind. Keep all existing opt-outs (`WP_SKIP_AUTO_INSTALL`, `WP_FORCE_SOURCE`,
no-vp, dry-run). Record version on successful install.

**Files:**
- Modify: `src/cli/commands/init/scaffolders/agent-kit-global/index.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-kit-global/index.test.ts`

**Steps (TDD):**
1. Write failing test: fresh state → skipped (no spawn); stale/`--refresh` → spawns `vp install -g`.
2. Run: `wp test --file src/cli/commands/init/scaffolders/agent-kit-global/index.test.ts` — verify FAIL
3. Implement gate using the Task 1.1 helper (DI seam already present).
4. Run same test — verify PASS
5. Run: `wp lint --file .../agent-kit-global/index.ts ...test.ts` and `wp typecheck --file .../agent-kit-global/index.ts`

**Acceptance:**
- [ ] No `vp install -g` spawn when fresh; spawns on stale/`--refresh`.
- [ ] Existing opt-outs intact.
- [ ] lint + typecheck pass.

---

#### [backend] Task 2.4: Skip-when-fresh in the `omx` scaffolder

**Status:** todo

**Depends:** Task 1.1

Gate `spawn('omx',['setup',...])` (`omx/index.ts:398`) on `isFresh` (omx version
/ catalog baseline vs recorded; or window). `--refresh` bypasses. New
`omx-fresh-skipped` kind. Keep dry-run/not-found/spawn-failed paths and the
bounded `PROBE_TIMEOUT_MS` version probe. Record baseline on success.

**Files:**
- Modify: `src/cli/commands/init/scaffolders/omx/index.ts`
- Modify: `src/cli/commands/init/scaffolders/omx/index.test.ts`

**Steps (TDD):**
1. Write failing test: fresh → no `omx setup` spawn; stale/`--refresh` → spawns.
2. Run: `wp test --file src/cli/commands/init/scaffolders/omx/index.test.ts` — verify FAIL
3. Implement gate (use existing `spawn` DI seam).
4. Run same test — verify PASS
5. Run: `wp lint --file .../omx/index.ts ...test.ts` and `wp typecheck --file .../omx/index.ts`

**Acceptance:**
- [ ] No `omx setup` when fresh; runs on stale/`--refresh`.
- [ ] Probe stays bounded; install stays unbounded.
- [ ] lint + typecheck pass.

---

#### [infra] Task 2.5: Shared-file serial groups (`dependsOn`) + atomic writes

**Status:** todo

**Depends:** Task 1.2, Task 1.4

Declare `dependsOn` edges so same-target writers serialize (F5/F6):
**global** `~/.codex/config.toml` group — `omx → codex-webpresso-mcp →
codex-context7-mcp → codex-playwright-mcp`; **repo** `<repoRoot>/.mcp.json`
group — `claude-playwright-mcp → claude-context7-mcp`. Route those writers
through the atomic-write helper ([[2026-06-14-add-atomic-file-write-helper]]).

**Files:**
- Modify: `src/cli/commands/init/phases/global.ts`
- Modify: `src/cli/commands/init/phases/repo.ts`
- Create: `src/cli/commands/init/phases/serial-groups.test.ts`

**Steps (TDD):**
1. Write failing test: the runner never schedules two `config.toml` writers concurrently; same for `.mcp.json` (CP=0).
2. Run: `wp test --file src/cli/commands/init/phases/serial-groups.test.ts` — verify FAIL
3. Add `dependsOn` edges + atomic writes.
4. Run same test — verify PASS
5. Run: `wp lint --file src/cli/commands/init/phases/*.ts` and `wp typecheck --file src/cli/commands/init/phases/global.ts`

**Acceptance:**
- [ ] Concurrency test proves no overlapping writes to a shared target.
- [ ] Shared-file writers use atomic write.
- [ ] lint + typecheck pass.

---

#### [backend] Task 3.1: `wp bootstrap` verb (global-lane runner)

**Status:** todo

**Depends:** Task 1.2, Task 2.1, Task 2.3, Task 2.4, Task 2.5

Add `'bootstrap'` to `SUPPORTED_COMMANDS` and a dispatch case in `cli.ts`. New
`commands/bootstrap/index.ts` registers the verb and runs `phases/global.ts`
through the Task 1.2 runner + Task 1.3 reporter. Flags: `--refresh`, `--dry-run`,
`--yes`, `--host`, `--project`, `--cwd`. **No self-repo guard** (safe inside
agent-kit — F2 fix part 1). Do NOT touch `src/cli/bootstrap.ts`/`bootstrapAk`.

**Files:**
- Create: `src/cli/commands/bootstrap/index.ts`
- Create: `src/cli/commands/bootstrap/index.test.ts`
- Modify: `src/cli/cli.ts` (verb list + dispatch)

**Steps (TDD):**
1. Write failing test: `wp bootstrap` runs only `lane:'global'` phases; second run reports `fresh-skipped`; `--refresh` re-runs; runs inside an agent-kit-named repo without error.
2. Run: `wp test --file src/cli/commands/bootstrap/index.test.ts` — verify FAIL
3. Implement verb + runner wiring.
4. Run same test — verify PASS
5. Run: `wp lint --file src/cli/commands/bootstrap/index.ts ...test.ts src/cli/cli.ts` and `wp typecheck --file src/cli/commands/bootstrap/index.ts`

**Acceptance:**
- [ ] Global lane only; skip-when-fresh on repeat; `--refresh` forces.
- [ ] Succeeds inside agent-kit (no `--source-maintenance`).
- [ ] No reference to existing `bootstrap.ts`/`bootstrapAk`.
- [ ] lint + typecheck pass.

---

#### [backend] Task 3.2: Slim `wp setup` to repo lane + back-compat path

**Status:** todo

**Depends:** Task 2.2, Task 1.3, Task 3.1

Rewrite `runInit` to run `phases/repo.ts` through the runner + reporter
(replacing the ~990-line chain). Back-compat (D2 breaking change): if
bootstrap-state shows the machine was never bootstrapped, print a one-line
directive; add `--bootstrap` convenience flag that runs the global lane then the
repo lane. Keep all existing `setup`/`init` flags. `init` stays an alias.

**Files:**
- Modify: `src/cli/commands/init/index.ts`
- Modify: `src/cli/commands/init/index.test.ts`

**Steps (TDD):**
1. Write failing test: `wp setup` runs only repo phases (no `vp install -g`, no `omx setup`); un-bootstrapped machine prints the directive; `--bootstrap` runs both lanes.
2. Run: `wp test --file src/cli/commands/init/index.test.ts` — verify FAIL
3. Implement repo-lane runner + back-compat.
4. Run same test — verify PASS
5. Run: `wp lint --file src/cli/commands/init/index.ts ...test.ts` and `wp typecheck --file src/cli/commands/init/index.ts`

**Acceptance:**
- [ ] `wp setup` performs no global installs.
- [ ] Directive + `--bootstrap` flag work.
- [ ] All prior `setup`/`init` flags preserved.
- [ ] lint + typecheck pass.

---

#### [backend] Task 3.3: Self-repo guard → repo lane only

**Status:** todo

**Depends:** Task 3.1, Task 3.2

Move `isAgentKitTemplateSourceRepo` guard (`index.ts:357–368`) into the repo-lane
entry only. `wp setup` inside agent-kit still refuses without
`--source-maintenance`; `wp bootstrap` is unaffected (F2 fix part 2).

**Files:**
- Modify: `src/cli/commands/init/index.ts`
- Modify: `src/cli/commands/init/index.test.ts`

**Steps (TDD):**
1. Write failing test: `wp setup` in agent-kit refuses (needs `--source-maintenance`); `wp bootstrap` in agent-kit succeeds.
2. Run: `wp test --file src/cli/commands/init/index.test.ts` — verify FAIL
3. Move the guard.
4. Run same test — verify PASS
5. Run: `wp lint --file src/cli/commands/init/index.ts` and `wp typecheck --file src/cli/commands/init/index.ts`

**Acceptance:**
- [ ] setup guarded, bootstrap unguarded, in agent-kit.
- [ ] lint + typecheck pass.

---

#### [backend] Task 4.1: Audit + update `wp setup` call sites

**Status:** todo

**Depends:** Task 3.1, Task 3.2

Update every call site for the split (F9): `package.json` `setup:agent`,
`scaffold-base-kit.ts:236` injected `scripts['setup:agent']`, preflight/
detect-consumer hint strings, any CI workflow, plugin postinstall. Postinstall
should call `wp bootstrap` (idempotent) where it previously relied on the
all-in-one flow.

**Files:**
- Modify: `package.json`
- Modify: `src/cli/commands/init/scaffold-base-kit.ts` (+ its test)
- Modify: `src/cli/commands/init/preflight.ts`, `src/cli/commands/init/detect-consumer.ts` (hint strings)
- Modify: relevant `.github/workflows/*.yml` if any invoke `wp setup`

**Steps (TDD):**
1. Write failing test: `scaffold-base-kit` emits the corrected script(s); hint strings reference the right verb.
2. Run: `wp test --file src/cli/commands/init/scaffold-base-kit.test.ts` — verify FAIL
3. Update call sites.
4. Run same test — verify PASS
5. Run: `wp lint --file <changed files>` and `wp typecheck --file <changed .ts>`

**Acceptance:**
- [ ] No stale all-in-one `wp setup` assumptions remain.
- [ ] Postinstall/CI updated.
- [ ] lint + typecheck pass.

---

#### [qa] Task 4.2: End-to-end coverage for the split

**Status:** todo

**Depends:** Task 3.1, Task 3.2, Task 3.3

Update `init.e2e.test.ts`, `init.integration.test.ts`,
`init.presets.integration.test.ts`, `host-smoke.e2e.test.ts` for the lane split;
add a `bootstrap.e2e.test.ts`: cold run installs; second run skip-when-fresh;
`--refresh` re-runs; `wp setup` repo-only; agent-kit guard behaviour. Add heavy
subprocess specs to the Stryker exclusion list per `agent-guide.md`.

**Files:**
- Modify: `src/cli/commands/init/init.e2e.test.ts`, `init.integration.test.ts`, `init.presets.integration.test.ts`, `host-smoke.e2e.test.ts`
- Create: `src/cli/commands/bootstrap/bootstrap.e2e.test.ts`
- Modify: `vitest.stryker.config.ts` (exclusions)

**Steps (TDD):**
1. Write the e2e specs (fresh/skip/refresh, repo-only, guard).
2. Run: `wp test --file src/cli/commands/bootstrap/bootstrap.e2e.test.ts` — verify it exercises real behaviour.
3. Update existing init specs for the split.
4. Run: `wp_qa` (bookend) — all green.

**Acceptance:**
- [ ] bootstrap fresh/skip/refresh proven by e2e.
- [ ] setup repo-only + guard proven.
- [ ] Stryker exclusions added for heavy specs.
- [ ] `wp_qa` green.

---

#### [docs] Task 4.3: Changeset, CHANGELOG, cross-plan notes

**Status:** todo

**Depends:** Task 3.2

Add a changeset documenting the breaking `wp setup` contract change + new
`wp bootstrap` verb + migration (`--bootstrap`, directive). Add dated
architecture notes cross-referencing
[[2026-06-13-wp-setup-output-guardrail-self-consistency]] (reporter alignment),
[[2026-06-14-add-atomic-file-write-helper]] (consumed), and
[[2026-06-13-single-skill-channel-per-host]] (shared surface).

**Files:**
- Create: `.changeset/<slug>.md`
- Modify: `blueprints/draft/2026-06-13-wp-setup-output-guardrail-self-consistency.md` (cross-ref note)

**Steps (TDD-N/A, doc task):**
1. Write changeset (minor/major per the breaking-change policy in `changeset-release.md`).
2. Add cross-plan note(s).
3. Run: `wp docs lint .changeset/<slug>.md` (and blueprint-lifecycle audit).

**Acceptance:**
- [ ] Changeset describes the breaking change + migration.
- [ ] Cross-plan references added in both directions.
- [ ] `wp audit blueprint-lifecycle` passes.

---

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
|------|-------|--------------|----------------|--------|
| **Wave 0** | 0.1, 1.1, 1.2, 1.3, 1.4 | None | 5 agents | XS–S |
| **Wave 1** | 2.1, 2.2, 2.3, 2.4, 2.5 | Wave 0 (partial) | 5 agents | S–M |
| **Wave 2** | 3.1, 3.2 | Wave 1 | 2 agents (3.2 deps 3.1) | M |
| **Wave 3** | 3.3, 4.1, 4.3 | Wave 2 | 3 agents | S |
| **Wave 4** | 4.2 | Wave 3 | 1 agent | M |
| **Critical path** | 1.4 → 2.1 → 3.1 → 3.2 → 4.2 | — | 5 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
|--------|-------------------|--------|--------|
| RW0 | Ready tasks in Wave 0 | ≥ agents/2 | 5 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 16 / 5 = 3.2 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | ≈23 / 16 = 1.44 |
| CP | same-file overlaps per wave | 0 | 0 (phases/global.ts & repo.ts split; cli.ts owned by 3.1; 3.2 deps 3.1) |

**Parallelization score: A** — RW0=5, CPR=3.2, CP=0.

> CP note: Tasks 2.1/2.5 and 2.2/2.5 share `phases/global.ts`/`phases/repo.ts`.
> 2.5 declares `Depends: 1.2,1.4` but is sequenced **after** 2.1/2.2 in Wave 1
> ordering to avoid same-file overlap — runner serializes via file ownership;
> if executed strictly in parallel, add `2.5 Depends: 2.1, 2.2`.

## Edge Cases

| Case | Sev | Handling |
|------|-----|----------|
| Concurrent writes to `~/.codex/config.toml` | CRITICAL (F5/F6) | serial group + atomic write (Task 2.5) |
| Concurrent writes to `<repoRoot>/.mcp.json` | HIGH (F5) | repo serial group (Task 2.5) |
| agent-hooks global vs repo facet | MEDIUM (F8) | global normalization+trust = global lane; repo settings = repo lane (2.1/2.2) |
| `wp setup` on never-bootstrapped machine | MEDIUM | directive + `--bootstrap` (Task 3.2) |
| Stale tool after skip-when-fresh | MEDIUM | bounded refresh window + `--refresh` + per-tool env bypasses |
| New `bootstrap` name vs `bootstrap.ts` | HIGH (F2) | new module `commands/bootstrap/`, never reuse `bootstrapAk` |
| Reporter vs output-guardrail blueprint | MEDIUM (F7) | align format, cross-ref (1.3, 4.3) |

## Risks

| Risk | Sev | Mitigation |
|------|-----|------------|
| Breaking the all-in-one `wp setup` contract | HIGH | back-compat directive + `--bootstrap` + changeset + call-site audit (3.2, 4.1, 4.3) |
| Concurrency races on shared user/repo config | HIGH | `dependsOn` serial groups + atomic writes + concurrency test (2.5, 1.2) |
| Skip-when-fresh hides a needed update | MEDIUM | window + `--refresh` + retained env bypasses (1.1) |
| Behaviour drift while relocating scaffolders | MEDIUM | reuse `ensure*` verbatim; per-phase tests assert prior gating (2.1, 2.2) |
| Scope creep into a rewrite | MEDIUM | registry is a thin wrapper; scaffolders untouched except 2.3/2.4 freshness |

## Refinement Summary

| Metric | Value |
|--------|-------|
| Findings total | 10 (F1–F10) |
| Critical | 1 (F5) |
| High | 4 (F2, F3, F4, F6) |
| Medium | 4 (F7, F8, F9 + window) |
| Low | 1 (F10) |
| Fixes applied to plan | 10/10 |
| Cross-plans referenced | 4 |
| Parallelization score | A (RW0=5) |
| Critical path | 5 waves |
| Max parallel agents | 5 |
| Total tasks | 16 |
| Blueprint compliant | 16/16 |

## Status

**draft — not for execution.** Fact-checked against the live `src/cli/commands/init`
tree on 2026-06-14. Promote with `wp blueprint promote` only after Task 0.1
research confirms verb/flag/window choices and the two referenced helper
blueprints' status is settled.
