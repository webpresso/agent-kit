---
"@webpresso/agent-kit": patch
---

fix(mcp): honor an explicit `cwd` over `CLAUDE_PROJECT_DIR` in `wp_lint`/`wp_test`

`resolveProjectRoot` checked `CLAUDE_PROJECT_DIR` before the caller-supplied
`cwd`. For a plugin-scope MCP server `CLAUDE_PROJECT_DIR` is the whole
session/workspace root, so `wp_lint`/`wp_test` given an explicit target repo
scanned every sibling repo instead of the requested project. An explicit `cwd`
that resolves to a project marker (`.git`, `pnpm-workspace.yaml`, or
`package.json`) now outranks `CLAUDE_PROJECT_DIR`; a markerless `cwd` still
falls back to `CLAUDE_PROJECT_DIR` and then throws (no silent widening to
`process.cwd()`).
