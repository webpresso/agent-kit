---
type: guide
last_updated: "2026-05-24"
---

# Secret-safe CI act contract

`wp ci act` is the public CLI contract for local GitHub Actions reproduction.
`wp_ci_act` is the matching MCP tool. Both surfaces use the provider-neutral
secret gate (`wp secrets run --sink act --profile <profile> -- ...`) and the shared webpresso CI act argv builder.

## Allowed public inputs

- workflow id or workflow file path
- job id
- event name (`pull_request`, `push`, or `workflow_dispatch`)
- event payload path
- secret-gate runtime profile
  (`none`, `public`, `secrets-only`, `service-runtime`, `database`, `full`)
- runner image and container architecture
- execute vs dry-run
- execution mode:
  - `direct` — run the selected workflow file through `act`
  - `replay` — generate a local replay workflow file first, then run `act`
- repo-owned secret profile name via `secretProfile` / `--secret-profile`,
  resolved from `.webpresso/secrets.config.json`

Bare workflow ids resolve to `.github/workflows/<id>.yml`. Dry-run is the
default and returns a redacted command preview.

## Direct vs replay mode

- `direct` is the default and points `act` at the selected workflow file.
- `replay` generates a temporary local workflow file and points `act` at that
  generated file instead.

Replay mode is for local approximation when `act` cannot faithfully reproduce
GitHub behavior such as reusable-workflow or OIDC-heavy paths. It is explicitly
**not security-equivalent** to GitHub CI.

## Timeout contract

- `wp ci act --execute` uses a dedicated **20 minute** default timeout.
- `wp_ci_act` uses the same default.
- Override with `--timeout-ms <ms>` / `timeoutMs` when a specific workflow needs
  a different budget.
- Overrides are capped at **60 minutes** so hung local `act` runs fail loudly.

This avoids inheriting the generic short-lived command timeout used by the
shared secret-gate runner, which is too small for first-run Docker image pulls
and full local CI rehearsal.

## Forbidden public inputs

The public helper does not accept secret-bearing or mutation-oriented argv:

- `--chef-token`
- `--direct`
- `--allow-local-chef-token`
- `--allow-host-mutation`
- arbitrary passthrough argv
- public `act --secret`, `--secret-file`, bind, volume, or container mutation flags
- provider-specific `secretEnvProfile` / `--secret-env-profile` selectors
- consumer repo-local secret or CI adapter paths

## Secret handling

Secrets must arrive through approved runtime/profile channels, not argv.
`envProfile` is intentionally runtime-only; do not pass Doppler/Infisical
config names there. Use `secretProfile` / `--secret-profile` for
repo-owned aliases declared in `.webpresso/secrets.config.json`; provider-specific environment selectors remain internal implementation details behind those aliases. Returned stdout, stderr, raw output, JSON
content, and structured metadata are redacted before they are exposed to the
agent.
