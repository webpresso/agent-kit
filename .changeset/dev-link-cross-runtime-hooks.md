---
"@webpresso/agent-kit": minor
---

Cross-runtime dev-link auto-restore + warning. Three new pieces:

- **`ak-restore-dev-links` bin** — consumer postinstall helper. Reads
  `<consumer>/.webpresso/agent-kit-dev-link.json` (written by
  `pnpm dev:link --consumer …`) and re-creates the
  `node_modules/@webpresso/agent-kit` symlink that `pnpm install`
  silently overwrites with the pnpm-store snapshot. Exits 0 silently
  when the state file is absent (CI / never linked); exits 1 loudly
  when the state file points at a missing source (no silent
  fallback to stale code).

- **`ak-check-dev-link` bin** — SessionStart hook. Emits the
  `{"hookSpecificOutput":{"hookEventName":"SessionStart",
  "additionalContext":"…"}}` envelope shared by Claude Code
  (docs.claude.com/en/docs/claude-code/hooks) and Codex CLI
  (developers.openai.com/codex/hooks) when the symlink doesn't match
  the state file. Catches the rare `pnpm install --ignore-scripts`
  path where postinstall didn't fire. Always exits 0; never blocks.

- **opencode plugin scaffolder** — `ak setup` now writes
  `.opencode/plugins/agent-kit-dev-link.js`, which shells out to
  `ak-check-dev-link` on `session.created` and pushes the same
  message into `output.context` during `experimental.session.compacting`.
  Single source of truth across all three runtimes.

`ak setup` wires `ak-check-dev-link` into the SessionStart array of both
`.claude/settings.json` and `.codex/hooks.json` automatically; existing
hook entries are preserved (additive merge, dedup by bin name).

Consumer migration: add `bun ./node_modules/.bin/ak-restore-dev-links`
to your repo's `postinstall` script. Then run `ak setup` to wire the
SessionStart hook + opencode plugin. State file is opt-in: `pnpm
dev:link --consumer <your-repo-root>` from this repo creates it.
