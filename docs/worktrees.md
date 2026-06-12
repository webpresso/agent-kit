---
type: guide
last_updated: 2026-06-12
---

# Worktrees

## Managed root

Agent-kit managed worktrees live under the user-global root:

```text
~/.agent/worktrees/
```

Repos are namespaced below that root so same-name checkouts do not collide. Use
`wp worktree root` to print the current repo's managed root, or
`wp worktree root --all` to print the global root.

## Creating one with `wp`

The package `bin` entrypoint is hard-cut to `bin/wp`, surfaced to users as
`wp`. Managed repos mutate linked worktrees through `wp worktree` so the global
registry and blueprint owner bindings stay consistent.

The worktree helper accepts an explicit branch, but can also generate one for
quick agent lanes:

```bash
wp worktree new
# branch: agent/2026-05-13-1427-x9k
# path:   ~/.agent/worktrees/repos/<repo-namespace>/agent-2026-05-13-1427-x9k

wp worktree new --name "fix login flow"
# branch: agent/fix-login-flow
# path:   ~/.agent/worktrees/repos/<repo-namespace>/agent-fix-login-flow

wp worktree new feat/auth --base main
```

Generated branches use the `agent` prefix by default. Override it with
`--prefix <prefix>`, and use `--dry-run` to preview the resolved branch/path
without creating anything.

`wp worktree new --path ...` is intentionally rejected in managed repos. To
recover or claim an existing checkout, use:

```bash
wp worktree adopt <blueprint-slug> <path>
wp worktree rebind <blueprint-slug> [--path <path>]
```

## Blueprint owner worktrees

Executable blueprints (`type: blueprint`, `status: in-progress`) own exactly one
visible owner worktree. Starting a blueprint binds that owner checkout:

```bash
wp blueprint start <slug>
```

The owner uses branch `bp/<slug>` and the path:

```text
~/.agent/worktrees/repos/<repo-namespace>/blueprints/<slug>/owner
```

Blueprint frontmatter records only path-free owner metadata:

```yaml
worktree_owner_id: owner-...
worktree_owner_branch: bp/<slug>
```

Absolute paths live in the user-global registry/cache, not in tracked
blueprints. Parking or finalizing a blueprint clears owner metadata and registry
ownership. The visible checkout is not force-deleted; clean it up later through
`wp worktree remove` / `wp worktree prune --all`.

## Global inventory and migration

Foreground inventory is cache-backed:

```bash
wp worktree list --all
wp worktree prune --all
```

Refresh live git state explicitly when needed:

```bash
wp worktree refresh
wp worktree refresh --repo <repo-root>
```

Legacy sibling `_worktrees` roots can be migrated with:

```bash
wp worktree migrate
```

The migrator reports locked or manual cases instead of preserving two managed
root conventions.

## Scratch worktrees

Internal generated runners, such as `local-worktree`, use hidden scratch
worktrees below the owning blueprint namespace:

```text
~/.agent/worktrees/repos/<repo-namespace>/blueprints/<slug>/.scratch/<lane>-<id>
```

Scratch worktrees are non-owner sandboxes for read, verify, test, lint, e2e, or
research lanes. Mutating implementation work for a blueprint belongs in the
visible owner worktree. If truly concurrent mutating work is needed, split it
into child blueprints so each child has its own owner checkout.

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
