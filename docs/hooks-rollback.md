---
type: guide
last_updated: "2026-06-07"
---

# Hooks Rollback and Recovery

## Restore from manifest snapshot

If hook configs become corrupted or manually edited, restore from the last known-good manifest:

```bash
wp setup repair --restore-hooks
# agent-kit source repo:
WP_FORCE_SOURCE=1 wp setup repair --restore-hooks
```

This reads `.webpresso/hooks-manifest.json` and overwrites the vendor configs to match. Source-repo restores keep direct hook commands but force JIT/source mode with `WP_FORCE_SOURCE=1`.

## Per-vendor disable

Disable hooks for a specific vendor without removing them from the manifest:

```bash
wp setup --disable-hooks codex
```

This removes the hooks from `.codex/hooks.json` while keeping the manifest intact.
Re-enable with `wp setup repair --restore-hooks` (source repo: `WP_FORCE_SOURCE=1 wp setup repair --restore-hooks`).

## Full cleanup

To completely remove all wp-managed hooks:

```bash
wp setup --disable-hooks all
```

This removes all hook entries from all vendor configs. The manifest is preserved.
