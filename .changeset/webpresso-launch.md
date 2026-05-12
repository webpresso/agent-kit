---
"@webpresso/agent-kit": minor
---

webpresso launch: rename to `webpresso` on public npm + state-out-of-repo + auto-update on start.

This is the final intentional publish of `@webpresso/agent-kit` to GitHub
Packages (deprecated, `ak` bin removed, postinstall migration notice).
The same version ships to public npmjs.org as `webpresso` with full bin
map (`wp`, `webpresso`, `ak`, all 8 hook bins), auto-update enabled, and
state moved to `~/Library/Application Support/webpresso-agent-kit/`
(macOS) / `$XDG_STATE_HOME/webpresso-agent-kit/` (Linux). See MIGRATION.md.
