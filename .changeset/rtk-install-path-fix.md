---
'@webpresso/agent-kit': patch
---

Fix the rtk scaffolder so `ak setup` actually installs rtk.

The previous scaffolder shipped two unverified guesses:

1. `brew install rtk-ai/rtk/rtk` via `tap "rtk-ai/rtk"` — that tap does not
   exist (`https://github.com/rtk-ai/homebrew-rtk` returns 404), so every
   `ak setup` on macOS hit `rtk-not-found` and silently degraded. The real
   formula is in homebrew-core: `brew install rtk` (verified against
   `Formula/r/rtk.rb` v0.39.0). Brewfile entries in consumer repos that
   followed the same wrong path also failed `brew bundle install`.
2. `RTK_HOOK_EXCLUDE_COMMANDS` env var passed to `rtk init` — rtk does not
   read this env var (verified against the rtk binary's strings table). The
   env var was a no-op. Real exclusion needs the proper rtk mechanism (TOML
   filters or hook matcher) and is left as a follow-up.

Also fixes an integration-test PATH leak that masked the bug on machines
where rtk was not installed locally.
