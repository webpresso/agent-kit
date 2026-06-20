---
type: blueprint
title: "Stateful WP worktree MCP tool"
owner: ozby
status: completed
complexity: M
created: "2026-06-19"
last_updated: "2026-06-20"
progress: "100% (implemented and verified)"
tags:
  - mcp
  - worktrees
  - git
  - safety
---

# Stateful WP worktree MCP tool

## Planning Summary

Agents repeatedly need to create isolated branches/worktrees for parallel PRs. The repo already has `wp worktree` CLI logic and pretool hints that point agents at a non-existent MCP tool. This blueprint adds a stateful MCP surface for safe, structured worktree operations.

This lane is separated because worktree creation/removal mutates the filesystem and git refs. It needs stricter safety contracts than read-only MCP tools.

## Scope

### In scope
- Add `wp_worktree` MCP tool for safe worktree lifecycle operations.
- Reuse existing `wp worktree` CLI/router-dispatch logic where possible.
- Require `execute: true` for mutating operations.
- Protect dirty worktrees, existing paths, branch collisions, and locked worktrees.
- Return structured results and cleanup guidance.

### Out of scope
- PR creation/merge automation.
- Arbitrary git command execution.
- Removing locked worktrees without explicit force support in a later plan.
- Managing external orchestrator internal worktrees.

## Public MCP Contract

```ts
type WpWorktreeInput = {
  cwd?: string
  action: 'list' | 'root' | 'new' | 'remove' | 'prune' | 'refresh'
  name?: string
  branch?: string
  baseRef?: string
  path?: string
  execute?: boolean
  force?: boolean
}

type WpWorktreeOutput = {
  passed: boolean
  summary: string
  action: string
  executed: boolean
  worktrees?: Array<{ path: string; branch?: string; head?: string; locked?: boolean; prunable?: boolean }>
  created?: { path: string; branch: string; baseRef: string }
  removed?: { path: string; branch?: string }
  warnings: string[]
  nextAction?: string
}
```

Mutation rules:
- `list` and `root` are read-only and ignore `execute`.
- `new`, `remove`, `prune`, and `refresh` require `execute: true`.
- `new` defaults to `origin/main` only when no baseRef is supplied and the repo default branch cannot be discovered.
- `remove` refuses dirty or locked worktrees unless a future explicit force contract is implemented and tested.
- Existing path or branch collisions return structured failure without mutation.

## Side-effect Classification

| Action | Side effects | Safety rule |
| ------ | ------------ | ----------- |
| `list`, `root` | Read-only | Safe by default |
| `new` | Creates branch/worktree | Requires `execute: true`; refuse collisions |
| `remove` | Removes worktree | Requires `execute: true`; refuse dirty/locked |
| `prune`, `refresh` | Mutates worktree metadata | Requires `execute: true`; bounded to repo-managed paths |

## Tasks

#### [worktree] Task 1.1: Extract structured worktree operations

- [x] **Status:** done
- **Depends:** None
- **Files:** `src/cli/commands/worktree/*`, new shared helper/tests
- **Steps:** Add tests around existing parser and worktree command behavior; extract structured return values without breaking CLI output; cover collisions, dirty tree, locked worktree, and missing repo.
- **Acceptance:** CLI and MCP can share structured worktree logic.

#### [mcp] Task 1.2: Implement `wp_worktree` MCP tool

- [x] **Status:** done
- **Depends:** Task 1
- **Files:** MCP tool, registry, server tests
- **Steps:** Add zod schemas, wire read-only and mutating actions with `execute` gating, and return summary-first structured output.
- **Acceptance:** The MCP tool safely creates/lists/removes repo worktrees under test.

#### [routing] Task 1.3: Routing and guard alignment

- [x] **Status:** done
- **Depends:** Task 2
- **Files:** pretool guard, routing block, wrapped `wp` hints/tests
- **Steps:** Update hints that currently point at `wp_worktree`, add raw `git worktree` redirect tests, and document when direct git remains acceptable.
- **Acceptance:** Agents have one safe path for worktree lifecycle operations.

## Test Plan

- Worktree parser and shared helper tests.
- MCP tool unit tests for dry/read actions and execute-gated mutations.
- Integration smoke using temporary git repos only.
- Pretool/routing tests.
- `vp run blueprints:check`.
- Final implementation PR: `vp run typecheck`, `vp run lint`, affected tests.

## PR Acceptance Criteria

- [x] Mutating operations cannot run without `execute: true`.
- [x] Dirty or locked worktrees are protected.
- [x] Existing CLI worktree behavior is preserved.
- [x] MCP output is bounded, structured, and actionable.


## Implementation Evidence

Completed on 2026-06-20 in branch `feat/wp-worktree-mcp-20260619`.

- Added `wp_worktree` MCP descriptor with structured output for `list`, `root`, `new`, `remove`, `refresh`, and `prune`.
- Mutating actions return structured refusal unless `execute: true` is supplied.
- `new` refuses branch/path collisions before invoking `git worktree add`; default base ref discovers `origin/HEAD` and falls back to `origin/main`.
- `remove` refuses force, current checkout removal, locked worktrees, and dirty target worktrees before invoking `git worktree remove`.
- List output is capped and registry refresh/cleanup failures return warnings plus explicit next actions.
- Worktree porcelain parsing now captures `locked` and `prunable` flags for CLI/MCP shared logic.
- Pretool raw mutating `git worktree` guidance now points to `wp_worktree` first, with `wp worktree` as CLI fallback.

Verification evidence:

- `./bin/wp test --file src/cli/commands/worktree/core.test.ts --file src/mcp/tools/worktree.test.ts --file src/hooks/pretool-guard/dev-routing.test.ts` → passed
- `./bin/wp test --file src/mcp/tools/_registry.test.ts --file src/mcp/tools/session-docs.test.ts --file src/mcp/tools/worktree.test.ts` → passed
- `vp run typecheck` → passed
- `vp run lint` → passed
- `./bin/wp audit tph` → passed
- `vp run blueprints:check` → passed
