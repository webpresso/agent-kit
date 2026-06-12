---
"@webpresso/agent-kit": minor
---

Centralize agent-kit managed git worktrees under `~/.agent/worktrees` and add
blueprint owner-worktree bindings. `wp worktree` now owns managed lifecycle
operations, blueprint start/park/finalize records path-free owner metadata, and
raw mutating `git worktree` commands are routed back to the managed CLI.
