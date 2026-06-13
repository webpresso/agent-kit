---
"@webpresso/agent-kit": minor
---

Deliver agent-kit skills through exactly one channel per host. Skill-dir
projection is now host-gated by `hosts.selected`: Claude and Codex receive
skills from their native plugins (no `.claude/skills` / `.agents/skills`
symlinks, which previously double-showed every skill alongside the plugin), and
OpenCode receives them at its primary `.opencode/skills` root. The opt-out
fallbacks (`WP_SKIP_CLAUDE_PLUGIN=1` / `WP_SKIP_CODEX_PLUGIN=1`) re-enable the
respective skill dir.

Adds a first-class Codex plugin channel: ships `.codex-plugin/plugin.json`
(version-locked with the Claude manifest) and a `codex-plugin` setup scaffolder.
Because Codex (verified against codex-cli 0.139.0) only exposes plugins that live
in a subdirectory of the marketplace root via an object `source`, the scaffolder
builds a small staging marketplace under `~/.webpresso/cache/agent-kit/` whose
`plugins/agent-kit` is a symlink to the installed package, then runs
`codex plugin marketplace add` + `codex plugin add agent-kit@webpresso` (skipped
in CI and via `WP_SKIP_CODEX_PLUGIN=1`).

`wp setup`/`wp sync` prune leftover skill symlinks from dirs that are no longer
projection targets, and the host-visibility audit is now plugin-aware for Claude
and Codex.
