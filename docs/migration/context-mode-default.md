---
title: context-mode default setup boundary
type: migration
last_updated: 2026-05-28
---

# context-mode default setup boundary

`context-mode` is in the default `wp setup` preset set. The setup command wires
its host entries on developer workstations, but the published
`@webpresso/agent-kit` package still does not bundle the external tool. Upstream
license notice and provenance stay recorded in
[`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md).

## Default behavior

```bash
wp setup
```

When setup runs outside CI and `WP_SKIP_CONTEXT_MODE` is not set to `1`, it
writes these context-mode surfaces:

- `[mcp_servers.context-mode]` in Codex config
- `context-mode hook codex ...` entries in Codex hooks
- context-mode Codex feature gates (`[features].hooks` / `[features].plugin_hooks`)
- `context-mode` entries in `opencode.json`

Setup skips this lane in CI and when `WP_SKIP_CONTEXT_MODE=1` is set, matching
other workstation-only integrations that should not break hosted automation.

## Explicit invocation

`--with context-mode` remains accepted and idempotent:

```bash
wp setup --with context-mode
```

Use it when you want to be explicit in scripts or docs, but it is no longer
required for the normal workstation path.

## Clean-install verification

Run the license surface checks:

```bash
pnpm run license:check
```

That runs `wp audit open-source-licenses` (root `LICENSE`,
`THIRD-PARTY-NOTICES.md`, vendored skill provenance, and tarball inclusion) and
`scripts/verify-no-context-mode.sh`, which packs the current package and fails if
`context-mode` appears in the resulting dependency metadata.
