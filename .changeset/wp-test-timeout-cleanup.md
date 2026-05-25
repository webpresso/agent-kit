---
"@webpresso/agent-kit": patch
---

Fix `wp_test` timeout handling by cleaning up cancelled Vitest process trees, preserving file-scoped Vitest filters, and suppressing real Codex app-server trust sync during Vitest scaffolding tests unless a fake app-server is injected.
