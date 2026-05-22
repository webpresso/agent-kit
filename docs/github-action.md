---
title: GitHub Action — webpresso/agent-kit-action
type: guide
last_updated: 2026-05-11
---

# GitHub Action — webpresso/agent-kit-action

The reusable GitHub Action for CI audit integration lives in a **separate repo**:
`webpresso/agent-kit-action` (to be created at `/tmp/wp-action-repo` — push to GitHub before v0.15.0 ships).

## Quick start (once the repo is pushed)

```yaml
# .github/workflows/agent-kit.yml
jobs:
  agent-kit:
    uses: webpresso/agent-kit-action/.github/workflows/audit.yml@v1
    with:
      pr-comment: true
```

## What it does

Runs `wp audit --all --json` and posts a structured PR comment when `pr-comment: true`.

The action source is at `/tmp/wp-action-repo/` — push to `webpresso/agent-kit-action` on GitHub
as a public repo before the v0.15.0 release. Tag it `v1` after first push.

## Consumer rollout (Task 5.2)

For monorepo and ingest-lens to adopt v0.15.0:

1. Delete legacy outputs (one-time, before bumping):
   ```bash
   rm -rf .claude/rules/ .claude/skills/ .agents/skills/ .cursor/rules/ .windsurf/skills/
   rm -f .windsurfrules .cursorrules
   # Remove wp cursor-windsurf-sync from package.json scripts if present
   ```
2. Bump `webpresso` to `0.15.0` (or `@webpresso/agent-kit` if still on the legacy package)
3. Run `wp setup --with base-kit --with example-skill`
4. Run `wp compile`
5. Run `wp audit --all` (verify clean)
6. Add `.github/workflows/agent-kit.yml` with the action above
7. Commit with lore-protocol message
