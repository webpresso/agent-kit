---
type: guide
title: WP secret orchestration errors
last_updated: "2026-06-26"
---

# WP secret orchestration errors

This page is the stable docs target for secret-orchestration error envelopes.
`wp secrets`, `wp preview`, and related secret-scoped commands return `WP_*`
codes plus a `docsUrl` that points back here.

## What these errors cover

The current shipped contract includes:

- committed schema-v1 secret metadata in `.webpresso/secrets.config.json`
- local runtime override metadata in `.git/webpresso/secrets.json`
- provider-backed launch and runtime execution through `wp secrets run`
- preview/bootstrap flows that reuse the same metadata and sink planning

## Fast triage

1. Run `wp config secrets show` to see the local runtime selection path.
2. Run `wp config secrets status` to confirm the provider CLI is available.
3. Run `wp secrets doctor --profile preview --json` to validate metadata and
   profile/sink selection.
4. If the failing command executes a child process, reproduce it with
   `wp secrets run --sink <sink> --profile <profile> -- <cmd>`.

Remember: `doctor` and `status` are metadata/availability checks, not proof of a
live provider secret fetch.

## Common secret/orchestration error codes

### `WP_ERR_COMMAND_FAILED`

A wrapped command failed and returned a structured `WP_*` envelope.

- **Typical cause:** the downstream command exited non-zero.
- **Fix:** inspect the redacted `problem`, `cause`, and `fix` fields in the
  envelope; then rerun the underlying repo-owned command.

### `WP_SECRETS_ACTION_UNKNOWN`

The `wp secrets` subcommand/action is unsupported.

- **Fix:** use `wp secrets doctor`, `wp secrets run`, or
  `wp secrets bootstrap github`.

### `WP_SECRETS_CONFIG_MISSING`

`.webpresso/secrets.config.json` is missing.

- **Fix:** commit repo metadata first. The file must contain metadata only, not
  secret values.

### `WP_SECRETS_CONFIG_INVALID`

`.webpresso/secrets.config.json` is present but does not match the schema-v1
contract.

- **Fix:** run `wp migrate secrets --dry-run --json` or update the config so it
  uses `schemaVersion: 1`, valid `providers`, valid `profiles`, and valid
  `sinks`.

### `WP_SECRETS_PROVIDER_MISSING`

A selected profile points at a provider id that does not exist in the committed
metadata.

- **Fix:** repair the `profiles.<name>.provider` reference or the
  `providers.<id>` entry.

### `WP_SECRETS_RUN_USAGE`

`wp secrets run` did not receive a command after the `--` separator.

- **Fix:** run a full command, for example:

```bash
wp secrets run --sink dev-server --profile preview -- codex
```

### `WP_SECRETS_RUN_FAILED`

The secret-scoped child command failed.

- **Typical cause:** provider CLI auth drift, bad repo command, or downstream
  tool failure.
- **Fix:** verify local provider selection with `wp config secrets status`, then
  retry with a minimal `wp secrets run ...` reproduction.

### `WP_PREVIEW_CONFIG_MISSING`

`wp preview` could not find `.webpresso/secrets.config.json`.

- **Fix:** commit the repo metadata file before using preview/deploy helpers.

### `WP_PREVIEW_INVALID_LANE`

The preview lane is not `preview_main` or `preview_pr_<n>`.

- **Fix:** pass a supported lane name.

### `WP_PREVIEW_FAILED`

Preview orchestration failed.

- **Fix:** inspect the returned envelope and then follow the preview operator
  steps in [`../guides/repo-to-preview-url.md`](../guides/repo-to-preview-url.md).

### `WP_GITHUB_BOOTSTRAP_PROVIDER_MISSING`

The selected bootstrap profile references a provider that is not defined.

- **Fix:** repair the committed `providers` / `profiles` mapping.

### `WP_GITHUB_BOOTSTRAP_UNSUPPORTED`

The selected provider does not implement GitHub bootstrap planning.

- **Fix:** use a supported built-in provider or fall back to manual GitHub
  secret management for that repo.

### `WP_GITHUB_BOOTSTRAP_MISSING_SECRET`

`--apply` was requested but a required environment variable such as
`CI_SECRET_PROVIDER_TOKEN_PREVIEW` or `CI_SECRET_PROVIDER_TOKEN_PRODUCTION` was
not exported locally.

- **Fix:** export the missing value and rerun with `--apply`.

## Notes on legacy compatibility

You may still see older code or migration tooling mention compatibility surfaces
such as the local `{ manager, projectId }` runtime file or legacy wrapper
cleanup. Those paths remain supported for migration safety, but the public
operator contract is the provider-neutral `wp secrets ...` surface documented
here.

## Related docs

- [Secret providers](../secrets/providers.md)
- [Local worktrees and runtime overrides](../secrets/local-workplaces.md)
- [GitHub bootstrap](../secrets/bootstrap-github.md)
