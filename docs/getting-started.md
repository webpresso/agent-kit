# Getting started with `@webpresso/agent-kit`

This guide takes a fresh repo from zero to a fully wired blueprint +
agent-surface setup in five minutes.

## Prerequisites

- Node.js ≥20 or Bun ≥1.
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
npx ak init
```

`ak init` is idempotent. It:

1. Creates `.agent/{commands,skills,workflows,rules,guides}/` and populates
   them with the catalog's Tier-1 blueprint-native + Tier-2 methodology
   content.
2. Creates `.claude/commands/` + `.claude/skills/` as **symlinks** pointing
   at `.agent/`. Also `.cursor/commands/` and `.windsurf/commands/` if
   you use those tools.
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
npx ak init --with tanstack-query,better-auth-best-practices
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

### Preview without writing

```bash
npx ak init --dry-run
```

Shows the diff `ak init` would write, then exits. Useful before your
first real run.

## Write your first blueprint

```bash
npx ak blueprint new "Add real-time notifications via SSE" --complexity M
```

Creates `blueprints/draft/add-real-time-notifications-via-sse/_overview.md`
from `docs/templates/blueprint.md`, with frontmatter filled in
(`status: draft`, `complexity: M`, `created:` today, etc.).

Edit the file, then:

```bash
# Harden the plan (fact-check, split coarse tasks, align deps)
npx ak blueprint refine add-real-time-notifications-via-sse
# Or invoke /plan-refine inside Claude Code — the skill lives at
# .agent/skills/plan-refine/SKILL.md (installed by ak init).

# Move draft → planned once it's execution-ready
npx ak blueprint move add-real-time-notifications-via-sse planned

# Audit format and lifecycle state
npx ak blueprint audit --strict
```

See [`lifecycle.md`](./lifecycle.md) for the full state machine.

## Keep the agent surface in sync

When you edit `.agent/commands/<foo>.md`, the `.claude/`, `.gemini/`,
`.cursor/`, and `.windsurf/` consumer surfaces drift. Run:

```bash
npx ak symlink sync
```

or add it to your pre-commit:

```bash
# .husky/pre-commit
npx ak symlink check   # exits 1 if drift detected
```

`.claude/commands/` + `.claude/skills/` use real filesystem symlinks
(no content to keep in sync — the symlink points at `.agent/`).
`.gemini/commands/*.toml` are transformed artifacts (regenerated from
the `.md` source on every sync). See [`symlinker.md`](./symlinker.md)
for details.

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

npx ak symlink sync
```

Claude Code picks it up via `.claude/commands/my-command.md` (the
symlink). Gemini CLI picks it up via `.gemini/commands/my-command.toml`
(the transformed artifact).

## Next steps

- [`blueprint-format.md`](./blueprint-format.md) — the markdown + frontmatter spec for blueprints.
- [`lifecycle.md`](./lifecycle.md) — state machine + transitions.
- [`symlinker.md`](./symlinker.md) — how cross-IDE sync works.
- [`skills-catalog.md`](./skills-catalog.md) — what ships in the catalog + upstream refresh plan.
