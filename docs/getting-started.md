---
type: guide
last_updated: '2026-05-09'
---

# Getting started with `@webpresso/agent-kit`

This guide takes a fresh repo from zero to a fully wired blueprint +
agent-surface setup in five minutes.

## Prerequisites

- Node.js ≥24 (matches `package.json#engines`). Bun ≥1 is required if
  you also install the Claude Code plugin — its hook + MCP entrypoints
  run under `bun`.
- pnpm (or npm/bun — examples use pnpm).
- A git repo.

## Install

```bash
pnpm add -D @webpresso/agent-kit
```

The `ak` binary is now available via:

```bash
pnpm exec ak --version
# or: npx ak --version
```

## Scaffold your repo

```bash
npx ak setup
```

`ak setup` is idempotent (`ak init` remains a compatibility alias). It:

1. Creates `.agent/{commands,skills,workflows,rules,guides}/` and populates
   them with the catalog's Tier-1 blueprint-native + Tier-2 methodology
   content.
2. Creates IDE surfaces as **symlinks** pointing at `.agent/`:
   - `.claude/commands/` + `.claude/skills/` (directory-mode skills link
     — also serves OpenCode via its `.claude/skills/` fallback)
   - `.cursor/commands/`, `.windsurf/commands/`, `.opencode/commands/`
   - `.agents/skills/<name>/` (per-skill links — covers Codex CLI +
     Amp + OpenCode's `.agents/skills/` fallback in one surface)
3. Generates `.gemini/commands/*.toml` by transforming each `.agent/commands/*.md`
   (Gemini CLI wants TOML, not markdown).
4. Creates `docs/templates/{blueprint,guide,research,postmortem,system,adr,runbook,tech-debt}.md`
   (with `blueprint.yaml` variant).
5. Creates `blueprints/{completed,in-progress,planned,parked,archived}/`
   with `.gitkeep` placeholders and a generalized `README.md` explaining
   the lifecycle.
6. Creates `AGENTS.md` at the repo root (only if none exists) from the
   template, filling `{{REPOSITORY_MAP}}` by scanning your
   `pnpm-workspace.yaml` / `package.json` workspaces.
7. Writes `.agent-kitrc.json` capturing your choices for idempotent re-runs.

### Opt into tech-specific skills

```bash
npx ak setup --with tanstack-query,better-auth-best-practices
```

Tier-3 tech skills are opt-in because they only apply if your stack
includes those libraries. Available:

- `tanstack-query` — React Query patterns + anti-patterns.
- `better-auth-best-practices` — auth setup guidance.
- `react-doctor` — React diagnostic runbook.
- `frontend-design`, `web-design-guidelines`, `visual-verdict`, `web-clone`
  — design workflow skills.
- `vercel-react-best-practices` — Vercel/React deployment hygiene.
- `monorepo-navigation` — scaffolded per-repo from `pnpm-workspace.yaml`
  with `{{TODO}}` placeholders for fields needing human judgment.

### Bundled tooling installed by default

```bash
npx ak setup
```

Default setup also wires in tooling that lives outside the skill catalog:

- `omx` — chains `omx setup --yes` so the operator-workflow execution
  layer is set up alongside agent-kit. If `omx` is missing, setup first
  runs `npm install -g oh-my-codex` and then retries.
- `gstack` — ensures the gstack skill registry is installed at
  `~/.claude/skills/gstack/` (clones + runs `./setup --team` if missing,
  no-op if already there). Provides `/qa`, `/ship`, `/review`, etc.
- `vision` — drops a starter `VISION.md` at repo root from the agent-kit
  template. Runs by default. Pairs with the `vision` audit (part of the
  `guardrails` composite) so every consumer keeps a structured, ≤100-line
  vision under enforcement.
- `lore-commits` — installs a `.husky/commit-msg` hook that enforces
  Lore Commit Protocol trailers via `ak audit commit-message` when requested
  with `--with lore-commits`.

Presets and Tier-3 skills can be combined freely in the same `--with`
flag. Full reference: [`presets.md`](./presets.md).

After setup, every non-`--dry-run` run also probes `bun --version` and
`vp --version`, printing install hints if either is missing — this is
informational, never blocks the run.

### Preview without writing

```bash
npx ak setup --dry-run
```

Shows the diff `ak setup` would write, then exits. Useful before your
first real run.

This preview mode is write-free: it does not create scaffold files, helper hook
scripts, IDE config files, or spawn external preset installers.

## Write your first blueprint

```bash
npx ak blueprint new "Add real-time notifications via SSE" --complexity M
```

Creates `blueprints/draft/add-real-time-notifications-via-sse/_overview.md`
from `docs/templates/blueprint.md`, with frontmatter filled in
(`status: draft`, `complexity: M`, `created:` today, etc.).

> **Blueprint root** — generic repos use `blueprints/` at the repo root;
> repos with a `webpresso/config.yaml` sentinel use `webpresso/blueprints/`.
> Override either default by setting `"blueprintsDir": "<path>"` in
> `.agent-kitrc.json`.

Edit the file, then:

```bash
# Harden the plan (fact-check, split coarse tasks, align deps)
npx ak blueprint refine add-real-time-notifications-via-sse
# Or invoke /plan-refine inside Claude Code — the skill lives at
# .agent/skills/plan-refine/SKILL.md (installed by ak setup).

# Move draft → planned once it's execution-ready
npx ak blueprint move add-real-time-notifications-via-sse planned

# Audit format and lifecycle state
npx ak blueprint audit --strict
```

See [`lifecycle.md`](./lifecycle.md) for the full state machine.

## Keep the agent surface in sync

When you edit `.agent/commands/<foo>.md`, the `.claude/`, `.cursor/`,
`.windsurf/`, `.opencode/`, `.agents/`, and `.gemini/` consumer surfaces
drift. Run:

```bash
npx ak sync
```

or add it to your pre-commit:

```bash
# .husky/pre-commit
npx ak sync --check    # exits 1 if drift detected
```

`.claude/commands/` + `.claude/skills/` use real filesystem symlinks
(no content to keep in sync — the symlink points at `.agent/`).
`.gemini/commands/*.toml` are transformed artifacts (regenerated from
the `.md` source on every sync). See [`symlinker.md`](./symlinker.md)
for details.

## Add the dev command drop-in

Repos that define an agent-kit dev manifest can import the packaged just
wrappers:

```just
import 'node_modules/@webpresso/agent-kit/just/dev-kit.just'
```

The drop-in exposes:

- `just dev [target]` -> `ak dev [target]`
- `just dev-doctor [target]` ->
  `ak dev [target] --doctor`
- `just dev-clean [target]` ->
  `ak dev [target] --clean`
- `just dev-restart [target]` ->
  `ak dev [target] --restart`

Manifest resolution is intentionally explicit:

1. `ak dev --manifest <path>`
2. `AK_APP_MANIFEST`
3. `./app-manifest.yaml`
4. error

Consumer manifests own service commands, service groups, dependencies,
readiness metadata, and any plain env passthrough values. Agent-kit does
not read Webpresso host config, inject secrets, or assume a PM2-specific
public contract.

## Add a custom command or skill

Drop a file under `.agent/`:

```bash
cat > .agent/commands/my-command.md <<EOF
---
description: "Do the thing"
argument-hint: "<target>"
allowed-tools: Bash, Read
---

# My command

…
EOF

npx ak sync
```

Claude Code picks it up via `.claude/commands/my-command.md` (the
symlink). OpenCode picks it up via `.opencode/commands/my-command.md`.
Gemini CLI picks it up via `.gemini/commands/my-command.toml` (the
transformed artifact). All point back at the same
`.agent/commands/my-command.md` source. For skills, Codex and Amp
discover them via `.agents/skills/<name>/SKILL.md`; Claude Code discovers
them via `.claude/skills/<name>/SKILL.md`; OpenCode discovers them via
either of those fallbacks.

## Next steps

- [`blueprint-format.md`](./blueprint-format.md) — the markdown +
  frontmatter spec for blueprints.
- [`lifecycle.md`](./lifecycle.md) — state machine + transitions.
- [`symlinker.md`](./symlinker.md) — how cross-IDE sync works.
- [`skills-catalog.md`](./skills-catalog.md) — what ships in the catalog +
  upstream refresh plan.
