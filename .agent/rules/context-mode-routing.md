---
paths:
  - '**/*'
---

# Context-Mode Tool Routing

Fallback-only note: if SessionStart already injected `AK_ROUTING_BLOCK`, or the
context-mode plugin already injected its own ctx_* guidance, follow that and do
not duplicate it. This rule exists to preserve the same routing in plain repo
contexts where no injected routing block is present.

Use `ctx_*` MCP tools (context-mode) instead of raw Bash/Read for any operation
that produces or processes large output. Keeps the context window clean.

## When to use ctx_* tools

| Trigger | Tool |
| --- | --- |
| Running tests, lint, typecheck, qa, audit | `ak_test`, `ak_lint`, `ak_typecheck`, `ak_qa`, `ak_audit` |
| Shell commands producing >20 lines | `ctx_execute` or `ctx_batch_execute` |
| Multiple commands + searches in one shot | `ctx_batch_execute` |
| Searching previously indexed content | `ctx_search` |
| Fetching web pages / remote docs | `ctx_fetch_and_index` |
| Log analysis, data processing, computation | `ctx_execute` / `ctx_execute_file` |

## Hard rules

- **Never** use raw `Bash` for commands that produce >20 lines — use `ctx_execute`.
- **Never** use `WebFetch` — use `ctx_fetch_and_index`.
- **Never** use `Read` for large-file analysis — use `ctx_execute_file`.
- `Bash` is for: `git`, `mkdir`, `rm`, `mv`, navigation only.
- `Read` is for: files you intend to immediately `Edit`.

## Think in code

When `ctx_batch_execute` commands produce data to analyze, count, compare, or
transform — add a JS processing step that `console.log()`s only the answer.
Never pull raw output into context to reason over it manually.

## Forbidden alternatives (use ak_* instead)

`just test`, `pnpm test`, `just lint`, `just qa`, `vitest`, `oxlint`, `tsc`

## Ownership boundary

- agent-kit owns `ak_*` dev-workflow routing and MCP-shaped deny wording
- context-mode owns its own `ctx_*` nudging when that plugin is installed
- rtk owns `rtk *` shell-tool filtering for the long-tail command surface
- this rule is fallback-only; it should not compete with SessionStart routing
- `.omx` is runtime/state, not a direct hook surface
