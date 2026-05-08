---
'@webpresso/agent-kit': patch
---

Migrate deprecated Codex `[features].codex_hooks` config entries to `[features].hooks` after `ak setup` runs the OMX preset, so older oh-my-codex releases do not keep triggering Codex deprecation warnings.
