---
type: blueprint
status: draft
complexity: M
created: '2026-04-25'
last_updated: '2026-04-25'
progress: '0% (draft — captured during agent-kit dogfood pass)'
depends_on: []
tags:
  - agent-kit
  - scaffolder
  - audit
  - dogfooding
  - dx
---

# Scaffold an Audit-Clean Baseline

**Goal:** Make `ak setup` produce a working tree that passes every `ak audit` from first run on any consumer (including agent-kit itself), and add an `ak doctor` that diagnoses and remediates audit failures with a single command.

## Why

Captured live during the dogfood pass on 2026-04-25 (`webpresso/agent-kit` commit `8eb6c8a`). agent-kit failed three of its own four audits before the pass:

- `audit catalog-drift`: failed because `pnpm-workspace.yaml` was missing
- `audit docs-frontmatter`: failed because **8 pre-existing docs** had no `type:` / `last_updated:` frontmatter
- `audit blueprint-lifecycle`: vacuously passed (no blueprints existed)

`ak setup --with base-kit` fixed two of these (scaffolded `pnpm-workspace.yaml`, scaffolded `blueprints/`). But the docs-frontmatter audit still required **manual** frontmatter additions to 8 files because `ak setup` doesn't touch existing un-framed docs. Per the user's saved feedback ("scaffolders over manual fixes"), this is the gap.

A separate gap surfaced: discovering which `--with` mode would fix a given audit failure required reading source. There's no `ak doctor`-style command that runs every audit and prints the remediation for each failure.

## Scope

### Auto-frontmatter pass for existing docs

`ak setup` (or a new `ak audit docs-frontmatter --fix`) should:

- Scan `docs/**/*.md` for files lacking required frontmatter.
- Auto-prepend a default block — `type: guide`, `last_updated: <today>` — with the type heuristically inferred (or `guide` as a fallback). Use a comment marker so the user can reclassify later (`# TODO: classify type — auto-set by ak`).
- Be idempotent: never overwrite existing frontmatter.
- Be bypassable: `--no-fix-docs` flag.

This closes the legacy-doc gap so the dogfood pass becomes one command, not eight Edits.

### Fix `audit blueprint-lifecycle` silently skipping `draft/`

Verified during the validation sweep on 2026-04-25: `DEFAULT_BLUEPRINT_STATUSES` at `src/audit/repo-guardrails.ts:82` is `['planned', 'in-progress', 'parked', 'completed', 'archived']` — `draft` is missing. Effect: blueprints in `draft/` (including this one and `promote-parent-roadmaps`) are **never audited**, so frontmatter regressions in drafts ship silently.

Same class of issue as the parent-roadmap silent filter (already covered by `promote-parent-roadmaps`). Fix: add `'draft'` to the constant; verify the audit now reports `3 checked` against agent-kit's current state. One-line change + a regression test asserting `auditBlueprintLifecycle({ blueprintsRoot: 'fixtures-with-drafts' }).checked === <expected>`.

### `ak doctor`

New top-level command:

- Runs every audit (`catalog-drift`, `docs-frontmatter`, `blueprint-lifecycle`, `commit-message`, `bundle-budget`, `tph`, plus `symlink check`).
- For each failure, prints a remediation line: `→ run: ak setup --with base-kit` or `→ run: ak audit docs-frontmatter --fix`.
- Exit code: 0 = clean, 1 = fixable failures, 2 = unknown failures.
- `--fix` flag chains the remediations automatically (asks before destructive actions).

Distinct from existing `ak dev --doctor` (manifest validation) — that command is preserved; this is at the audit layer.

### Catalog-drift behavior on single-package repos

Today the audit demands `pnpm-workspace.yaml` even when a repo is a single package with no workspaces. agent-kit needed an empty workspace stub purely to satisfy the audit. Fix:

- If repo has no workspace dirs declared, audit returns "OK (single package — no catalog needed)" instead of failing.
- If a `pnpm-workspace.yaml` is present, audit runs as today.

### Fix `ak setup --dry-run`

Currently `--dry-run` writes files (observed during this pass — `blueprints/`, `AGENTS.md`, `.agent/`, etc. all created despite the flag). True dry-run must print intent only.

### Bring up the full agent-kit toolchain via `ak setup`

Per user directive 2026-04-25 ("installing agent-kit should install omx too" + corrections expanding to gstack, bun, vp, vitest): `ak setup` should bootstrap not just agent-kit itself but the **full sister-tool stack** that agent-kit assumes downstream. Today a fresh consumer who runs `ak setup` then `pnpm test` hits "vitest not found"; runs an `/qa` skill and hits "gstack missing"; runs `ak blueprint exec` and hits "omx not found." The audit harness can't enforce against a runtime that isn't installed.

#### Skill systems — chain their own setup (idempotent, side-effect via spawn)

| Tool | Install model | What `ak setup` should do |
|---|---|---|
| **OMX** (oh-my-codex) | Has `omx setup` CLI on PATH | `spawnSync('omx', ['setup', '--yes'], { cwd, stdio: 'inherit' })` after the agent-kit scaffold completes. Already used downstream at `agent-kit/src/cli/commands/blueprint/execution.ts:251` for `omx team`. |
| **gstack** | Clone-and-setup at `~/.claude/skills/gstack/`, then `./setup --team` | If dir missing, clone `https://github.com/garrytan/gstack.git --depth 1`; then run `./setup --team`. Both ingest-lens and webpresso CLAUDE.md mark gstack as **required** for any AI-assisted work in those repos. |

#### Runtimes — check, install if missing

| Tool | Detect | Remediation |
|---|---|---|
| **bun** | `bun --version` | If missing: `curl -fsSL https://bun.sh/install \| bash` (or `brew install oven-sh/bun/bun`). Hint in summary, ask before running curl-pipe. |
| **vp** (vite-plus) | `command vp --version` (vp is a shell function wrapping the binary) | If missing: install via the same channel as bun. |

#### Test runtime

- **vitest** (especially for e2e) — confirm it's a transitive devDep via `@webpresso/vitest-config` (already required by ingest-lens). When `--with base-kit` runs, ensure the consumer's package.json has the appropriate `vitest` script wiring. The `@webpresso/agent-kit/e2e` subpath export already provides e2e helpers; just need to wire them.

#### Implementation outline

1. Add `'omx'` to the `PRESETS` array at `src/cli/commands/init/index.ts:24` (currently `['lore-commits']`).
2. After the scaffolder pass (around line 175), if `presets.includes('omx')`: spawn `omx setup --yes`. Hint via `console.error` + non-zero exit if `omx` is not on PATH.
3. Same spawn pattern for `--with gstack`, `--with bun`, `--with vp` — each guarded by a "found on PATH?" check first.
4. New `--all-tools` shorthand that activates all four presets at once.
5. **Default behavior is opt-in.** Don't run another tool's setup unless the user asked. (User directive note: "installing agent-kit should install omx too" reads as "make this easy to opt into," not "silently run a curl pipe on every consumer's machine." Confirm this calibration before defaulting.)
6. Auto-detection: when any of these tools is on PATH but its corresponding `--with <tool>` was not passed, print a single line in the summary suggesting it.

#### Verification

- `ak setup --with omx` on a fresh repo where `omx` is on PATH → omx setup runs, exits clean.
- `ak setup --with omx` where `omx` is NOT on PATH → exits non-zero with install hint.
- Idempotency: `ak setup --with omx` re-run → omx setup re-runs (omx is responsible for its own idempotency).
- Same matrix for gstack, bun, vp.
- Regression test in `agent-kit/__fixtures__/` that mocks the spawn boundary and asserts the right command line is invoked.

Out of scope here: full implementation of all four — OMX is the tracer-bullet implementation; gstack/bun/vp follow the same pattern in subsequent passes.

### Surface `claude install-plugin` in post-setup output

`ak setup` scaffolds files but never tells the user that Claude Code skills (`/pll`, `/verify`, etc.) require the plugin to be registered with their Claude Code instance. The gap was found live: `/pll` exists in `skills/pll/SKILL.md` and is correctly included in the plugin manifest, but was not available in Claude Code because nobody ran `claude install-plugin @webpresso/agent-kit`.

Fix: at the end of every `ak setup` run, print a one-time hint:

```
  Claude Code plugin: run `claude install-plugin @webpresso/agent-kit`
  to register /pll, /verify, and other skills in Claude Code sessions.
```

Also add `--with claude-plugin` preset (or include in `--with base-kit`) that chains `claude install-plugin @webpresso/agent-kit` automatically. The `claude` CLI must be on PATH; if not, print the manual instruction instead. Add this detection to `ak doctor` output as well.

### Fix `ak setup` idempotency

Re-running `ak setup --with base-kit --yes` on an already-set-up tree is non-idempotent. Verified during the post-dogfood verification sweep on 2026-04-25:

1. **Self-destructive catalog stub.** `cleanupUnusedCatalogs: true` is written into `pnpm-workspace.yaml` alongside a 30-line catalog stub (typescript, vitest, eslint, prettier, etc.). On the **second** run, the cleanup pass sees no consumer of those catalog entries and prunes them all — leaving only `cleanupUnusedCatalogs: true`. So the scaffolder writes content its own cleanup pass then deletes. Either drop the catalog stub at write time, or skip the cleanup pass on first install.
2. **Persistent sidecar storm.** Files customized by the consumer (`.gitignore` with project-specific patterns, `docs/templates/blueprint.md` adapted to `ak` instead of generic `wp`, `docs/templates/tech-debt.md` extended with `last_updated:`, `pnpm-workspace.yaml` with consumer catalog) trigger a `.new` sidecar on every subsequent run. The setup never converges. Needs either: (a) merge semantics for `.new` reconciliation, (b) a checksum/marker that records "consumer accepted this divergence", or (c) `--accept-sidecars` flag that promotes `.new` → canonical.
3. **`lastInit` timestamp churn.** `.agent-kitrc.json` is rewritten with a fresh `lastInit` ISO timestamp every run. Either move the timestamp out of the tracked file (e.g. into `.agent/.lastInit` and gitignore it) or drop the field entirely (it's not load-bearing for any audit).

These three together make `ak setup` produce noise on every run, which trains consumers to ignore its output — exactly the opposite of "scaffolder is the audit-remediation source of truth."

## Out of scope

- New audit categories (covered by `agent-kit-parity-pass`).
- Symlinker rewrite.
- Rewriting `ak blueprint new` to support `--type parent-roadmap` (covered by `promote-parent-roadmaps` once it moves into agent-kit).

## Verification Gates

- `ak setup --with base-kit` on a fresh repo → all four audits pass without manual edits.
- `ak setup --with base-kit` on agent-kit (re-run) → idempotent: no working-tree changes, no `.new` sidecars, no `lastInit` timestamp churn, no catalog stub erased by cleanup.
- `ak doctor` on a clean repo → exits 0.
- `ak doctor` on a seeded broken repo (delete a frontmatter field) → exits 1 with a remediation line.
- `ak doctor --fix` on the same → returns the repo to clean.
- `ak setup --dry-run` writes nothing to disk (verify by `git status` after).
- `ak audit catalog-drift` on a single-package repo with no `pnpm-workspace.yaml` → OK, not FAILED.

## Related

- Triggered by: dogfood pass on 2026-04-25 (`webpresso/agent-kit` commit `8eb6c8a`)
- User feedback memory: `feedback_scaffolders_over_manual_fixes.md`
- Sibling work: `agent-kit-parity-pass`, `promote-parent-roadmaps` (both being relocated into this same `blueprints/` tree from `webpresso/monorepo/webpresso/blueprints/`)
