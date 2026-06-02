---
"@webpresso/agent-kit": patch
---

setup: scaffold a portable Playwright MCP server into Claude Code `.mcp.json` via `wp setup --with playwright-mcp|omx` (mirrors the existing Codex MCP wiring; `vp dlx @playwright/mcp@latest --caps=…`), fixing the ENOENT where a stale absolute `playwright-mcp` path failed to connect. Also pull the codex global to absolute latest on refresh (`vp update -g --latest @openai/codex`) so `wp setup` updates the codex CLI rather than only installing it.

audit: `toolchain-isolation` now skips the gitignored `.claude` agent surface during its directory walk, so `wp audit guardrails` no longer false-positives on agent-worktree scratch under `.claude/worktrees/*` (matches the existing `.agent`/`.omx`/`.codex` skips).
