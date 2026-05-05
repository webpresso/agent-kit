---
type: guide
last_updated: 2026-05-05
---

# Worktrees

## What inherits

When Claude Code uses:

```json
{
  "worktree": {
    "symlinkDirectories": [".claude"]
  }
}
```

new git worktrees inherit the main checkout's `.claude/` directory through a
symlink. That means the worktree reuses:

- hook wiring from `.claude/settings.json`
- Claude rule entries from `.claude/rules/`
- any other agent-surface files stored under `.claude/`

## What is surprising

If `.claude/rules/*.md` are symlinks into a catalog or another source tree,
the worktree reads those same targets too. In practice that means worktree
behavior follows the main checkout's agent surface rather than creating a
second, isolated `.claude/` configuration.

This is usually what we want:

- one repo-level agent contract
- no manual `ak setup` after every worktree creation
- no drift between main and worktree hook/rule wiring

## When to diverge

Diverging from the inherited `.claude/` surface should be rare. Only do it
when you intentionally need worktree-specific hook or rule behavior for a
short-lived experiment.

If you need that:

1. remove `.claude` from the local worktree's `symlinkDirectories`
2. create a worktree-local `.claude/`
3. accept that you now own the drift and must re-run setup/sync manually

## Anti-pattern

Do not rely on `prepare: ak setup` in `package.json` to keep worktrees in sync.
`prepare` fires during install, before the full runtime surface is reliably
available, and creates confusing bootstrap failures. Use the explicit bootstrap
surface instead:

```bash
pnpm install && pnpm setup:agent
```

See also: [`/Users/ozby/repos/webpresso/agent-kit/VISION.md`](/Users/ozby/repos/webpresso/agent-kit/VISION.md)
