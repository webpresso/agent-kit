---
title: Cloud agents and the blueprint structured store
type: guide
last_updated: 2026-05-11
---

# Cloud agents and the blueprint structured store

Cloud agents (Claude Code Routines, Codex web, Gemini web, OpenCode cloud, etc.) get canonical
state for free — `blueprints/` and `tech-debt/` markdown is committed.

## Setup for cloud agents

```bash
# In your Routine's setup script:
pnpm install
pnpm exec ak setup
```

Any `ak blueprint *` command lazy-rebuilds the SQLite store from markdown on first call.

## Canonical state flow

```
Developer edits markdown  →  git commit  →  PR merge
                                             ↓
Cloud agent cold-starts  →  ak blueprint db build  →  queries via MCP tools
```

**Never write SQLite back from a Routine** — commit the markdown change and open a PR.
The next session rebuilds locally from merged markdown.

## Cross-repo correlation in cloud agents

Cloud agents without `~/.agent/workspace.yaml` fall back to git-clonable URLs declared
per-blueprint in `cross_repo_depends_on` frontmatter:

```yaml
cross_repo_depends_on:
  - repo: webpresso/agent-kit
    slug: agent-asset-compiler-multi-runtime
    require_status: completed
```

The ingester resolves `target_repo` by cloning from GitHub and re-running the DB parser.
This is slower than local workspace resolution but works in any CI/cloud environment.

## Permission model recap

- Same org: resolves automatically
- Cross-org: requires mutual allowlist in both repos' `.agent/correlate.allow.yaml`
- Public → private: `target_slug` is redacted to `private/<sha256>`
- `ak audit cross-repo-correlation` fails loud on any leak — does NOT auto-mutate

See `docs/cross-repo-correlation.md` for the full permission model.
