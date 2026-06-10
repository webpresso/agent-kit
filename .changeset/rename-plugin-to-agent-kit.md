---
"@webpresso/agent-kit": minor
---

BREAKING (plugin id): rename the Claude Code plugin from `webpresso` to `agent-kit`. It now installs as `agent-kit@webpresso` instead of `webpresso@webpresso` — the marketplace stays `webpresso` and the MCP server stays `webpresso`, so the display is `webpresso/agent-kit`, matching the npm package `@webpresso/agent-kit` and removing both the `webpresso/webpresso` doubling and the name collision with the `@webpresso/webpresso` framework facade.

Existing installs must re-add the plugin: `claude plugin install agent-kit@webpresso --scope user` (and remove the old `webpresso@webpresso`). `wp setup` installs and auto-enables the new id automatically.
