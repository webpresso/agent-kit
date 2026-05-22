---
type: docs-index
last_updated: '2026-05-09'
---

# `@webpresso/agent-kit` documentation

agent-kit is the catalog and the `ak` CLI that scaffolds a repo so every AI coding agent — Claude Code, Codex CLI, Cursor, Windsurf, Gemini, OpenCode — shares the same operating contract, skills, hooks, and quality gates. Standalone, no Webpresso-monorepo dependency.

The four moving parts:

1. **Blueprints** — markdown + YAML-frontmatter implementation plans with lifecycle states (`draft → planned → in-progress → completed/archived`), a parser, DAG/task-graph executor, and audit tooling. See [`blueprint-format.md`](./blueprint-format.md) and [`lifecycle.md`](./lifecycle.md).
2. **The symlinker** — propagates a canonical `.agent/` source of truth to each IDE's native command/skill surface. Skills converge on two surfaces: `.claude/skills` (Claude + OpenCode-fallback) and `.agents/skills/` (Codex + Amp + OpenCode-fallback). See [`symlinker.md`](./symlinker.md).
3. **Skills catalog** — 18 curated slash-commands and workflows that `ak setup` copies into consumer repos as a starting set. See [`skills-catalog.md`](./skills-catalog.md).
4. **The `ak` CLI** — umbrella binary:

   ```bash
   ak setup                                       # scaffold every IDE surface
   ak sync                                        # propagate .agent/ → IDE surfaces
   ak blueprint new "<goal>" --complexity M       # write a plan
   ak audit guardrails                            # composite repo audit (8 checks)
   ak audit commit-message --require-lore         # enforce Lore trailers
   ak tech-debt new --severity high --category complexity
   ak skill list
   ak docs lint docs/research/<path>.md
   ```

## Getting started

New to agent-kit? Read [`getting-started.md`](./getting-started.md).

## `--with` presets

`ak setup --with` accepts both Tier-3 skills and named presets (`lore-commits`, `omx`, `playwright-mcp`, `gstack`, `context-mode`, `vision`, `rtk`, `base-kit`). `omx` and `gstack` are default presets so their skills are present after a normal setup. For what each preset touches and failure semantics, see [`presets.md`](./presets.md).

## How the pieces fit together

The catalog, `.agent/`, and the IDE-specific directories (`.claude/`, `.gemini/`, …) are **three separate layers** with different ownership and lifecycle. Editing the wrong one silently loses your change. See [`architecture.md`](./architecture.md) for the three-layer model and the lifecycle flow.

## Migration from webpresso's internal blueprint

Webpresso is adopter zero — agent-kit replaces its internal `@webpresso/blueprint` package, `blueprint-plan` validator, `audit-tph` scripts, and `symlinker` maintenance script. See [`migration-from-webpresso.md`](./migration-from-webpresso.md).

## Design invariants

- **Zero `@webpresso/*` runtime or dev dependencies.** agent-kit is self-contained and maintained outside the Webpresso monorepo.
- **The catalog is canonical.** Consumers run `ak setup` once, then own their copy. `ak skill install <name>` is explicit; there is no implicit upstream refresh.
- **OMX skills stay in OMX.** Anything `[OMX]`-marked in webpresso's `.agent/skills/` is deliberately excluded from agent-kit's catalog. A normal `ak setup` installs or refreshes OMX and runs `omx setup --yes --scope user` so those skills remain owned by OMX but available in the consumer environment; `wp setup --project` opts into project-scoped OMX setup.

## Versioning

Pre-1.0. Public API may change across minor releases. Breaking changes ship in Changesets entries with migration notes.
