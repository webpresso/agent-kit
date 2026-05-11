---
"@webpresso/agent-kit": patch
---

`ak lint` and `ak format` now anchor to `process.cwd()` when invoked from the terminal.

`resolveProjectRoot` in the shared MCP module checks `CLAUDE_PROJECT_DIR` first.
When these CLI commands were run from a terminal inside Claude Code, that env var
pointed at the session's project root (the workspace parent) rather than the terminal's
CWD, causing `ak format --check` to fail with a missing `.gitignore` error and
`ak lint` to scan unrelated sibling repos.

Both CLI command handlers now pass `cwd: process.cwd()` explicitly, which bypasses the
`CLAUDE_PROJECT_DIR` path. The env-var behaviour in `resolveProjectRoot` is intentional
for MCP tool invocations where no reliable CWD is set; it must not leak into direct
CLI invocations.
