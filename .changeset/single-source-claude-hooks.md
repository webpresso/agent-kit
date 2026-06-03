---
"@webpresso/agent-kit": patch
---

setup: single-source Claude Code hooks in `.claude/settings.json`.

Removes the `hooks` block from the plugin manifest (`.claude-plugin/plugin.json`). Declaring hooks in both the manifest and the `wp setup`-written `.claude/settings.json` **double-fired** every guard on each tool call — verified via a controlled `claude --plugin-dir` reproduction: a manifest hook and a settings.json hook with different command strings both executed on a single Bash tool call (Claude Code does not dedup hooks across sources by command string). The manifest is also the less reliable surface (hooks fail to load in the VSCode extension, under `--setting-sources user`/Cowork, and on cloud first-session), so settings.json is the single source.

`wp hooks doctor` now emits an advisory warning when the managed hook launchers are missing from `.claude/settings.json`, pointing at `wp setup`.

Note: enabling the plugin alone no longer activates hooks — run `wp setup`. The best-effort Read/Grep/WebFetch PreToolUse guarding (manifest-only) is dropped, matching the intentional `.claude/settings.json` scope (mutating tools + Skill).
