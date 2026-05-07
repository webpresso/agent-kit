---
"@webpresso/agent-kit": patch
---

`ak setup` now upserts `[mcp_servers.agent-kit]` into Codex's `config.toml`.

The codex-mcp scaffolder previously only managed the Playwright MCP block; users who wanted agent-kit's MCP server reachable from Codex had to hand-edit `~/.codex/config.toml`. The Claude Code side was always self-registered via the plugin manifest, so this gap was Codex-only.

The new `ensureCodexAgentKitMcp` helper probes for an agent-kit install at scaffold time:

1. Claude plugin install (`~/.claude/plugins/cache/agent-kit/agent-kit/`)
2. bun global (`~/.bun/install/global/node_modules/@webpresso/agent-kit/`)
3. pnpm global (`$(pnpm root -g)/@webpresso/agent-kit/`)
4. npm global (`$(npm root -g)/@webpresso/agent-kit/`)

Whichever exists first becomes the absolute path written into the codex config block. If none are found, the scaffolder logs a clear warning telling the user to install agent-kit globally — no broken config is written.

Migration note: when the unified-cli sibling cutover lands and `webpresso mcp serve` becomes the canonical entrypoint, this scaffolder collapses to writing a fixed `command = "webpresso", args = ["mcp", "serve"]` block — the install-detection probe goes away.

New exports from `@webpresso/agent-kit`'s codex-mcp scaffolder for downstream consumers:

- `ensureCodexAgentKitMcp({ options, configPath?, entryPath?, probe? })`
- `findAgentKitMcpEntry({ candidates?, pnpmGlobalRoot?, npmGlobalRoot? })`
- `agentKitMcpBlock(entryPath)`, `upsertAgentKitMcpServer(raw, entryPath)`
- `AGENT_KIT_MCP_SERVER_NAME`, `AGENT_KIT_MCP_HEADER`
