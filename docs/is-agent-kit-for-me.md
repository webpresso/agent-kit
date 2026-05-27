---
type: guide
title: Is webpresso for me?
description: A one-screen answer to whether webpresso fits your repo.
last_updated: '2026-05-11'
---

# Is webpresso for me?

**webpresso is the verified-execution-record kit for AI coding work.** You write a blueprint. You pick your CLI (Claude Code, Codex, opencode). webpresso runs it, captures everything (runner transcript, diffs, audit checks, artifacts), and proves the AI-generated change did what it was supposed to do.

That's the pitch. Here's whether your repo fits.

## The 5-point compatibility check

Run `wp setup --strict` and it will check these automatically. Or verify manually:

| Check | What to look for |
|---|---|
| **TypeScript workspace** | `tsconfig.json` at repo root; Node ≥ 24 |
| **pnpm ≥ 10** | `pnpm --version` returns `10.x` or higher |
| **Workers OR Vite** | `wrangler.toml` OR `vite.config.ts` at repo root |
| **blueprint lifecycle** | `blueprints/` directory (or let `wp setup --with base-kit` scaffold it) |
| **lore commit protocol** | `.agent/` directory with lore-commit rule (or scaffold via `wp setup --with lore-commits`) |

If you match all 5: `wp setup` defaults are tuned for you and the evidence ledger works out of the box.

If you match 3-4: webpresso still installs and most features work, but some defaults (blueprint lifecycle audits, lore-commit validation) assume the full pattern. You can opt out of specific scaffolders with `--without <feature>`.

If you match 0-2: webpresso is usable but you will need to customize. Start with `wp setup --with base-kit` to scaffold only the non-opinionated pieces (hooks, skills, lore).

## What you get when you fit

- **Evidence ledger** — every AI-generated change leaves a verifiable record: runner transcript, file diff, `wp audit` composite pass, mutation score, lore commit.
- **Blueprint lifecycle** — draft a plan, move it through planned → in-progress → completed, audit adherence with `wp audit blueprint-lifecycle`.
- **Multi-CLI runners** — `wp blueprint exec` (or `/pll`) runs your blueprint via Claude Code subagent, Codex CLI, or a CLI-agnostic local-worktree backend. Pick per task or let env-detection decide.
- **Zero-config setup** — `wp setup` wires Claude Code plugin, Codex hooks, gstack, context-mode, and rtk in one command.
- **Audit composite** — the shipped audit registry covers lifecycle, package-surface, docs, commit, and AI-contract drift; `wp audit guardrails` runs the composite gate.
- **Mutation engine** — `wp audit mutation` gates merges on a Stryker score; `wp audit quality` gives a composite score.
- **Template library** — `wp blueprint new --template <name>` scaffolds a blueprint from a curated template so your first blueprint isn't a blank page.

## What you don't get (explicitly not in scope)

- **Replacing your existing quality gates** — webpresso augments; it doesn't replace your lint, typecheck, or test runner.
- **A graphical UI** — the evidence ledger is queryable via MCP tools (`wp_blueprint_query`, `task_next`) and Datasette (`wp blueprint browse`). No web app.
- **Magic AI coding** — webpresso coordinates AI CLI execution and captures evidence. It doesn't make the AI smarter.
- **Support for every stack** — defaults assume Workers/Vite + pnpm. Pure Python, Go, or Rust repos work at a reduced capability tier.

## Install

```bash
# In a matching repo:
vp install -D webpresso
vp exec wp setup

# Or install globally:
vp install -g webpresso
wp setup
```

`wp setup` will guide you through the rest. Run `wp setup --bundle` to also install context-mode + rtk in the same pass.

## Still not sure?

Run `wp setup` without `--strict`. It will print a compatibility summary and let you decide whether to proceed. No destructive changes happen until you confirm.

Or look at a reference consumer repo: `ozby/ingest-lens` (Cloudflare Workers + React Router + pnpm + blueprints + lore commits) is the canonical example of a webpresso-pattern repo consuming webpresso.
