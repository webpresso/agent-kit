---
type: research
title: "Context-mode Plugin Architecture: Patterns for Agent-Kit Adoption"
subject: "How context-mode prevents context bloat in Claude Code plugins — hook output control, MCP routing, FTS5 sandboxing"
date: 2026-04-26
last_updated: 2026-05-01
confidence: high
verdict: adopt
---

# Context-mode Plugin Architecture: Patterns for Agent-Kit Adoption

> Context-mode solves Claude Code context bloat by combining three mechanisms: PreToolUse routing (redirect raw commands → MCP sandbox), FTS5 indexing (raw output → searchable summary), and SessionStart XML injection (tells Claude the rules before it even starts). Agent-kit already has the MCP tools — it's missing the routing layer and the rules injection.

## TL;DR

- Context-mode achieves 98% context reduction by intercepting tool calls in PreToolUse and redirecting them to sandboxed MCP tools that index output to FTS5 and return summaries only
- Its hook architecture separates concerns cleanly: routing logic (platform-agnostic) → formatter (platform-specific JSON) → sentinel (MCP liveness) → suppress-stderr (native module noise)
- Agent-kit already has the MCP side (`wp_qa`, `wp_lint`, `wp_test` returning `{passed: bool, ...}`) — the missing piece is the **routing layer**: PreToolUse intercepting `just test`/`pnpm qa` and redirecting to `wp_test`/`wp_qa`, plus a SessionStart block instructing Claude to use those tools
- The guidance throttle pattern (O_EXCL file per session per guidance type) prevents routing instructions from repeating every tool call — adopt this or Claude gets nagged on every Bash invocation
- suppress-stderr.mjs is load-order-critical: it must be the first import in every hook entry point or native modules (e.g. better-sqlite3) will emit to fd2 and Claude Code interprets any stderr as hook failure

## What This Is

Context-mode (github.com/mksglu/context-mode, 10k stars) is a Claude Code plugin that prevents large tool outputs (build logs, grep results, web pages) from flooding the LLM context window. It does this by:

1. Intercepting tool calls in PreToolUse and redirecting them to MCP sandbox tools
2. Running commands in sandbox tools that index output to FTS5 (SQLite full-text search)
3. Returning only a ~3KB summary to Claude instead of raw output (986KB → 62KB typical)
4. Injecting routing rules via SessionStart `additionalContext` so Claude knows to use sandbox tools proactively

## State of the Art (2026)

Current best practice for Claude Code plugins ([Claude Code hooks docs](https://docs.anthropic.com/en/docs/claude-code/hooks)):

- `hookSpecificOutput.permissionDecision` with `updatedInput` is the approved way to rewrite tool calls transparently
- `hookSpecificOutput.additionalContext` in SessionStart is the approved way to inject persistent model instructions without polluting the conversation
- `systemMessage` in PostToolUse is the approved way to append context the model sees but user doesn't
- `suppressOutput` (parsed but not yet implemented in Claude Code) is intended to hide hook feedback from users

Context-mode is the reference implementation of all four patterns, running at 10k stars and 703 forks. Its architecture is the community consensus for context-efficient plugins as of 2026.

## Positive Signals

### Routing intercept is the correct abstraction

Context-mode's PreToolUse hook does not add validators or block commands — it **rewrites** them. When Claude runs `Bash("grep -r foo src/")`, the hook modifies `tool_input.command` via `updatedInput` to call `ctx_execute(language="bash", code="grep -r foo src/")` instead. The command runs identically but output goes to FTS5 not the context window. This is architecturally cleaner than blocking — Claude doesn't know the difference, there's no error, and the result is available via `ctx_search`.

The `updatedInput` + `permissionDecision: "allow"` combo is key: it auto-approves the rewritten call so the user doesn't see permission prompts.

### Guidance throttle prevents context noise

The guidance shown to Claude ("use ctx_batch_execute instead of Bash for large outputs") is shown **exactly once per session per guidance type** using O_EXCL file creation as an atomic cross-process lock. Without this, every Bash call would inject guidance into context, which is worse than the original problem. The pattern:

```js
const fd = openSync(marker, O_CREAT | O_EXCL | O_WRONLY) // throws EEXIST if shown
closeSync(fd)
// show guidance only here — first process wins
```

### MCP readiness sentinel prevents routing when MCP is down

Before redirecting `Bash → ctx_execute`, the hook checks if the MCP server is alive via a sentinel file at `${tmpdir()}/context-mode-mcp-ready-${process.ppid}`. If MCP is down (crashed, slow to start, user doesn't have it configured), the hook falls through to passthrough — Claude runs the command normally. This prevents the case where every tool call is blocked and the model is paralyzed.

```js
export function isMCPReady() {
  const pid = parseInt(readFileSync(sentinelPath(), "utf8"), 10)
  process.kill(pid, 0) // throws if process doesn't exist → returns false
  return true
}
```

### suppress-stderr is non-negotiable for native modules

Claude Code treats ANY stderr output from a hook as a hook failure or error signal. Native C++ modules (better-sqlite3, etc.) write to fd2 directly, bypassing `process.stderr`. Context-mode's fix: first import in every hook redirects fd2 to `/dev/null` at the OS level:

```js
// suppress-stderr.mjs — MUST be first import
closeSync(2)
openSync(devNull, "w") // acquires fd2 as lowest available
```

This is import-order-sensitive: ESM resolves depth-first so this runs before any native module loads.

### SessionStart XML injection is the right routing instruction surface

Rather than injecting routing instructions into every tool response or conversation message, context-mode injects a `<context_window_protection>` XML block once at session start via `additionalContext`. This XML:
- Names the forbidden tools (Bash for large outputs, Read for analysis)
- Names the preferred tools (ctx_batch_execute, ctx_search)
- Specifies response format (terse, artifacts to files, no inline dumps)
- Handles edge cases (/ctx-stats, /ctx-doctor triggers)

The XML format (not markdown) is intentional — it signals structural instructions vs prose context to the model.

### Normalized decisions + platform formatters is clean separation

Context-mode's routing returns normalized decisions (`{action: "deny", reason}`, `{action: "modify", updatedInput}`, `{action: "context", additionalContext}`) and a separate formatter layer converts to platform-specific JSON. This lets the same routing logic work for Claude Code, Codex CLI, Cursor, VS Code Copilot, Gemini CLI — each with different JSON shapes.

## Negative Signals

### Self-heal complexity is a code smell

The PreToolUse hook contains a ~60-line self-heal block that detects if the plugin cache directory has a stale version name, copies files to a correct-version directory, and patches the registry. This is fragile and indicates the plugin-cache model is not well-designed from the Claude Code side. Agent-kit should avoid this by checking `dist/` into release tags and pinning installs to tags (not `main`).

### FTS5/SQLite adds a dependency chain

Context-mode requires Node.js + Python (for better-sqlite3 build if not prebuilt), and its postinstall is complex enough to need Windows-specific nvm4w junction fixes. For agent-kit's use case (dev tools on developer machines), this complexity isn't needed — the MCP tools already return structured `{passed: bool}` JSON which IS the summary.

### Routing has false-positive risk

The routing layer intercepts any Bash command producing >20 lines of output. This can break commands that legitimately need terminal interaction or whose output isn't large. Context-mode handles this with `allow_patterns` but the list needs maintenance. For agent-kit, the target is narrower (intercept dev tool invocations) which makes false-positives less likely.

## Community Sentiment

The 10k stars and 703 forks on context-mode indicate strong adoption. The `ctx-doctor` verification pattern and the guidance throttle in particular have been praised in issues as solving real pain points. The main community criticism is installation complexity on Windows and the dependency on native modules. Sentiment is strongly positive for Claude Code usage, with more caveats for other platforms.

## Project Alignment

### Vision Fit

Agent-kit's goal is to make agent-driven development seamless — install, test, lint, QA should be one-command operations that Claude can invoke without getting lost in output. The context-mode routing pattern is exactly what makes this possible: instead of `just test` dumping 2000 lines of vitest output into context, `wp_test` returns `{passed: true, summary: "271 tests passed"}` and Claude moves on. **This is load-bearing for the plugin's value proposition.**

### Tech Stack Fit

Agent-kit already has `@modelcontextprotocol/sdk` as a dep and a complete MCP server with `wp_qa`, `wp_lint`, `wp_test`, `wp_typecheck`, `wp_audit`. These tools already return clean `{passed: bool, ...}` JSON structured to avoid context bloat. The missing piece is **the routing layer** — PreToolUse routing `just test` / `pnpm qa` calls to these MCP tools, and SessionStart telling Claude to prefer them.

No new deps needed (no SQLite/FTS5 required — agent-kit's MCP tools already produce summaries). The gap is ~200 lines of routing code and ~50 lines of session injection.

### Trade-offs for Current Stage

Agent-kit is pre-1.0 with one known reference consumer (ingest-lens). The routing layer should be **opt-in via the `agent-hooks` scaffolder** (controlled, not forced), match agent-kit's existing forbidden-commands validator conventions, and degrade gracefully when MCP is unavailable.

## Recommendation

**Adopt** (high confidence). The specific patterns to adopt, in priority order:

### Priority 1 — suppress-stderr in all hook entry points (1 file, ~10 lines)

Create `src/hooks/shared/suppress-stderr.ts` mirroring context-mode's pattern. Import it as the **first line** in every hook entry point (`pretool-guard/index.ts`, `post-tool/lint-after-edit.ts`, `guard-switch/index.ts`, `stop/qa-changed-files.ts`, `sessionstart/index.ts`). Without this, any native module noise causes false hook failures in Claude Code.

### Priority 2 — MCP readiness sentinel in pretool-guard (1 file, ~20 lines)

The pretool-guard currently validates commands unconditionally. Add a sentinel check: write `${tmpdir()}/wp-mcp-ready-${process.ppid}` when the MCP server starts; read it in PreToolUse before attempting to redirect. If MCP is not ready, fall through to passthrough. This prevents pretool-guard from blocking commands when the MCP server hasn't started.

```ts
// src/mcp/cli.ts — after server connects:
writeFileSync(join(tmpdir(), `wp-mcp-ready-${process.ppid}`), String(process.pid))

// src/hooks/pretool-guard/mcp-ready.ts:
export function isMcpReady(): boolean {
  try {
    const pid = parseInt(readFileSync(join(tmpdir(), `wp-mcp-ready-${process.ppid}`), 'utf-8'), 10)
    process.kill(pid, 0)
    return true
  } catch { return false }
}
```

### Priority 3 — SessionStart routing block (1 file, ~40 lines)

Update `src/hooks/sessionstart/index.ts` to inject a routing block alongside the `.agent/routing.md` content. The routing block tells Claude: use `wp_test`, `wp_lint`, `wp_typecheck`, `wp_qa` instead of raw `just test`/`pnpm` commands. Crucially: also define forbidden output patterns (`just test` producing raw vitest logs → use `wp_test` instead).

```xml
<wp_routing>
  <rule>Use wp_test (MCP) instead of just test / pnpm test — returns {passed, summary} not raw logs</rule>
  <rule>Use wp_lint (MCP) instead of just lint / oxlint — returns {passed, violations[]}</rule>
  <rule>Use wp_qa (MCP) for full quality gate — runs lint+typecheck+test in parallel</rule>
  <rule>Use wp_audit blueprint-lifecycle (CLI) for blueprint checks</rule>
</wp_routing>
```

### Priority 4 — PreToolUse routing for dev commands (1 new file, ~60 lines)

Add a routing validator that intercepts `just test`, `pnpm test`, `just lint`, `just qa`, etc. in PreToolUse and responds with:
- `permissionDecision: "deny"` + guidance message pointing to `wp_test`/`wp_qa`
- OR `permissionDecision: "allow"` + `updatedInput` that rewrites the command to call the MCP tool

The guidance throttle pattern (O_EXCL marker per session) is essential — show the routing guidance only once per session, not on every blocked command.

```ts
// One-time guidance per session
const marker = join(tmpdir(), `wp-routing-shown-${process.ppid}`)
try {
  closeSync(openSync(marker, O_CREAT | O_EXCL | O_WRONLY))
  // show guidance only on first interception
} catch { /* already shown */ }
```

### Priority 5 — Doctor skill (1 skill file, ~30 lines)

Add `skills/wp-doctor/SKILL.md` that runs `wp hooks doctor` — verifies each hook bin exists, is executable, exits 0 on empty stdin, and the MCP server starts cleanly. Wire into plugin marketplace description and `wp setup` output.

### What NOT to adopt

- FTS5/SQLite session DB — agent-kit's structured `{passed: bool}` JSON is already the summary; no need to index raw output
- Self-heal block — check `dist/` into release tags instead
- Full routing for Read/WebFetch/Grep — agent-kit's domain is dev tools, not general research assistance

## Sources

1. [context-mode GitHub repo](https://github.com/mksglu/context-mode) — official source, high credibility, neutral/informational
2. [context-mode hooks/pretooluse.mjs](https://raw.githubusercontent.com/mksglu/context-mode/main/hooks/pretooluse.mjs) — source code, high credibility, neutral
3. [context-mode hooks/posttooluse.mjs](https://raw.githubusercontent.com/mksglu/context-mode/main/hooks/posttooluse.mjs) — source code, high credibility, neutral
4. [context-mode hooks/sessionstart.mjs](https://raw.githubusercontent.com/mksglu/context-mode/main/hooks/sessionstart.mjs) — source code, high credibility, neutral
5. [context-mode hooks/core/routing.mjs](https://raw.githubusercontent.com/mksglu/context-mode/main/hooks/core/routing.mjs) — source code, high credibility, neutral
6. [context-mode hooks/core/formatters.mjs](https://raw.githubusercontent.com/mksglu/context-mode/main/hooks/core/formatters.mjs) — source code, high credibility, neutral
7. [context-mode hooks/core/mcp-ready.mjs](https://raw.githubusercontent.com/mksglu/context-mode/main/hooks/core/mcp-ready.mjs) — source code, high credibility, neutral
8. [context-mode hooks/suppress-stderr.mjs](https://raw.githubusercontent.com/mksglu/context-mode/main/hooks/suppress-stderr.mjs) — source code, high credibility, neutral
9. [context-mode hooks/routing-block.mjs](https://raw.githubusercontent.com/mksglu/context-mode/main/hooks/routing-block.mjs) — source code, high credibility, neutral
10. [context-mode hooks/session-directive.mjs](https://raw.githubusercontent.com/mksglu/context-mode/main/hooks/session-directive.mjs) — source code, high credibility, neutral
11. [context-mode .github/workflows/ci.yml](https://raw.githubusercontent.com/mksglu/context-mode/main/.github/workflows/ci.yml) — CI config, high credibility, neutral
12. [Claude Code Hooks reference](https://docs.anthropic.com/en/docs/claude-code/hooks) — official docs, high credibility, neutral
13. [Codex CLI Hooks guide](https://developers.openai.com/codex/hooks) — official docs, high credibility, neutral
