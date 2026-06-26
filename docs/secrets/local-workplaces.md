---
type: guide
title: Local worktrees and runtime overrides
last_updated: "2026-06-26"
---

# Local worktrees and runtime overrides

Agent Kit separates **committed repo metadata** from **local runtime selection**.
That split matters most when you use git worktrees.

## Paths and ownership

| Path                             | Purpose                                                                        | Commit? |
| -------------------------------- | ------------------------------------------------------------------------------ | ------- |
| `.webpresso/secrets.config.json` | Repo-owned schema-v1 metadata (`providers`, `profiles`, `sinks`)               | Yes     |
| `.git/webpresso/secrets.json`    | Local runtime override (`manager`, `projectId`) for the current git common dir | No      |

The runtime override path is resolved with `git rev-parse --git-common-dir`.
That means linked worktrees usually share a single runtime override file under
the common git directory, so `wp config secrets set ...` in one worktree affects
the sibling worktrees for that repo clone.

## What `wp config secrets` does

```bash
wp config secrets show
wp config secrets status
wp config secrets set doppler agent-kit
```

- `show` reads the local runtime override file and prints its path.
- `status` adds provider CLI availability/auth hints.
- `set` writes the local runtime override file.
- `setup` is a compatibility surface; in the published package it currently
  returns guidance instead of bundling a real interactive provider wizard.

These commands do **not** rewrite `.webpresso/secrets.config.json`.

## Merge behavior at runtime

When runtime secret execution resolves config, Agent Kit merges:

1. committed repo metadata from `.webpresso/secrets.config.json`
2. local runtime override metadata from `.git/webpresso/secrets.json`

The local runtime file wins for provider/project selection. The committed file
continues to own `profiles`, so repo profile names like `preview` and
`production` remain stable across every machine.

## Safe worktree workflow

1. Commit `.webpresso/secrets.config.json` once.
2. Run `wp config secrets set <doppler|infisical> <project-id>` on your machine.
3. Verify the repo-owned profile mapping with:

```bash
wp config secrets show
wp config secrets status
wp secrets doctor --profile preview --json
```

Remember: `doctor` and `status` are metadata/availability checks. They do not
prove a live provider fetch. Use `wp secrets run ...` or a repo-owned command
for that proof.

## Related docs

- [Secret providers](./providers.md)
- [GitHub bootstrap](./bootstrap-github.md)
- [WP secret orchestration errors](../errors/wp-secret-orchestration.md)
