---
type: guide
last_updated: '2026-06-19'
---

# WP secret orchestration errors

This page is the stable docs target for secret-orchestration error envelopes
that use `WP_*` codes and `--json` output.

## `WP_ERR_COMMAND_FAILED`

- **Problem:** a wrapped command failed and returned non-zero output.
- **Cause:** the underlying command exited non-zero.
- **Fix:** inspect the redacted evidence payload and fix the command-specific
  failure before retrying.

## `WP_SECRET_CONFIG_INVALID`

- **Problem:** the committed or runtime secret metadata is malformed.
- **Cause:** the config shape does not match the supported schema contract.
- **Fix:** update `.webpresso/secrets.config.json` to the supported schema and
  rerun the command.

## `WP_SECRET_PROVIDER_FAILURE`

- **Problem:** the selected secret provider could not bootstrap or resolve
  secret material.
- **Cause:** provider auth, capability, or environment selection failed.
- **Fix:** repair the provider configuration or token, then rerun the command.
