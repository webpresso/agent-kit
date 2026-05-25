---
type: core
last_updated: 2026-04-22
---

# Parallel Execution Guide

Execute blueprint-shaped work with a parallel orchestration surface while
keeping blueprint lifecycle state on the shipped `wp blueprint` surface.

> [!NOTE]
> **Canonical reference:** `.agent/commands/pll.md`
> This file is a summary. See the command file for full details.

## Quick Start

```bash
# 1. Move a blueprint into active lifecycle state
wp blueprint start <slug>

# 2. Inspect the active plan
wp blueprint show <slug>

# 3. Execute via the parallel orchestration surface
/pll blueprints/in-progress/<slug>/_overview.md

# 4. Monitor and complete
wp blueprint show <slug>
wp blueprint audit --all --strict
wp blueprint finalize <slug>
```

## Architecture

The plan execution surface has three layers:

1. **Blueprint lifecycle** (`wp blueprint start/task/finalize/audit`) —
   durable repo-owned plan state.
2. **Blueprint DAG helpers** (`webpresso/blueprint`) — task graph,
   executor, and related local analysis utilities.
3. **Parallel operator workflow** (`/pll`, parallel-lane commands,
   subagents / team lanes) — prompt / skill-driven orchestration over the
   repo state.

## Core Rules

| Rule                                      | Implementation                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| **Blueprint is canonical**                | Task / lifecycle truth lives in the blueprint file plus shipped `wp blueprint` commands |
| **No direct `move` for normal execution** | `move` is recovery-only; use `start`, `task ...`, and `finalize`                 |
| **Operator UX is separate**               | `/pll` and lane commands are orchestration surfaces, not durable state stores    |
| **Generic engine vs adapter**             | The parallel engine is reusable; `/pll` is the blueprint-aware adapter           |
| **Verification stays repo-owned**         | Use `wp blueprint audit`, targeted tests, lint, and typecheck to prove completion |

> [!NOTE]
> Blueprint markdown is allowed to be historically mixed. For execution
> safety, rely on `wp blueprint show <slug>` and
> `wp blueprint audit --all --strict` instead of assuming every blueprint
> matches one final section template.

## How It Works

When `/pll` is used with a blueprint path or active blueprint context:

1. `wp blueprint show <slug>` or the blueprint file provides the durable
   task list.
2. The orchestrator decides which tasks are ready and which can safely run in
   parallel.
3. Ready work is delegated through the available parallel execution surface.
4. Lifecycle state is written back through
   `wp blueprint task start|block|unblock|complete`.
5. Completion is proved with repo verification commands, then the blueprint
   is finalized through `wp blueprint finalize <slug>`.

## References

- **Canonical command**: `.agent/commands/pll.md`
- **Lifecycle CLI**: the shipped `wp blueprint` subcommands
- **DAG engine**: `webpresso/blueprint` DAG helpers
