---
type: blueprint
status: planned
complexity: S
created: '2026-05-06'
last_updated: '2026-05-06'
progress: '0% (planned — peer-plugin scaffolder spec + perf budget tightened from peer-plugin-architecture.md analysis)'
depends_on:
  - compact-qa-output-filters
tags:
  - agent-kit
  - scaffolder
  - peer-plugin
  - rtk
  - context-window
  - dx
---

# Integrate rtk as a Peer Plugin

**Goal:** Wire [rtk-ai/rtk](https://github.com/rtk-ai/rtk) into agent-kit as a
**peer plugin** with the same shape context-mode is in today: a sacrosanct
prefix, an independent PreToolUse hook entry, and a fallback-only routing rule
in the catalog. Each plugin owns one lane and never reaches into another's:

- **agent-kit** owns `ak_*` for QA tooling (test, lint, typecheck, qa, audit).
- **context-mode** owns `ctx_*` for search / fetch / execute over large output.
- **rtk** owns shell-tool output filtering for the ~100 commands neither of the
  above wraps — `git`, `gh`, `jira`, `glab`, `gcloud`, `kubectl`, `cargo`,
  `pytest`, `rspec`, `golangci-lint`, `ruff`, `bundle`, `dotnet`, etc.

agent-kit remains the **conductor** (it scaffolds the others), but holds no
authority over either neighbour's prefix.

## Product wedge anchor

- **Stage outcome:** Extend the peer-plugin pattern (already proven for
  context-mode — see [`context-mode-routing.md`](../../../catalog/agent/rules/context-mode-routing.md))
  to cover the long tail of shell tools the agent runs. Per [`VISION.md` § North Star](../../../VISION.md):
  *"The `ak_*` MCP tools are now summary-first and context-friendly … context-mode
  owns its own `ctx_*` nudging when installed; and `.omx` remains runtime/state
  rather than a direct hook surface."* This blueprint adds rtk as the third
  named peer plugin in that sentence, closing the long-tail shell-output gap
  without agent-kit shipping per-tool filter code.
- **Consuming surface:** `ak setup --with rtk` in `ozby/ingest-lens` — same
  invocation shape as `--with monorepo-navigation,tanstack-query` already
  documented in the ingest-lens agent-kit setup docs. After this blueprint lands,
  ingest-lens can `pnpm ak setup --with rtk`
  and immediately get compact `git status`, `gh pr list`, `kubectl get pods`,
  `cargo build` output without any agent-kit-side per-tool work.
- **New user-visible capability:** An engineer's AI session running `git status`,
  `gh issue list`, `kubectl logs`, or `cargo test` via Bash sees
  rtk-filtered output (60–90% smaller per rtk's published claims) **and**
  receives a `rtk git status` redirect via PreToolUse, without agent-kit
  shipping or maintaining filters for any of those tools.

## Why

The parent blueprint
[`compact-qa-output-filters`](../compact-qa-output-filters/_overview.md)
explicitly punts the long-tail tools to rtk in its **Out of scope** section:

> Replacing rtk for non-quality-engine commands (git, ls, find, etc.).
> Recommend rtk as a downstream layer.

That blueprint reasons through *why* agent-kit should own only the QA chokepoint
(MCP tool handler outputs) and not reimplement filters for git / gh / kubectl
/ cargo / pytest / rspec / golangci / ruff / dotnet / etc.: the surface is
~100 tools wide, rtk is a Rust binary with mature transforms across that
surface, and lifting rtk's filter code into TS would burn maintenance and
duplicate a working upstream.

This blueprint is the **constructive half** of that punt. Instead of "we
recommend rtk," it ships the wiring: a `--with rtk` preset, a routing-nudge
rule, and a doctor row, all modeled after the existing `--with omx`,
`--with gstack`, and the `context-mode-routing.md` rule.

The existing precedent is concrete: in `ozby/ingest-lens`, OMX's native
PreToolUse hook (`oh-my-codex/dist/scripts/codex-native-hook.js`) and
`ak-pretool-guard` already coexist as **two independent entries** under the
same `PreToolUse` event — they compose, neither wraps the other (verified in
[`compact-qa-output-filters/_overview.md` § Why](../compact-qa-output-filters/_overview.md)).
This blueprint adds rtk as the **third** entry in that same composition.

## Vision & philosophy alignment

Cross-checked against [`VISION.md`](../../../VISION.md), [`AGENTS.md`](../../../AGENTS.md),
the existing [`context-mode-routing.md`](../../../catalog/agent/rules/context-mode-routing.md)
rule, the parent [`compact-qa-output-filters`](../compact-qa-output-filters/_overview.md)
blueprint, and the repo glossary/invariants on 2026-05-06.

| Vision principle / invariant | Alignment in this blueprint |
| --- | --- |
| **North Star** ("`ak_*` MCP tools summary-first; context-mode owns `ctx_*` nudging") | Direct extension. Adds rtk as a third named peer with the same shape: sacrosanct prefix (`rtk *` shell-tool wrapping), independent PreToolUse hook, fallback-only routing rule. |
| **Softest sufficient boundary — defer to upstream specialists, don't reimplement** | **The defining alignment for this blueprint.** rtk is a maintained MIT-licensed Rust binary covering ~100 shell tools. We install their binary via `brew install rtk-ai/rtk/rtk`; we do not lift any of their filter code into TS. The agent-kit surface added here is one scaffolder + one rule + one doctor row. Softer than: lifting rtk filters, building a TS port, writing per-tool transforms for git/gh/kubectl/cargo/pytest/rspec/etc. |
| **Catalog is law** | New routing rule lands at `catalog/agent/rules/rtk-routing.md` first (canonical for shipping). `.agent/rules/` is the synced copy via `ak symlink sync`. No hand-edits to per-IDE surfaces. |
| **Multi-IDE distribution is zero-maintenance** | rtk's `rtk init -g --auto-patch` writes a single PreToolUse hook into `.claude/settings.json` and `.codex/hooks.json`. Every IDE that consumes those settings (Claude Code, Codex/OMX) gets rtk filtering automatically. agent-kit's scaffolder just chains rtk's installer — no per-IDE adapter code. |
| **Fail loudly, never silently degrade** | Scaffolder returns explicit result kinds (`rtk-ok`, `rtk-not-found`, `rtk-init-failed`) matching the existing `EnsureOmxResult` / `EnsureGstackResult` discriminated unions. `ak doctor` surfaces a missing rtk binary as a hard signal when `--with rtk` was requested. |
| **Surfaces load at the right time** | The new `rtk-routing.md` rule is path-scoped (`paths: ['**/*']`) and fallback-only — same shape as `context-mode-routing.md`. It does not duplicate guidance when rtk has already injected its own routing block. |
| **Vision boundaries — IN scope** | "Multi-IDE symlinker," "`ak setup` (scaffold)," and quality gates are explicitly listed in [`VISION.md` § Boundaries](../../../VISION.md) as in-scope. This blueprint touches all three. |
| **Vision boundaries — OUT of scope** | We do not run rtk; we install its binary and let it run itself. We add zero filter code to agent-kit. We do not author prompts. We do not modify rtk's behaviour. |
| **Anti-pattern: hand-edit generated `.claude/` / `.codex/`** | Avoided. rtk's `rtk init -g --auto-patch` is the *upstream* tool that mutates `.claude/settings.json` and `.codex/hooks.json` — the same pattern by which OMX and agent-kit's `ak setup` already mutate those files via their own scaffolders. agent-kit does not hand-edit those files in this blueprint. |
| **Anti-pattern: worktree-local `.claude/` isolation** | N/A — scaffolder operates on the consumer repo root. |
| **Public package isolation invariant** | Zero `@webpresso/*` runtime or dev deps added. The new scaffolder uses only `node:child_process` (`spawnSync`), exactly like the omx and gstack scaffolders. |
| **Catalog content is canonical once shipped** | One new catalog rule (`catalog/agent/rules/rtk-routing.md`) follows the canonical-edit-in-`catalog/`-then-sync rhythm. No hand-edits to `.agent/`. |
| **Testing philosophy — TDD Iron Law** | Each task below has explicit red→green TDD steps with `ak test --file <path>` cycles before implementation, mirroring `omx/index.test.ts` and `gstack/index.test.ts`. |
| **Testing philosophy — integration-first** | Verification gate runs `ak setup --with rtk` end-to-end on a fresh fixture repo, then exercises a real Bash `git status` invocation through the resulting hook chain. The unit tests for the scaffolder are secondary. |
| **Testing philosophy — E2E never call internal APIs** | The verification gate invokes `ak setup --with rtk` via the CLI surface and Bash via the shell, not by importing scaffolder functions directly. |
| **Ubiquitous Language — Reference consumer** | `ozby/ingest-lens` is named as the integration surface (per glossary) — `pnpm ak setup --with rtk` is the canonical post-merge smoke-test command. |
| **Ubiquitous Language — Audit (non-mutating)** | The new doctor row is non-mutating — it inspects `$PATH` for `rtk` and prints a hint. It never installs, repairs, or modifies user state. |
| **Roadmap completion rules** | Sits as a follow-up to the **completed** [`webpresso-public-extraction-roadmap`](../../../../monorepo/webpresso/blueprints/completed/webpresso-public-extraction-roadmap/_overview.md), per its rule 3 ("agent-kit roadmap UX/audit improvements are explicitly scoped as separate blueprints"). Does not reopen any completed wave. |

## License confirmation

rtk is **MIT-licensed** — verified at <https://github.com/rtk-ai/rtk> in
`Cargo.toml`. Compatible with installing as a third-party binary in users'
repos via `brew install rtk`.

**We do not lift their code.** We install their binary and let rtk run as an
independent peer process, exactly as we already install `omx` (via
`npm install -g oh-my-codex`) and `gstack` (via `git clone`).

## Scope

### A. New `--with rtk` scaffolder preset

**Path:** `src/cli/commands/init/scaffolders/rtk/index.ts`

**Pattern:** Mirrors `src/cli/commands/init/scaffolders/omx/index.ts` line for
line. Same `EnsureRtkInput` / `EnsureRtkResult` shape with a discriminated
union of result kinds.

**Behaviour:**

1. If `options.dryRun` → return `{ kind: 'rtk-skipped-dry-run' }`.
2. Probe `rtk --version` via injected `spawnSync`.
3. If absent: install with `brew install rtk` (gated on macOS;
   Linux falls back to printing the [rtk install hint](https://github.com/rtk-ai/rtk?tab=readme-ov-file#installation)
   without erroring — exit code is preserved as `rtk-not-found`).
4. Re-probe `rtk --version`. If still absent → `{ kind: 'rtk-not-found', hint }`.
5. Run `rtk init -g --auto-patch` from the consumer repo root. This is rtk's
   own idempotent installer — for Claude-style hook surfaces it adds an entry
   under `PreToolUse` in `.claude/settings.json` *alongside* the existing
   `ak-pretool-guard` and OMX entries (does not replace them). As of May 2026,
   Codex is treated upstream as a prompt/instructions lane rather than a
   hook-rewrite lane, so this blueprint does **not** require RTK entries in
   `.codex/hooks.json`.
6. Set `RTK_TELEMETRY_DISABLED=1` in the resulting hook entry (privacy default;
   consumer can override in their own repo).

**Files:**

- Create: `src/cli/commands/init/scaffolders/rtk/index.ts`
- Create: `src/cli/commands/init/scaffolders/rtk/index.test.ts` (DI-injected
  `spawnSync` covering all result kinds, parity with `omx/index.test.ts`).

### B. New routing rule

**Path:** `catalog/agent/rules/rtk-routing.md`

**Pattern:** Mirrors `catalog/agent/rules/context-mode-routing.md` shape
exactly (verified content above):

- `paths: ['**/*']` frontmatter.
- Fallback-only header: "if SessionStart already injected … or rtk has
  already injected its own routing block, follow that and do not duplicate it."
- Ownership boundary section that codifies the three lanes:
  - agent-kit owns `ak_*` for QA tools.
  - context-mode owns `ctx_*` for large-output search / fetch / execute.
  - rtk owns shell-tool output filtering for the rest (git, gh, kubectl,
    cargo, pytest, rspec, etc.).
- Hard rules: never reimplement upstream filters; never wrap rtk's prefix.

**Files:**

- Create: `catalog/agent/rules/rtk-routing.md`
- Run: `ak symlink sync` (propagates to `.agent/rules/rtk-routing.md` and
  per-IDE surfaces).
- Run: `ak audit catalog-drift` (verifies sync).

### C. New `ak doctor` row

**Path:** `src/hooks/doctor.ts` (extend `HOOK_BINS` and check chain) or a new
sibling check function `checkRtkOnPath()`.

**Behaviour:** Inspect `$PATH` for `rtk`. If present → `{ ok: true, detail: 'rtk vX.Y.Z' }`.
If absent **and** the consumer's `ak setup` was invoked with `--with rtk`
(detected via a marker the scaffolder writes — e.g. `.agent/.rtk-requested`
or a `peerPlugins.rtk: true` field in agent-kit's persisted scaffold state) →
`{ ok: false, detail: 'rtk requested via --with rtk but not on PATH; brew install rtk-ai/rtk/rtk' }`.
If absent and not requested → omit the row (no false-positive noise for repos
that don't use rtk).

**Files:**

- Modify: `src/hooks/doctor.ts`
- Modify: `src/hooks/doctor.test.ts`

### D. Documentation cross-links

- Update `catalog/agent/rules/context-mode-routing.md` § Ownership boundary to
  add the rtk lane (mirroring the new `rtk-routing.md` § Ownership boundary).
  Same canonical-edit-then-sync rhythm.
- Keep `compact-qa-output-filters/_overview.md` § Related linked to this
  planned follow-up.

## Performance & efficiency

Source-of-truth for the numbers and rules in this section is the architectural
analysis at
[`compact-qa-output-filters/__poc__/peer-plugin-architecture.md`](../compact-qa-output-filters/__poc__/peer-plugin-architecture.md).
Cite that file when re-evaluating any choice below.

### Measured fork costs (per Bash invocation)

| Hook | Runtime | Median per call | Source |
| --- | --- | --- | --- |
| `ak-pretool-guard` | Bun | **46ms** | verified |
| context-mode `pretooluse.mjs` | Node | **91ms** | verified |
| rtk binary | Rust | **~5ms** | extrapolated from typical Rust binary cold-start |

**Three-peer chain worst case:** ~140ms sequential, ~91ms if Claude Code
parallelizes hooks for the same event.

**Hook chain budget gate:** median ≤ **150ms** per Bash call after install.
Treat regressions above 150ms as a failure of this blueprint's contract — file
upstream against the offender, do not paper over in agent-kit.

### Composition diagram

```
PreToolUse(Bash) →
  rtk-rewrite.sh + rtk binary  (~5ms,  owns: git/gh/cargo/kubectl/...)
  ak-pretool-guard             (~46ms, owns: ak_* dev-workflow)
  context-mode pretooluse.mjs  (~91ms, owns: ctx_* nudging + cache injection)
```

Each peer owns its prefix and never reaches into another's. The chain is
flat — no peer wraps, dispatches to, or proxies for another.

### `RTK_HOOK_EXCLUDE_COMMANDS` configuration

When `ak setup --with rtk` runs, the scaffolder MUST populate rtk's exclude
list with the dev-routing prefixes that `ak-pretool-guard` already denies, so
rtk skips redundant forks on those commands.

The exclude list:

```
pnpm test
vitest
oxlint
tsc --noEmit
pnpm qa
just qa
pnpm lint
just lint
pnpm typecheck
just typecheck
pnpm check-types
```

The rtk binary reads this list from `Config::load().hooks.exclude_commands` —
verified at
<https://github.com/rtk-ai/rtk/blob/master/src/hooks/rewrite_cmd.rs#L24>.

The scaffolder writes these into rtk's config (or the env-var equivalent
`RTK_HOOK_EXCLUDE_COMMANDS`, comma-separated) at the same step it sets
`RTK_TELEMETRY_DISABLED=1` (Scope § A.6).

### Hook ordering recommendation

Patch `~/.claude/settings.json` so `rtk-rewrite.sh` fires **before**
`ak-pretool-guard` if Claude Code respects insertion order. Rationale: rtk
is the cheapest hook (~5ms) and most likely to deny early on long-tail
shell tools; ordering it first improves partial-output UX.

**This is for UX only, not correctness.** Both hooks still need to run on
every Bash call. If Claude Code does not respect insertion order, the chain
is still correct — just slightly less responsive on rtk-owned redirects.

### `RTK_TELEMETRY_DISABLED=1`

Set in the env section of the patched `PreToolUse` entry written by
`rtk init -g --auto-patch`. Privacy default; consumer can override in their
own repo. Tracked alongside the exclude list in a single scaffolder constant
so upstream env-var renames are a one-line bump (see Risks § telemetry drift).

### Hard architectural rules

The following are non-negotiable for this blueprint and any follow-ups. Each
maps to a specific anti-pattern from the analysis.

1. **Don't merge agent-kit's hook with rtk's.** Each plugin owns its prefix;
   merging them couples release cadences and shadows ownership.
2. **Don't proxy `ak_*` through context-mode or rtk.** agent-kit's prefix is
   sacrosanct; routing it through a peer creates a dependency loop and
   doubles the fork cost.
3. **Don't add per-Bash-call MCP RPC.** Use existing peer MCP servers' direct
   tool calls. Per-call RPC is a separate ~50–100ms cost on top of the hook
   chain budget.
4. **context-mode's PreToolUse hook fan-out (8 matchers) is its problem,
   not ours.** We do not restructure context-mode's hook to optimize its
   ~91ms cost. Fixes there land upstream in context-mode.

### What NOT to do

Concrete anti-patterns. Each is rejected with reasoning in the analysis;
re-litigating any of these requires updating the analysis first.

- **Don't add a fourth hook.** Three peers is the architecture. New shell-tool
  filtering goes upstream to rtk; new dev-workflow routing goes into
  `ak-pretool-guard`; new large-output nudging goes into context-mode.
- **Don't replace context-mode's hook with our own.** Even if we could
  re-implement its 91ms in 30ms, that's context-mode's call to make. Our
  bound is the chain budget (150ms median), not any individual peer's cost.
- **Don't write a "unified dispatcher" merging the three.** The whole point
  of the peer-plugin shape is independent ownership. A unified dispatcher
  resurrects the very coupling this blueprint exists to avoid.
- **Don't try to elide rtk's hook by reimplementing its logic in agent-kit.**
  rtk owns the long-tail surface forever. See [VISION.md § Softest sufficient
  boundary](../../../VISION.md).

## Verification gates

Adapted from the parent blueprint's gate format. All gates run on a fresh
fixture repo, not the agent-kit repo itself.

| Gate | Description |
| --- | --- |
| **G1. Fresh-repo setup** | `mkdir /tmp/rtk-fixture && cd $_ && git init && pnpm init -y && pnpm add -D @webpresso/agent-kit && npx ak setup --with rtk`. Expect exit 0. |
| **G2. Three-hook composition** | After G1, `cat .claude/settings.json` shows three independent Claude `PreToolUse` entries: agent-kit's `ak-pretool-guard`, OMX's `oh-my-codex/dist/scripts/codex-native-hook.js` (if `--with omx` also ran), and rtk's hook. None wraps the others. |
| **G3. rtk redirect on git** | From a Claude Code session in the fixture repo, run `git status` via Bash. Assert: rtk's PreToolUse hook denies with a `rtk git status` redirect, exactly like agent-kit's hook denies `pnpm test` with `mcp__agent-kit__ak_test`. |
| **G4. agent-kit redirect still works** | In the same fixture repo, `pnpm test` via Bash → still gets agent-kit's `ak_test` redirect. The two redirects coexist; rtk does not shadow agent-kit's QA prefix. |
| **G5. Doctor row** | `ak doctor` in the fixture repo lists a green `rtk on PATH` row. After RTK is removed from `PATH` → red row with the install hint. |
| **G6. Symlink sync clean** | `ak audit catalog-drift` after `ak symlink sync` returns clean (new `rtk-routing.md` rule properly synced to `.agent/` and per-IDE surfaces). |
| **G7. Idempotent re-run** | `npx ak setup --with rtk` twice in a row → second run is a no-op (rtk's own `rtk init -g --auto-patch` is idempotent; agent-kit's scaffolder just chains it). |
| **G8. Telemetry default** | `RTK_TELEMETRY_DISABLED=1` is set in the hook entry written by `rtk init`. Verified by grepping `.claude/settings.json`. |

## Out of scope

- **Any agent-kit-side reimplementation of rtk's filters.** Don't add per-tool
  transforms for git, gh, jira, glab, gcloud, kubectl, cargo, pytest, rspec,
  golangci-lint, ruff, bundle, dotnet, or anything else rtk wraps. That's
  rtk's lane forever.
- **Lifting rtk source code into TS.** Even though rtk is MIT-licensed and
  the code is readable, the maintenance contract here is "install their
  binary." See [VISION.md § Softest sufficient boundary](../../../VISION.md).
- **Modifying rtk's `rtk init` behaviour.** If rtk's installer is missing a
  feature we want, file an issue upstream — don't fork.
- **A Linux `.deb` / `.rpm` install path.** Step A.3 falls back to a printed
  install hint on non-macOS; building a multi-platform installer is rtk's
  problem, not agent-kit's. Linux users follow rtk's docs.
- **Wrapping rtk's CLI behind `ak rtk *`.** rtk's prefix is sacrosanct;
  agent-kit must not promote `ak rtk` aliases that rot when rtk's CLI evolves.
- **A unified `--with all-peers` preset.** Each peer plugin remains an
  independent `--with <name>` flag (`--with rtk`, `--with omx`,
  `--with gstack`). Composition is the consumer's choice.

## Tasks (Blueprint format)

#### [agent-kit] Task 1.1: Scaffold `rtk/` preset

**Status:** done

**Depends:** None

**Files:**

- Create: `src/cli/commands/init/scaffolders/rtk/index.ts`
- Create: `src/cli/commands/init/scaffolders/rtk/index.test.ts`

**Steps (TDD):**

1. Copy `omx/index.ts` shape: `EnsureRtkInput`, `EnsureRtkResult` discriminated
   union, exported `ensureRtk(input)` function.
2. Write failing tests in `index.test.ts` covering: dry-run skip, rtk already
   on PATH (skip install), rtk missing → brew install path, brew install
   fails → `rtk-not-found`, `rtk init` succeeds, `rtk init` fails →
   `rtk-init-failed`. Use DI-injected `spawnSync` per omx pattern.
3. Run: `ak test --file src/cli/commands/init/scaffolders/rtk/index.test.ts` → FAIL.
4. Implement `ensureRtk` against the omx shape. Add `RTK_TELEMETRY_DISABLED=1`
   to the env passed into `rtk init`.
5. Run: `ak test --file src/cli/commands/init/scaffolders/rtk/index.test.ts` → PASS.
6. Run: `ak lint --file src/cli/commands/init/scaffolders/rtk/index.ts` and
   `ak typecheck --file src/cli/commands/init/scaffolders/rtk/index.ts`.

**Acceptance:**

- [x] Result kinds match the documented union exactly.
- [x] `RTK_TELEMETRY_DISABLED=1` set in `rtk init` env.
- [x] No imports from `@webpresso/*`; only `node:child_process` and the
      shared `MergeOptions` type, matching omx.

**Evidence (2026-05-06):** Added `src/cli/commands/init/scaffolders/rtk/index.ts` + `index.test.ts`; `pnpm exec vitest run src/cli/commands/init/scaffolders/rtk/index.test.ts --reporter=dot` passed (6 tests).

#### [agent-kit] Task 1.2: Wire `--with rtk` into init merge

**Status:** done

**Depends:** Task 1.1

**Files:**

- Modify: `src/cli/commands/init/prompts.ts` (add `rtk` to the `--with` enum).
- Modify: the dispatcher that calls `ensureOmx` / `ensureGstack` to also call
  `ensureRtk` when `options.with.includes('rtk')`. (Path TBD — likely
  `src/cli/commands/init/init.ts` or a sibling.)
- Modify: `src/cli/commands/init/init.integration.test.ts` (add an integration
  case for `--with rtk`).

**Acceptance:**

- [x] `ak setup --with rtk` calls `ensureRtk` exactly once.
- [x] `ak setup --with omx,rtk` runs both, in deterministic order
      (alphabetical by preset name, matching existing convention).

**Evidence (2026-05-06):** `src/cli/commands/init/index.ts` now registers the `rtk` preset and writes the `.agent/.rtk-requested` marker before invoking `ensureRtk`; `pnpm exec vitest run src/cli/commands/init/init.presets.test.ts src/cli/commands/init/init.e2e.test.ts --reporter=dot` passed, including `--with rtk`, `--with omx,rtk`, and `--help` preset surfacing.

#### [agent-kit] Task 2.1: New `rtk-routing.md` catalog rule

**Status:** done

**Depends:** None (parallelizable with Task 1.1)

**Files:**

- Create: `catalog/agent/rules/rtk-routing.md`
- Run: `ak symlink sync` → propagates to `.agent/rules/rtk-routing.md`.

**Steps:**

1. Author the rule mirroring `context-mode-routing.md` (same frontmatter,
   same fallback-only header, same Ownership boundary section structure).
2. Run: `ak symlink sync`.
3. Run: `ak audit catalog-drift` → expect clean.
4. Run: `ak audit docs-frontmatter` → expect clean.

**Acceptance:**

- [x] Frontmatter has `paths: ['**/*']`.
- [x] Includes a "fallback-only" disclaimer matching `context-mode-routing.md`.
- [x] Ownership boundary section names all three lanes (`ak_*`, `ctx_*`, `rtk *`).
- [x] `ak audit catalog-drift` clean.

**Evidence (2026-05-06):** Added `catalog/agent/rules/rtk-routing.md` and aligned `.agent/rules/rtk-routing.md`; `pnpm exec ak audit catalog-drift` passed.

#### [agent-kit] Task 2.2: Update `context-mode-routing.md` ownership boundary

**Status:** done

**Depends:** Task 2.1 (so the new rule exists to cross-link to)

**Files:**

- Modify: `catalog/agent/rules/context-mode-routing.md` § Ownership boundary
  (add the rtk lane).
- Run: `ak symlink sync`.

**Acceptance:**

- [x] Both rules now name all three peers symmetrically.
- [x] `ak audit catalog-drift` clean.

**Evidence (2026-05-06):** Updated `catalog/agent/rules/context-mode-routing.md` and `.agent/rules/context-mode-routing.md` ownership boundaries to name `ak_*`, `ctx_*`, and `rtk *`; `pnpm exec ak audit catalog-drift` passed.

#### [agent-kit] Task 3.1: New `ak doctor` row for rtk

**Status:** done

**Depends:** Task 1.1 (so the scaffolder can write a marker the doctor reads)

**Files:**

- Modify: `src/hooks/doctor.ts` (add `checkRtkOnPath()` function + entry in
  `runHooksDoctor`).
- Modify: `src/hooks/doctor.test.ts` (add cases: rtk present, rtk requested
  but absent, rtk not requested → row omitted).

**Steps (TDD):**

1. Write tests for the three cases.
2. Run: `ak test --file src/hooks/doctor.test.ts` → FAIL.
3. Implement `checkRtkOnPath()`. Read marker file written by the scaffolder
   (e.g. `.agent/.rtk-requested`).
4. Run: `ak test --file src/hooks/doctor.test.ts` → PASS.

**Acceptance:**

- [x] No false-positive row for repos that didn't request rtk.
- [x] Hard-fail row when requested but missing, with install hint.
- [x] Soft-pass row when present, with version string.

**Evidence (2026-05-06):** Added `.agent/.rtk-requested` marker wiring plus `checkRtkOnPath()` in `src/hooks/doctor.ts`; `pnpm exec vitest run src/hooks/doctor.test.ts --reporter=dot` passed (8 tests).

#### [agent-kit] Task 4.1: End-to-end fixture-repo verification (G1–G8)

**Status:** done

**Depends:** Task 1.2, Task 2.2, Task 3.1

**Files:**

- Create: `__fixtures__/rtk-three-hook-composition/` (a minimal fixture repo
  for the integration test).
- Create: `src/cli/commands/init/scaffolders/rtk/integration.test.ts` (drives
  G1–G8 against the fixture).

**Steps:**

1. Author the integration test that performs G1–G8 in sequence on a temp
   directory, asserting on `.claude/settings.json` content shape and on
   shell-redirect output.
2. Verify rtk is installable in the test environment (CI cache or a
   `rtk --version` prerequisite skip).
3. Run: `ak test --file src/cli/commands/init/scaffolders/rtk/integration.test.ts`.

**Acceptance:**

- [x] All 8 gates pass.
- [x] Three independent PreToolUse hook entries verified (G2).
- [x] rtk redirect for `git status` verified (G3).
- [x] agent-kit redirect for `pnpm test` still works alongside rtk (G4).

**Evidence (2026-05-06):** Added `__fixtures__/rtk-three-hook-composition/`, `__fixtures__/fake-tools/rtk-ok-bin/rtk`, and `src/cli/commands/init/scaffolders/rtk/integration.test.ts`; `pnpm exec vitest run src/cli/commands/init/scaffolders/rtk/integration.test.ts --reporter=dot` passed. The fixture validates Claude hook composition, RTK deny on `git status`, agent-kit deny on `pnpm test`, doctor row behavior, catalog drift cleanliness, idempotent re-run, and `RTK_TELEMETRY_DISABLED=1`. It also locks the May 2026 upstream nuance that Codex remains a prompt/instructions lane rather than an RTK hook lane.

## Quick Reference (Execution Waves)

| Wave | Tasks | Parallelizable? |
| --- | --- | --- |
| Wave 1 | 1.1, 2.1 | yes (independent files) |
| Wave 2 | 1.2, 2.2, 3.1 | yes (each depends only on Wave 1 outputs) |
| Wave 3 | 4.1 | no (integration gate, must run last) |

Expected wall-clock: ~half a day for one engineer. S-complexity is correct:
the substantive work is rtk's own; agent-kit's surface is one scaffolder file,
one rule file, one doctor row, plus tests.

## Risks

| Risk | Mitigation |
| --- | --- |
| rtk's `rtk init -g --auto-patch` changes its hook-entry shape between versions and breaks G2's "three independent entries" assertion. | Pin the rtk version range tested in CI. Track upstream releases via the doctor's version-string row. Add a `transform-drift`-style snapshot if churn becomes painful. |
| Linux fixture repos can't install rtk via brew. | Document the fallback (printed install hint), and skip G1–G8 on Linux CI with a clear rationale. The reference consumer (`ozby/ingest-lens`) is macOS-first. |
| rtk and OMX both try to mutate `.codex/hooks.json` and step on each other. | Verified in [`compact-qa-output-filters` § Why](../compact-qa-output-filters/_overview.md): hooks compose as independent entries under the same event. rtk's installer follows the same convention. If a future rtk version regresses this, file upstream — do not work around in agent-kit. |
| Telemetry default (`RTK_TELEMETRY_DISABLED=1`) drifts upstream as rtk renames the env var. | Track the var name in a single constant in the scaffolder; surface a warning row in `ak doctor` if rtk's `--version` output reports an unexpected telemetry default. |

## Maintenance considerations

- **agent-kit owns the wiring; rtk owns the filters.** When a consumer asks
  for compact `cargo build` output, the answer is "upstream that to rtk,"
  not "add a transform to agent-kit." This is the same boundary the parent
  blueprint draws for `Read`/`Grep`/`Glob` ↔ context-mode.
- **One peer plugin per `--with` flag.** Resist composite presets like
  `--with all-peers` — they hide which peer you actually need and make
  upgrade paths murky.
- **Doctor row is opt-in.** Repos that don't use rtk should never see a red
  doctor row about it. The marker-file approach keeps the doctor surface
  clean for non-rtk consumers.

## Related

- **Parent blueprint:** [`compact-qa-output-filters`](../compact-qa-output-filters/_overview.md)
  — its § Out of scope explicitly punts the long-tail tools to rtk; this
  blueprint is the constructive half of that punt.
- **Non-blocking follow-up:** [`monorepo-route-qa-through-ak`](../monorepo-route-qa-through-ak/_overview.md)
  — routes the Monorepo `just qa` caveat after compact QA exists. It is not a
  prerequisite for rtk peer-plugin wiring; this blueprint depends only on the
  compact-QA contract.
- **Sibling rule:** [`context-mode-routing.md`](../../../catalog/agent/rules/context-mode-routing.md)
  — the shape this blueprint's new `rtk-routing.md` mirrors exactly.
- **Sibling scaffolders:** `src/cli/commands/init/scaffolders/{omx,gstack}/index.ts`
  — the patterns this blueprint's new `rtk/index.ts` mirrors.
- **Reference consumer:** `ozby/ingest-lens` — `pnpm ak setup --with rtk` is the
  canonical post-merge smoke command.
- **Upstream:** [`rtk-ai/rtk`](https://github.com/rtk-ai/rtk) (MIT-licensed,
  installed via `brew install rtk`). Read but **don't depend on**
  internal source — the contract is the binary surface.
