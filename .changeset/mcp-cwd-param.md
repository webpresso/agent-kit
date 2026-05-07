---
'@webpresso/agent-kit': minor
---

Add optional `cwd` param to all MCP dev-workflow tools: `ak_test`, `ak_lint`,
`ak_typecheck`, `ak_qa`, `ak_e2e`, `ak_audit`.

The MCP server inherits the cwd of the Claude Code session that spawned it.
When a session was opened in one repo and called an `ak_*` tool against a
sibling repo, the backend ran against the session's cwd and failed (e.g.
`pnpm test` in a yarn-configured tree returned "This project is configured
to use yarn"; `tsc --noEmit` with no tsconfig at cwd dumped `--help`).

`cwd` is a walk-start: the resolver still walks up to find the workspace
root (pnpm-workspace.yaml / package.json / Justfile), so callers can pass
any subdir of the target repo and get correct backend selection. `ak_qa`
forwards `cwd` to all three sub-tools so a composite QA run from the wrong
session cwd works in one call. `ak_audit` accepts `cwd` as an alias for the
existing `directory` param.

Backwards-compatible: omitting `cwd` preserves prior behavior
(`process.cwd()`).
