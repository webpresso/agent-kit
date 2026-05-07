---
"@webpresso/agent-kit": minor
---

Codex hooks scaffolder + gstack opt-out

**Codex hooks schema fix.** `ak setup` now writes `.codex/hooks.json` under the
canonical wrapped `hooks` key (`{ "hooks": { "SessionStart": [...] } }`) per
Codex's official schema at `developers.openai.com/codex/hooks`. Previous
versions wrote event keys at the top level, which Codex silently ignored —
agent-kit hooks were never actually firing in any Codex session. Stale
flat-form entries are migrated automatically: the next `ak setup` hoists any
top-level `SessionStart`/`PreToolUse`/`PostToolUse`/`UserPromptSubmit`/`Stop`
keys into the wrapped `hooks` block, deduping with `ensureGroup`.

**DRY refactor.** The 5-event ak-* hook list now lives in a single
`buildAgentKitHookGroups({ resolveBin, matchers })` helper consumed by both
`patchClaudeSettings` and `patchCodexHooks`. Adding a new ak-* hook is a
one-line append and propagates to both surfaces.

**Gstack opt-out.** `AK_SKIP_GSTACK=1 ak setup` now skips the gstack
scaffolder with a stderr warning. `gstack` remains in `DEFAULT_PRESETS` so
`ak setup` (no flags) still installs and refreshes gstack on every run; the
new env-var is for CI / sandboxed environments without network. Most
consumer repos treat gstack as a hard prerequisite — opt out only when you
must.

**MCP readiness sentinel — decoupled scan-based reader.** The pretool-guard
hook routes dev-workflow commands (`pnpm test`, `just lint`, `ak ...`) to
the agent-kit MCP tool surface when MCP is alive, falling back to a
`just <task>` recipe otherwise. Earlier the readiness sentinel filename was
derived from a value (`process.ppid`, then briefly a project-anchor hash)
that BOTH writer and reader had to agree on. Both approaches break under
real IDE topologies: PPID assumes the IDE host is the direct parent of
both processes (Codex CLI routes hooks through workers), and cwd-derived
keys assume the IDE spawns the MCP server with the project root as cwd
(Codex spawns it with the script's directory).

The fix decouples the two halves. The writer claims a unique filename
(`ak-mcp-ready-${process.pid}` by default, overridable via
`AK_MCP_SENTINEL_KEY` for tests). The reader scans `tmpdir` for ALL
`ak-mcp-ready-*` files and returns true if any contains a live PID
(verified via `process.kill(pid, 0)`). Reader and writer no longer need
to agree on a key — only on a stable filename pattern. The agent-kit MCP
tool surface is functionally global, so "any agent-kit MCP is alive" is
sufficient signal to enable MCP-tool routing on the hook side.
