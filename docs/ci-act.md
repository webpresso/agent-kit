---
type: guide
last_updated: '2026-05-24'
---

# Secret-safe CI act contract

`wp ci act` is the public CLI contract for local GitHub Actions reproduction.
`wp_ci_act` is the matching MCP tool. Both surfaces use the provider-neutral
secret gate (`with-secrets --env-profile ...`) and the shared agent-kit CI act
argv builder.

## Allowed public inputs

- workflow id or workflow file path
- job id
- event name (`pull_request`, `push`, or `workflow_dispatch`)
- event payload path
- secret-gate env profile
- runner image and container architecture
- execute vs dry-run

Bare workflow ids resolve to `.github/workflows/<id>.yml`. Dry-run is the
default and returns a redacted command preview.

## Forbidden public inputs

The public helper does not accept secret-bearing or mutation-oriented argv:

- `--chef-token`
- `--direct`
- `--allow-local-chef-token`
- `--allow-host-mutation`
- arbitrary passthrough argv
- public `act --secret`, `--secret-file`, bind, volume, or container mutation flags
- consumer repo-local adapter paths such as `apps/scripts/src/ci/act.ts` or
  `apps/scripts/src/lib/with-secrets.ts`

MCP may create an internal temporary `act --secret-file` after secrets have
already crossed the approved secret-gate/profile boundary. Public structured
metadata redacts the temp path as `[INTERNAL_SECRET_FILE]`, and the file is
removed after the call.

## Secret handling

Secrets must arrive through approved env/profile channels, not argv. Returned
stdout, stderr, raw output, JSON content, and structured metadata are redacted
before they are exposed to the agent.
