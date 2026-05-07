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

**MCP readiness sentinel — project-anchored key.** The pretool-guard hook
routes dev-workflow commands (`pnpm test`, `just lint`, `ak ...`) to the
agent-kit MCP tool surface when MCP is alive, falling back to a `just <task>`
recipe otherwise. Earlier the readiness sentinel was keyed to `process.ppid`
— this only worked when the IDE host was the direct parent of BOTH the hook
and the MCP server. Codex CLI's hook spawn topology routes through worker
processes, so the hook's `process.ppid` diverged from the MCP server's
`process.ppid`; the sentinel filename never matched and every dev-workflow
command got the wrong "MCP not ready" denial.

Now keyed to a project anchor (git toplevel containing `process.cwd()`,
falling back to cwd) hashed via SHA-256 → 16-char hex. Both processes resolve
the same anchor independently — works regardless of process tree topology.
Tests use `AK_MCP_SENTINEL_KEY` to pin the key deterministically.
