---
'@webpresso/agent-kit': patch
---

Add a `context-mode` setup preset that patches Codex's `config.toml` and `hooks.json` plus project-local `opencode.json`, so `ak setup --with context-mode` wires context-mode for both Codex CLI and OpenCode.
