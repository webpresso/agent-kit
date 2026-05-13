---
type: rule
slug: context-mode-routing
title: Context-Mode Tool Routing
status: deprecated
deprecation_date: '2026-05-13'
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-13'
paths: 
  - '**/*'
---

# Context-Mode Tool Routing

> **DEPRECATED (lane-2 ownership transferred)**
>
> Lane-2 memory is now owned by `ak_session_*` (agent-kit in-process SQLite + FTS5).
> Context-mode (ELv2) is no longer the default lane-2 provider. If context-mode is
> explicitly installed by the user for non-lane-2 purposes, its `ctx_*` routing
> is still valid for data processing. Otherwise, use `ak_session_*` for session
> memory operations.
>
> Migration: `ak setup` removes context-mode MCP entries from `.claude-plugin/plugin.json`
> with a timestamped backup. To restore: copy `plugin.pre-session-memory-backup.<ts>.json`
> back to `plugin.json`. To opt out: pass `--keep-context-mode` to `ak setup`.

Fallback-only note: if SessionStart already injected `AK_ROUTING_BLOCK`, or the
context-mode plugin already injected its own ctx_* guidance, follow that and do
not duplicate it. This rule exists to preserve the same routing in plain repo
contexts where no injected routing block is present.

## Lane-2 routing (new: ak_session_*)

| Trigger | Tool |
| --- | --- |
| Searching session memory / prior context | `ak_session_search` |
| Restoring context after compaction | `ak_session_restore` |
| Manually saving a decision or finding | `ak_session_capture` |
| Snapshotting state before risky operation | `ak_session_snapshot` |

## Output sandboxing (lane-2 owned by ak_session_*)

Use these tools for any shell command that may produce large output:

| Trigger | Tool |
| --- | --- |
| Shell commands producing >20 lines | `ak_session_execute` |
| Multiple commands + searches in one shot | `ak_session_batch_execute` |
| Searching previously indexed output | `ak_session_search` |

## Legacy ctx_* tools (context-mode still installed)

If context-mode is explicitly installed alongside agent-kit for non-lane-2 purposes,
the following routing applies for data-processing operations only:

| Trigger | Tool |
| --- | --- |
| Shell commands producing >20 lines | `ak_session_execute` (preferred) or `ctx_execute` |
| Multiple commands + searches in one shot | `ak_session_batch_execute` (preferred) or `ctx_batch_execute` |
| Searching previously indexed content | `ctx_search` |
| Fetching web pages / remote docs | `ctx_fetch_and_index` |
| Log analysis, data processing, computation | `ctx_execute` / `ctx_execute_file` |

## Hard rules

- **Never** use raw `Bash` for commands that produce >20 lines — use `ak_session_execute`.
- **Never** use `WebFetch` — use `ctx_fetch_and_index` (or index via `ak_session_execute`).
- **Never** use `Read` for large-file analysis — use `ctx_execute_file`.
- `Bash` is for: `git`, `mkdir`, `rm`, `mv`, navigation only.
- `Read` is for: files you intend to immediately `Edit`.

## Ownership boundary

- agent-kit owns `ak_*` dev-workflow routing and `ak_session_*` lane-2 memory (MIT)
- context-mode (ELv2) is no longer lane-2 by default — deprecated for new installs
- rtk owns `rtk *` shell-tool filtering for the long-tail command surface (MIT)
- gstack owns lane-4 interactive/browser workflows (MIT)
- this rule is fallback-only; it should not compete with SessionStart routing
- `.omx` is runtime/state, not a direct hook surface
