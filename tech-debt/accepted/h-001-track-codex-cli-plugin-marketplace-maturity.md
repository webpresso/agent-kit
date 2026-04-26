---
type: tech-debt
status: accepted
severity: low
category: documentation
review_cadence: monthly
last_reviewed: '2026-04-26'
created: '2026-04-26'
linked_blueprints: []
affected_modules: []
---

# track Codex CLI plugin marketplace maturity

## Context

Agent-kit distributes hooks + MCP server + skills + slash commands via two paths (the [context-mode pattern](https://github.com/mksglu/context-mode)):

1. **Claude Code → plugin marketplace** (`/plugin marketplace add webpresso/agent-kit && /plugin install agent-kit@webpresso`). Zero-config; the `.claude-plugin/plugin.json` declares everything inline.
2. **Codex CLI + everything else → npm + scaffolder** (`pnpm add -D @webpresso/agent-kit && npx ak setup`). The `scaffoldAgentHooks` step (`src/cli/commands/init/scaffolders/agent-hooks/`) idempotently patches `.claude/settings.json` AND `.codex/hooks.json` with hook entries.

The asymmetry is **not optional today**: as of 2026-04-26, [Codex CLI's config docs](https://github.com/openai/codex/blob/main/docs/config.md) document MCP servers (`~/.codex/config.toml`) and hooks (`~/.codex/hooks.json`) but **no plugin marketplace** equivalent to Claude Code's `/plugin install`. The scaffolder is the only automated install path for Codex.

## Why this is debt, not a feature

The two paths drift independently:
- Claude Code plugin manifest changes (e.g., new hook event) require updating `.claude-plugin/plugin.json`.
- Codex hooks contract changes require updating the `scaffolder/agent-hooks/index.ts` patch logic.
- Skills are duplicated to `.agents/skills/` (Codex) and consumed via plugin (Claude Code).
- A consumer who installs both paths gets hooks wired twice (deduplicated by `ak-pretool-guard` etc., but conceptually two truths).

If/when Codex CLI ships a plugin marketplace, the scaffolder path becomes legacy and should fold into a single plugin-style distribution (the original Task 4.2 premise — see `blueprints/in-progress/agent-kit-claude-plugin-marketplace/_overview.md`).

## Watch points (review every cadence)

- **Codex CLI release notes** at https://github.com/openai/codex/releases — search for `plugin`, `marketplace`, `extension`.
- **Codex config docs** at https://developers.openai.com/codex/config-reference — watch for new top-level config sections.
- **Codex `~/.codex/` directory schema** — new directories like `~/.codex/plugins/` would signal a marketplace.
- **`codex --help` output** for new subcommands like `codex plugin`, `codex marketplace`.

## Trigger

Resolve this item when **any one** of:
- Codex CLI ships a documented `codex plugin install` (or equivalent) command that reads from a marketplace.json or similar manifest.
- Codex CLI hooks evolve in a way that breaks the `scaffolder/agent-hooks/` patch logic (e.g., hooks.json schema change).
- Six months pass with no movement (review whether to keep monitoring or downgrade to "monitoring" status).

## Action when triggered

1. Add a `.codex-plugin/marketplace.json` (or whatever Codex's manifest format becomes).
2. Migrate `scaffoldAgentHooks` Codex patches into the plugin manifest.
3. Update `ak setup` to detect Codex plugin support and skip the manual `.codex/hooks.json` patching when a plugin install path exists.
4. Update README's Install Paths section.
5. Mark this item `resolved` with a link to the implementing blueprint.

## Related

- Source commit for the dual-distribution decision: `7bc036c feat(hooks): port claude-hooks into agent-kit + wire via ak setup` + this session's blueprint `agent-kit-claude-plugin-marketplace`.
- Sibling: `blueprints/planned/agent-kit-parity-pass/_overview.md` plans `.agent/mcp.json` fan-out across non-Claude IDEs (separate concern; same general theme).
