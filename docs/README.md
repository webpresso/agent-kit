---
type: docs-index
last_updated: '2026-04-25'
---

# `@webpresso/agent-kit` documentation

Agentkit is a standalone toolkit for agent-driven development. It ships four public surfaces:

1. **Blueprint runtime** — Markdown + YAML-frontmatter implementation-plan
   format with lifecycle states (`draft → planned → in-progress →
   completed/archived`), a parser, DAG/task-graph executor, and audit
   tooling. See [`blueprint-format.md`](./blueprint-format.md) and
   [`lifecycle.md`](./lifecycle.md).

2. **Symlinker** — keeps each IDE's native command/skill surface in sync
   with a canonical `.agent/` source of truth. Ships defaults for Claude
   Code, Cursor, Windsurf, OpenCode, Codex CLI, Amp, and Gemini CLI.
   Skills converge on two surfaces: `.claude/skills` (Claude +
   OpenCode-fallback) and `.agents/skills/` (Codex + Amp +
   OpenCode-fallback). See [`symlinker.md`](./symlinker.md).

3. **Skills catalog** — a curated set of generalized slash-commands,
   skills, workflows, rules, guides, and doc templates. `ak setup` copies
   them into consumer repos as a starting set. See
   [`skills-catalog.md`](./skills-catalog.md).

4. **`ak` CLI** — umbrella binary that drives everything:

   ```bash
   ak blueprint new "<goal>" --complexity M
   ak blueprint audit --all --strict
   ak symlink sync
   ak setup --with monorepo-navigation,tanstack-query
   ak setup --with omx,gstack    # presets — see presets.md
   ak audit tph
   ak skills list
   ak docs lint docs/research/<path>.md
   ```

## Getting started

New to agent-kit? Read [`getting-started.md`](./getting-started.md).

## `--with` presets

`ak setup --with` accepts both Tier-3 skills and named presets (`lore-commits`, `omx`, `gstack`). For when to use each, what they touch, and failure semantics, see [`presets.md`](./presets.md).

## How the pieces fit together

The catalog, `.agent/`, and the IDE-specific directories (`.claude/`,
`.gemini/`, …) are **three separate layers** with different ownership
and lifecycle. Editing the wrong one silently loses your change. See
[`architecture.md`](./architecture.md) for the three-layer model and
the lifecycle flow.

## Migration from webpresso's internal blueprint

Webpresso is adopter zero — it replaces its internal `@webpresso/blueprint`
package, `blueprint-plan` validator, `audit-tph` scripts, and `symlinker`
maintenance script with the corresponding agent-kit surfaces. See
[`migration-from-webpresso.md`](./migration-from-webpresso.md).

## Design invariants

- **Zero `@webpresso/*` runtime or dev dependencies.** Agentkit is
  self-contained and maintained outside the Webpresso monorepo.
- **Catalog content is canonical once shipped.** Consumers run `ak setup`
  once, then own their copy. `ak skills install <name>` is explicit;
  there is no public `ak skills refresh` placeholder.
- **OMX skills stay in OMX.** Anything `[OMX]`-marked in webpresso's
  `.agent/skills/` is deliberately excluded from agent-kit's catalog.
  To install OMX alongside agent-kit, run `ak setup --with omx`
  (chains `omx setup --yes` for you) — see
  [`presets.md`](./presets.md). To install OMX manually, run
  `omx setup --yes` separately.

## Versioning

Agentkit is pre-1.0. Public API may change across minor releases.
Breaking changes ship in Changesets entries with migration notes.
