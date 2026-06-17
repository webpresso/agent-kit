---
"@webpresso/agent-kit": patch
---

Hard-cut consumer setup and hook runtime contracts to the global `wp` launcher: consumer scaffolds now depend on `@webpresso/agent-config`, managed hooks execute absolute `bin/wp hook ...`, Codex MCP setup writes absolute `bin/wp mcp`, `wp setup` no longer self-updates the global install by default, and `wp update` now updates only global `@webpresso/agent-kit` unless `--tools` or `--deps` is specified.
