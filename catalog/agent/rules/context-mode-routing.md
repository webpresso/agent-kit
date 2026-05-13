---
type: rule
slug: context-mode-routing
title: Context-Mode Tool Routing
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-07'
paths: 
  - '**/*'
---

# Context-Mode Tool Routing

Fallback-only note: if SessionStart already injected `WP_ROUTING_BLOCK`, or the
context-mode plugin already injected its own ctx_* guidance, follow that and do
not duplicate it. This rule exists to preserve the same routing in plain repo
contexts where no injected routing block is present.

Use `ctx_*` MCP tools (context-mode) instead of raw Bash/Read for any operation
that produces or processes large output. Keeps the context window clean.

Agent-kit owns `wp_*` dev-workflow routing. If context-mode is installed, it
owns `ctx_*` routing nudges; webpresso should not duplicate them in
SessionStart guidance.

## When to use ctx_* tools

| Trigger | Tool |
| --- | --- |
| Running tests, lint, typecheck, qa, audit | `wp_test`, `wp_lint`, `wp_typecheck`, `wp_qa`, `wp_audit` |
| Shell commands producing >20 lines | `ak_session_execute` or `ak_session_batch_execute` |
| Multiple commands + searches in one shot | `ak_session_batch_execute` |
| Searching previously indexed content | `ctx_search` |
| Fetching web pages / remote docs | `ctx_fetch_and_index` |
| Log analysis, data processing, computation | `ctx_execute` / `ctx_execute_file` |

## Hard rules

- **Never** use raw `Bash` for commands that produce >20 lines — use `ak_session_execute`.
- **Never** use `WebFetch` — use `ctx_fetch_and_index`.
- **Never** use `Read` for large-file analysis — use `ctx_execute_file`.
- `Bash` is for: `git`, `mkdir`, `rm`, `mv`, navigation only.
- `Read` is for: files you intend to immediately `Edit`.

## Think in code

When `ctx_batch_execute` commands produce data to analyze, count, compare, or
transform — add a JS processing step that `console.log()`s only the answer.
Never pull raw output into context to reason over it manually.

## Forbidden alternatives (use wp_* instead)

`webpresso project test`, `bun run test`, `webpresso project lint`,
`webpresso project check`, `bun run lint`, `bun run e2e`, `bun run typecheck`,
`vitest`, `oxlint`, `tsc`

`pnpm` variants are legacy-fallback equivalents and should be avoided in normal
agent guidance.

## Ownership boundary

- webpresso owns `wp_*` dev-workflow routing and MCP-shaped deny wording
- context-mode owns its own `ctx_*` nudging when that plugin is installed
- rtk owns `rtk *` shell-tool filtering for the long-tail command surface
- this rule is fallback-only; it should not compete with SessionStart routing
- `.omx` is runtime/state, not a direct hook surface
