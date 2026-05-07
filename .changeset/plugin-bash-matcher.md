---
"@webpresso/agent-kit": minor
---

Plugin manifest: PreToolUse now matches Bash + MultiEdit

The Claude Code plugin install path previously left Bash unguarded —
the SessionStart routing block was advisory but not enforced. Adding
`Bash|MultiEdit` to the PreToolUse matcher (full matcher now
`Bash|Edit|Write|MultiEdit|WebFetch|Read|Grep`) lets the
`forbidden-commands` validator actually intercept `pnpm vitest`,
`just test`, `oxlint`, `tsc`, and other dev-workflow shell commands and
redirect them to the corresponding `ak_*` MCP tools.

Matches context-mode's own plugin precedent (their `hooks/hooks.json`
registers PreToolUse for Bash, WebFetch, Read, Grep, Agent, and
`mcp__*` matchers).

The npm + `ak setup` install path and the Codex hook scaffolder were
already correct; this change closes the gap on the plugin install path.
