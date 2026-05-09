---
"@webpresso/agent-kit": patch
---

fix(mcp/run-command): prepend `{cwd}/node_modules/.bin` to PATH before spawning

`runCommand` now mirrors npm/pnpm script execution: when a `cwd` is provided, it
injects `{cwd}/node_modules/.bin` at the front of the child process PATH. This
ensures project-local binaries (oxlint, tsc, etc.) resolve without a global
install, matching the behaviour of `npm run` / `pnpm run`.

Previously the MCP server inherited Claude Code's PATH, which does not include
`node_modules/.bin`. Any tool missing from the global PATH (e.g. oxlint installed
only locally) would ENOENT and fall through to the pnpm fallback, which in turn
fails on repos using `just` rather than a root-level `pnpm lint` script.
