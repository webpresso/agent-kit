---
paths:
  - '**/*'
---

# Context-Mode Tool Routing

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
