---
type: guide
last_updated: '2026-06-07'
---

# Hooks Rollback and Recovery

## Restore from manifest snapshot

If hook configs become corrupted or manually edited, restore from the last known-good manifest:

```bash
wp setup --restore-hooks
```

This reads `.webpresso/hooks-manifest.json` and overwrites the vendor configs to match.

## Per-vendor disable

Disable hooks for a specific vendor without removing them from the manifest:

```bash
wp setup --disable-hooks codex
```

This removes the hooks from `.codex/hooks.json` while keeping the manifest intact.
Re-enable with `wp setup --with hooks --vendor codex`.

## Understanding `generated-inactive`

`generated-inactive` means:
- wp setup wrote the hook configuration files
- But the hooks are not yet registered with the vendor's runtime
- This happens when hooks are generated but the agent CLI hasn't been restarted

Resolution: restart the agent CLI session.

## Full cleanup

To completely remove all wp-managed hooks:

```bash
wp setup --disable-hooks all
```

This removes all hook entries from all vendor configs. The manifest is preserved.
