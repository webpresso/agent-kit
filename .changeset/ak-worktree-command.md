---
"@webpresso/agent-kit": minor
---

Add `ak worktree` command (`new` / `list` / `remove`) for git worktree lifecycle with automatic `.agent/` seeding.

`ak worktree new <branch>` creates a worktree as a sibling directory, runs `scaffoldAgent` to seed `.agent/commands`, `guides`, `workflows`, and `runUnifiedSync` to project `agent-rules/` and `agent-skills/` into the new worktree — so an AI agent dropped into the fresh worktree has rules, skills, and commands available immediately.

`ak worktree list` shows a table of worktrees with branch and short HEAD, marking the current one. `ak worktree remove <branch-or-path>` resolves the target by branch name, directory basename, or full path before invoking `git worktree remove`.
