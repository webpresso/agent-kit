---
title: Emergency Rollback — WP_BLUEPRINT_PLATFORM_DISABLED
status: draft
created: 2026-05-12
---

# Emergency Rollback: `WP_BLUEPRINT_PLATFORM_DISABLED=1`

If the platform-api is unreachable, misbehaving, or producing corrupt data,
set this environment variable to disable all platform sync and revert to
fully local (SQLite + markdown-canonical) behavior.

---

## How to set it

### Session-scoped (current shell only)

```bash
export WP_BLUEPRINT_PLATFORM_DISABLED=1
```

### Process-scoped (single command)

```bash
WP_BLUEPRINT_PLATFORM_DISABLED=1 wp blueprint task complete task-1
```

### Persistent (project .env or shell profile)

Add to your shell init file (`~/.zshrc`, `~/.bashrc`) or to the repo's
Doppler secret store under the development environment:

```bash
WP_BLUEPRINT_PLATFORM_DISABLED=1
```

**Never commit this env var to version control as a permanent setting.**
It is an emergency measure; re-enable platform sync once the issue is
resolved (see below).

---

## What stops working when this flag is set

| Feature | Behavior when disabled |
| ------- | ---------------------- |
| `pushEvent` calls | Silently skipped; no events sent to platform-api. |
| Replica refresh (`getSnapshot`) | Not called; local SQLite data is used as-is regardless of TTL. |
| Template catalog (`listTemplates`) | Returns empty list; `wp blueprint new --template` falls back to local templates only. |
| Health check (`healthCheck`) | Returns `{ ok: false, latencyMs: 0 }` immediately without making a network call. |
| `wp blueprint` CLI mutation commands | Write to local SQLite + markdown files only (pre-sync behavior). |
| `wp audit blueprint-lifecycle` | Reads from local SQLite replica only; platform state is not consulted. |

Local history and markdown files remain authoritative and are not affected.
No data is lost — mutations accumulate locally and will sync on re-enable.

---

## How to re-enable

1. Confirm the platform-api issue is resolved (check status page or `ak
   blueprint healthCheck`).
2. Unset the variable:

   ```bash
   unset WP_BLUEPRINT_PLATFORM_DISABLED
   ```

   Or remove it from your shell profile / Doppler config.

3. Trigger a bulk re-sync to push any locally accumulated mutations:

   ```bash
   wp blueprint sync --force
   ```

   This replays buffered events using their original `eventId` values.
   The platform handles duplicates idempotently — re-syncing is safe to
   run multiple times.

4. Verify with:

   ```bash
   wp blueprint healthCheck
   # Expected: { ok: true, latencyMs: <ms> }
   ```

---

## Why this flag exists (CEO review 1A)

The platform sync layer is additive — it should never block local development
workflows.  If the platform is unavailable, agents must be able to continue
working without degradation.  `WP_BLUEPRINT_PLATFORM_DISABLED=1` is the
guaranteed escape hatch that restores pre-sync behavior with a single env var,
without requiring a code change or a package downgrade.

---

## Related

- `WP_BLUEPRINT_PLATFORM_URL` — overrides the default platform-api base URL
  (useful for pointing at a staging environment).
- `WP_BLUEPRINT_REPLICA_TTL_S` — controls how often the local replica is
  refreshed from the platform (default: 30 s).  Set to `0` to always pull.
- `src/blueprint/sync/types.ts` — `BlueprintPlatformClient` interface
  definition (the OSS boundary).
- `blueprints/in-progress/blueprint-platform-sync/notes/api-contract.md` —
  full HTTP wire contract.
