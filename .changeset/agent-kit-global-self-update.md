---
"@webpresso/agent-kit": minor
---

`wp setup` now self-updates the globally-distributed `@webpresso/agent-kit` binary via `vp install -g`, mirroring how omx/omc/codex/claude keep their global installs fresh. The PATH `wp`, the Claude plugin MCP, and the agent hooks all resolve to this single global binary, so each setup keeps the next invocation everywhere on the latest published release. The refresh is non-fatal (a failed install never fails consumer setup) and skips cleanly on `--dry-run`, `WP_SKIP_AUTO_INSTALL=1`, a webpresso source/git clone (so a dev checkout is never clobbered), missing `vp`, and CI.
