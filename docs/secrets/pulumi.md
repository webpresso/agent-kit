---
type: guide
title: Pulumi secret boundary
last_updated: "2026-06-26"
---

# Pulumi secret boundary

The public v1 Pulumi contract is **env injection only**. Agent Kit does not
create, mutate, or reconcile Pulumi ESC environments for you.

## Command shape

```bash
wp secrets run --sink pulumi --profile preview -- pulumi preview
wp secrets run --sink pulumi --profile production -- pulumi up
```

The `pulumi` sink resolves through the repo-owned schema-v1 metadata in
`.webpresso/secrets.config.json` and runs with the `full` runtime profile.

## What this means

- Repo metadata chooses the provider and environment alias.
- Runtime secret resolution shells out to the selected provider CLI.
- The fetched environment is injected into the Pulumi child process.
- Agent Kit does not persist Pulumi secret values or ESC state.

## Non-goals

- creating Pulumi stacks or backends
- owning deploy policy
- replacing repo-local deploy adapters
- printing secret values for debugging

## Related docs

- [Secret providers](./providers.md)
- [Repo checkout to preview URL](../guides/repo-to-preview-url.md)
- [WP secret orchestration errors](../errors/wp-secret-orchestration.md)
