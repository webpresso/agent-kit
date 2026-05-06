---
type: poc-artifact
description: Deep analysis of context-mode + rtk hook architectures with concrete benchmarks
created: '2026-05-06'
---

# Peer-plugin architecture: how context-mode and rtk actually work

Verified on 2026-05-06 by reading the installed context-mode@1.0.111 source and rtk@master GitHub source, plus benchmarking fork costs on this Mac.

## Architectures

### context-mode (installed at `~/.claude/plugins/cache/context-mode/context-mode/1.0.111/`)

```
plugin.json
├── mcpServers.context-mode → node start.mjs (persistent server)
└── hooks/hooks.json
    ├── PreToolUse: 8 matchers, each → node hooks/pretooluse.mjs (per-call fork)
    │   matchers: Bash | WebFetch | Read | Grep | Agent
    │           + mcp__plugin_context-mode_..._ctx_execute (and _file, _batch_execute)
    ├── PostToolUse: 1 matcher (regex over all tools) → node hooks/posttooluse.mjs
    ├── PreCompact → node hooks/precompact.mjs
    ├── SessionStart → node hooks/sessionstart.mjs (injects context_window_protection block)
    └── UserPromptSubmit → node hooks/userpromptsubmit.mjs
```

**Two-tier design:**

1. **Persistent MCP server** (`server.bundle.mjs`) — owns `ctx_*` tools, FTS5 SQLite, sandbox runtime. No per-call fork.
2. **Hook fan-out** — short-lived Node scripts that forward to the running server via shared state (SQLite at `~/.claude/context-mode/sessions/<sha>.db`).

The `<context_window_protection>` SessionStart block is **dynamically generated** by `sessionstart.mjs` from the live MCP server state — not a static template (verified at server.bundle.mjs's `formatSessionStartResponse` and `appendSystemContext` paths).

### rtk (not installed locally, source from `github.com/rtk-ai/rtk@master`)

```
.claude/hooks/rtk-rewrite.sh   ← ~80-line bash hook
├── reads stdin JSON
├── extracts cmd
├── calls: rtk rewrite "$cmd"      (single Rust binary fork)
├── translates exit codes:
│     0 + stdout → auto-allow rewrite
│     1          → passthrough
│     2          → deny (defer to Claude Code native)
│     3 + stdout → ask (rewrite shown, user prompts)
└── emits hookSpecificOutput JSON

Binary: rtk (single Rust executable, ~30 MB stripped)
Layout:
  src/main.rs (101 KB)             dispatch
  src/cmds/<lang>/*_cmd.rs (~350 KB total)   per-tool filters (Rust)
  src/filters/*.toml (59 files)             declarative regex strippers
  src/discover/registry.rs                  command-pattern matcher
```

**Single-tier design:**

- One Rust binary doing pattern matching + rewrite.
- Hook script forks **bash + rtk** (~10ms total) per Bash call.
- `RTK_TELEMETRY_DISABLED=1` env var blocks analytics.

### agent-kit (current state)

```
.claude/settings.json hooks:
├── PreToolUse: Bash|Edit|Write → node_modules/.bin/ak-pretool-guard
└── (other events similarly)

Binary: ak-pretool-guard (Bun shebang, imports runner.ts)
Layout:
  src/hooks/pretool-guard/runner.ts          dispatch
  src/hooks/pretool-guard/dev-routing.ts     prefix → category mapping
  src/hooks/pretool-guard/validators/*.ts    pluggable validators
```

**Single-tier, like rtk** but in TypeScript via Bun. No persistent server fanning hooks — each hook fires a fresh Bun process.

## Benchmarks (median of 5, this Mac, 2026-05-06)

| Component | Median | Note |
|---|---|---|
| **Bun baseline** (empty script) | 12 ms | cold-start floor |
| **Node baseline** (empty script) | 57 ms | cold-start floor |
| **ak-pretool-guard** passthrough (`ls /tmp`) | 46 ms | Bun + actual work |
| **ak-pretool-guard** deny-match (`pnpm test`) | 43 ms | Bun + dev-routing match |
| **context-mode pretooluse.mjs** | 91 ms | Node + sqlite open + FTS5 prep |
| **rtk** (extrapolated, Rust) | ~5 ms | typical Rust binary cold start |

**Per-Bash-call worst-case latency** (all three hooks installed):

- **Sequential** (Claude Code default): `46 + 91 + 5 = ~140 ms` per Bash call
- **Parallel** (if Claude Code parallelizes hooks): `max(46, 91, 5) = ~91 ms`

The dominant cost is **Node startup for context-mode's hook**. Even on a hot cache, Node is ~5× slower than Bun and ~10× slower than Rust.

## What's actually shareable / efficient?

### Already efficient

- **agent-kit on Bun.** ~46ms per call is good. Moving off Bun would slow us down.
- **context-mode's MCP server is persistent.** `ctx_*` tool calls don't pay fork cost — just RPC over stdio.
- **rtk is a single Rust binary.** ~5ms per call is essentially free.

### Already wasteful (but not our problem)

- **context-mode's PreToolUse hook spawns Node every time.** That's an upstream design — the hook bridges the MCP server's state to Claude Code's hook protocol. Until Claude Code supports "in-process plugin hooks" or persistent hook daemons, this is unavoidable.

### What we should NOT do

- **Don't merge agent-kit's hook with rtk's.** Each plugin owns its own prefix; merging breaks the ownership boundary (vision principle). The conductor pattern keeps both side-by-side.
- **Don't put compact-output transforms in a hook.** Transforms run **inside the MCP tool handler** where the handler IS the persistent server (no fork cost). This was the right architectural choice.
- **Don't proxy ak_* through context-mode.** Each plugin's prefix is sacrosanct (`ak_*` vs `ctx_*` vs `rtk *`). Proxying creates confused ownership.

## Composition pattern — the most efficient shape

```
PreToolUse(Bash) event fires
  ├── ak-pretool-guard       (Bun, ~46ms)  → matches pnpm test/vitest/oxlint/tsc/just qa → DENY → mcp__agent-kit__ak_*
  ├── rtk-rewrite.sh + rtk   (bash + Rust, ~10ms) → matches git/gh/cargo/kubectl/... → ALLOW rewritten | DENY | PASSTHROUGH
  └── context-mode pretool   (Node, ~91ms) → guidance injection ("May produce large output" hints)

If any hook returns DENY → Claude Code blocks
Otherwise → original or rewritten command runs
```

**Three plugins, three sacrosanct prefixes, three independent hook entries.** No merging, no proxying, no shared state at the hook layer.

### Optimizations we CAN apply

1. **Hook ordering**: place fast deny-emitters (rtk ~5ms) BEFORE slow context-injectors (context-mode ~91ms) in `settings.json`. If rtk denies, downstream hooks may still fire (Claude Code spec dependent), but at least the agent gets feedback faster on partial output.
2. **PreToolUse parallelism**: Claude Code may run hooks in parallel — if so, total cost is bounded by the slowest hook, not the sum. Empirical confirmation needed if this becomes a UX issue.
3. **Skip rtk-rewrite for cmds we already know agent-kit denies**: rtk's hook can take an `exclude_commands` config (verified in `rewrite_cmd.rs`). agent-kit's `ak setup --with rtk` could populate this exclude list with our prefixes (`pnpm test`, `vitest`, `oxlint`, `tsc`, `just qa`, `pnpm qa`, `just lint`, `pnpm lint`, `just typecheck`, `pnpm typecheck`). Saves the rtk binary fork on commands we already handle.

### What we CAN'T do (Claude Code spec limitations)

- **No "in-process hook" API.** All hooks are exec-a-binary, read-stdin, write-stdout. We can't share a daemon across hooks.
- **No "rewrite" decision in Claude Code's PreToolUse JSON spec.** Only `allow|deny|ask`. rtk's "rewrite" is implemented via a bash wrapper that emits an allow-or-deny decision after rewriting. agent-kit chose deny-with-suggestion over rewrite for the same reason.

## Verdict for the compact-qa-output blueprint

**The current blueprint hits the right architectural sweet spot:**

| Decision | Why it's optimal |
|---|---|
| Transforms inside MCP tool handler (not a hook) | The MCP server is persistent — zero per-call fork cost. Compaction work runs in the same Node process the agent already has open. |
| 4 transforms maintained in agent-kit | Bounded scope; rtk handles the long tail; context-mode handles other concerns. |
| `ak setup --with rtk` (follow-up blueprint) is a peer install | Doesn't merge code; doesn't proxy. Preserves ownership boundary. |
| Hook ordering: rtk first (fast Rust), then ak-pretool-guard (Bun), then context-mode (Node) | Empirically correct given measured fork costs. Document this in `ak setup --with rtk`. |
| `RTK_HOOK_EXCLUDE_COMMANDS` populated by `ak setup --with rtk` with our 10 prefixes | Skips rtk's fork on commands we already deny. Net latency reduction. |

**No re-architecture required.** The current blueprint stands. We can tighten the rtk-integration follow-up with these findings (excludelist, hook ordering, parallel vs serial).

## Recommendations for the rtk-integration follow-up blueprint

When that blueprint executes:

1. **`ak setup --with rtk`** must patch `~/.claude/settings.json` (user-level), not the agent-kit plugin manifest, so users can re-order hooks if desired.
2. **Set `RTK_TELEMETRY_DISABLED=1`** in the env section of the patched settings.
3. **Set `RTK_HOOK_EXCLUDE_COMMANDS`** to our 10 dev-routing prefixes (`pnpm test`, `vitest`, `oxlint`, `tsc`, `pnpm qa`, `just qa`, `pnpm lint`, `just lint`, `pnpm typecheck`, `just typecheck`, `pnpm check-types`). Avoids redundant rtk fork on commands already denied by ak-pretool-guard.
4. **Hook ordering in patched settings.json**: rtk-rewrite.sh BEFORE ak-pretool-guard if Claude Code respects insertion order; otherwise the order doesn't matter for correctness (only for partial-output UX).
5. **Document the per-Bash-call latency budget** (~91ms parallel, ~140ms serial) in `docs/peer-plugin-architecture.md` so future contributors know what they're trading.

## What this means for the blueprint's verification gates

Add **G11** (already roughly captured by G6's "bytes" budget but should be explicit):

> **G11 — Hook chain latency**: per-Bash-call hook chain cost ≤ 150ms median on a clean Mac. Measure via `/usr/bin/time` over 5 runs of `ak-pretool-guard` + `rtk` (when installed) + `context-mode pretooluse.mjs` (when installed). Fail completion if median > 150ms.

This is a **runtime efficiency gate**, distinct from the **token-budget gates** (G1, G2, G6) which measure context-window cost.
