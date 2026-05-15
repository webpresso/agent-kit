---
title: context-mode is now opt-in
type: migration
last_updated: 2026-05-15
---

# context-mode is now opt-in

As of the current `ak setup` / `wp setup` behavior, `context-mode` is **not**
wired by default.

## Why

The default setup path should remain MIT-only so consumers can avoid inheriting
the ELv2 `context-mode` surface unless they explicitly choose it.

## Default behavior

```bash
wp setup
```

This now installs the standard agent-kit surfaces without:
- `[mcp_servers.context-mode]` in Codex config
- `context-mode hook codex ...` entries in `.codex/hooks.json`
- `context-mode` entries in `opencode.json`

## Opt back in

If you still need the `ctx_*` tools, run:

```bash
wp setup --with context-mode
```

Equivalent:

```bash
ak setup --with context-mode
```

## Consumer migration checklist

1. Re-run setup without `context-mode`:

   ```bash
   wp setup
   ```

2. Verify default host surfaces no longer reference `context-mode`.
3. If your workflows still require `ctx_*`, opt back in explicitly:

   ```bash
   wp setup --with context-mode
   ```

## Clean-install verification

Run the default dependency-tree check:

```bash
bash scripts/verify-no-context-mode.sh
```

This script packs the current package, installs it into a temp project, and
fails if `context-mode` appears in the resulting dependency tree.
