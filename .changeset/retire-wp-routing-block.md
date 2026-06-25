---
"@webpresso/agent-kit": patch
---

Retire the SessionStart `WP_ROUTING_BLOCK`. The ~9KB XML routing block is no longer injected into every Claude/Codex/OpenCode session. Per-tool "when to use / prefer over raw X" guidance now lives in the native `wp_*` MCP tool `description` fields, and durable conventions live in the always-on AGENTS.md/CLAUDE.md surfaces. `instruction-surfaces` now derives `native_tool_names` from the MCP tool registry (a lightweight `WP_TOOL_NAMES` list, parity-tested), and the SessionStart hook injects only session-memory continuity, the update banner, and `.agent/routing.md`.
