---
type: guide
last_updated: '2026-05-24'
---

# Secret-safe CI act contract

`wp ci act` is the public CLI contract for local GitHub Actions reproduction.
`wp_ci_act` is the matching MCP tool. Both surfaces use the provider-neutral
secret gate (`with-secrets --runtime-profile ...` plus optional
`--secret-env-profile ...`) and the shared webpresso CI act argv builder.

## Allowed public inputs

- workflow id or workflow file path
- job id
- event name (`pull_request`, `push`, or `workflow_dispatch`)
- event payload path
- secret-gate runtime profile
  (`none`, `public`, `secrets-only`, `service-runtime`, `database`, `full`)
- runner image and container architecture
- execute vs dry-run
- provider-specific secret-manager environment/config selector via
  `secretEnvProfile` / `--secret-env-profile` (for example Doppler `dev` or
  Infisical environment slug)

Bare workflow ids resolve to `.github/workflows/<id>.yml`. Dry-run is the
default and returns a redacted command preview.

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
- consumer repo-local adapter paths such as `src/ci/act-helper.ts` or
  `src/secret-gate/runner.ts`

MCP may create an internal temporary `act --secret-file` after secrets have
already crossed the approved secret-gate/profile boundary. Public structured
metadata redacts the temp path as `[INTERNAL_SECRET_FILE]`, and the file is
removed after the call.

## Secret handling

Secrets must arrive through approved runtime/profile channels, not argv.
`envProfile` is intentionally runtime-only; do not pass Doppler/Infisical
config names there. Use `secretEnvProfile` / `--secret-env-profile` for
provider-specific selectors. Returned stdout, stderr, raw output, JSON
content, and structured metadata are redacted before they are exposed to the
agent.
