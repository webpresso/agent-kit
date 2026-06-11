---
type: guide
last_updated: 2026-06-11
---

# Worktrees

## Creating one with `wp`

The package `bin` entrypoint is hard-cut to `bin/wp`, surfaced to users as
`wp`. The worktree helper accepts an explicit branch, but can also generate one
for quick agent lanes:

```bash
wp worktree new
# branch: agent/2026-05-13-1427-x9k
# path:   ../<repo>_worktrees/agent-2026-05-13-1427-x9k

wp worktree new --name "fix login flow"
# branch: agent/fix-login-flow
# path:   ../<repo>_worktrees/agent-fix-login-flow

wp worktree new feat/auth --base main --path ../webpresso-auth
```

Generated branches use the `agent` prefix by default. Override it with
`--prefix <prefix>`, and use `--dry-run` to preview the resolved branch/path
without creating anything.

When `--path` is omitted, generated worktrees are placed under a shared sibling
directory next to the original checkout:

```text
../<original-folder>_worktrees/<branch-or-task-slug>
```

For example, a checkout at `/repos/webpresso` uses
`/repos/webpresso_worktrees/agent-fix-login-flow` for `--name "fix login flow"`.
An explicit `--path` remains an override for intentionally divergent layouts.
Internal generated runners, such as `local-worktree`, use the same sibling root
and append their task-specific id.

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
- no manual `wp setup` after every worktree creation
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

Do not rely on `prepare: wp setup` in `package.json` to keep worktrees in sync.
`prepare` fires during install, before the full runtime surface is reliably
available, and creates confusing bootstrap failures. Use the explicit bootstrap
surface instead:

```bash
vp install && vp run setup:agent
```

See also: [VISION](../VISION.md).
