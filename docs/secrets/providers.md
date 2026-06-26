---
type: guide
title: Secret providers
last_updated: "2026-06-26"
---

# Secret providers

Agent Kit ships a provider-neutral secret contract. Repos commit **metadata only**
in `.webpresso/secrets.config.json`; local machines keep provider-specific
selection overrides in the git-common-dir runtime file
`.git/webpresso/secrets.json` (or the worktree-shared equivalent returned by
`git rev-parse --git-common-dir`). Secret values are never committed.

## What is public and stable

- `wp config secrets show|status|set|setup` manages the **local runtime
  selection**.
- `wp secrets doctor --profile <name> --json` validates repo metadata,
  sink/profile selection, and provider availability hints.
- `wp secrets run --sink <sink> --profile <profile> -- <cmd>` launches a local
  command through the shared secret runtime.
- `wp secrets bootstrap github --profile <name> --json` plans GitHub Actions
  secret bootstrap; `--apply` performs the mutation.
- `wp migrate secrets --dry-run --json` reports the legacy local scripts and
  workflow patterns that should be replaced.

Compatibility is intentionally preserved in this slice:

- the legacy local `{ "manager", "projectId" }` runtime file still works
- `wp config secrets` stays supported
- legacy wrapper detection and `SECRET_WRAPPER_BINS` guardrails stay in place
- internal `secretEnvProfile` wiring stays internal-only

## Two-layer config model

### 1) Committed repo metadata

Commit `.webpresso/secrets.config.json` with the schema-v1 provider/profile/sink
contract.

```json
{
  "schemaVersion": 1,
  "providers": {
    "default": {
      "type": "doppler",
      "workspace": "acme",
      "workspaceId": "ws_12345",
      "project": "agent-kit"
    },
    "production_infisical": {
      "type": "infisical",
      "project": "agent-kit",
      "projectId": "proj_12345",
      "projectSlug": "agent-kit",
      "identityId": "identity_12345"
    }
  },
  "profiles": {
    "preview": {
      "provider": "default",
      "environment": "preview"
    },
    "production": {
      "provider": "production_infisical",
      "environment": "prod"
    }
  },
  "sinks": {
    "dev-server": {
      "defaultProfile": "preview",
      "allowedOps": ["run"]
    },
    "test": {
      "defaultProfile": "preview",
      "allowedOps": ["run"]
    },
    "e2e": {
      "defaultProfile": "preview",
      "allowedOps": ["run"]
    },
    "deploy-wrangler": {
      "defaultProfile": "preview",
      "allowedOps": ["preview", "deploy", "cleanup"]
    },
    "pulumi": {
      "defaultProfile": "preview",
      "allowedOps": ["up", "verify", "deploy"]
    },
    "act": {
      "defaultProfile": "preview",
      "allowedOps": ["run", "replay"]
    },
    "github-actions-bootstrap": {
      "defaultProfile": "production",
      "allowedOps": ["verify", "apply", "rotate", "revoke"]
    },
    "db-branch": {
      "defaultProfile": "preview",
      "allowedOps": ["create", "connect", "cleanup"]
    }
  }
}
```

Notes:

- `providers.default.type` must be `doppler` or `infisical`.
- Doppler uses `project`; optional `workspace` / `workspaceId` are metadata for
  diagnostics and operator context.
- Infisical accepts `project`, `projectId`, and `projectSlug`; `identityId`
  records the intended CI/OIDC identity.
- `profiles.<name>.environment` is the repo-owned alias that maps preview,
  production, or other operator language to the provider-specific environment
  selector.
- `sinks` are explicit. Unsupported sink names or operations fail validation.

### 2) Local runtime override

`wp config secrets set <doppler|infisical> <project-id>` writes the local runtime
file under the git common dir, not the committed repo metadata file. In a normal
clone that path is `.git/webpresso/secrets.json`; in linked worktrees it resolves
through the shared git common dir so sibling worktrees see the same local
provider/project selection.

This local file is for **operator convenience only**:

- `wp config secrets show` prints the local runtime selection path and current
  runtime selection
- `wp config secrets status` adds CLI availability/auth hints
- committed `.webpresso/secrets.config.json` still owns repo profiles and sinks

## Provider-backed launch flow

Setup writes Context7 MCP configuration that references `CONTEXT7_API_KEY` by
name. It does **not** persist the real key. Launch Codex or Claude from a
provider-backed shell instead:

```bash
wp secrets run --sink dev-server --profile preview -- codex
wp secrets run --sink dev-server --profile preview -- claude
```

A provider-backed shell that already exports `CONTEXT7_API_KEY` is also valid.
The important contract is that the key enters the host environment at runtime,
not via committed files or generated config.

## Runtime fetch model

`wp secrets run` and the runtime executor currently resolve secrets by shelling
out to the configured provider CLI:

- Doppler: `doppler secrets download --no-file --format json ...`
- Infisical: `infisical export --format json ...`

The fetched environment is injected into the child command and redacted on
failure.

`wp secrets doctor` and `wp config secrets status` are **not live fetch proofs**.
They validate metadata, sink/profile/provider selection, CLI presence, and
provider diagnostics, but they do not prove that a command can fetch real secret
values. Use a read-only launch smoke such as `wp secrets run --sink test --profile
preview -- env` or a repo-owned command to prove execution.

## Sink and runtime-profile mapping

| Sink                       | Default use                            | Runtime profile   |
| -------------------------- | -------------------------------------- | ----------------- |
| `dev-server`               | local host launch / dev server         | `service-runtime` |
| `test`                     | unit/integration test commands         | `service-runtime` |
| `e2e`                      | browser/E2E commands                   | `service-runtime` |
| `deploy-wrangler`          | preview / wrangler deploy paths        | `full`            |
| `pulumi`                   | Pulumi env-injection boundary          | `full`            |
| `act`                      | local GitHub Actions via `wp ci act`   | `secrets-only`    |
| `github-actions-bootstrap` | GitHub secret bootstrap planning/apply | `none`            |
| `db-branch`                | database branch helpers                | `database`        |

Repo-owned secret profile names map to provider environments. The current built-in
preview path uses the `preview` profile and the reusable workflow bootstrap path
usually uses `production`.

## Common commands

```bash
wp config secrets show
wp config secrets status
wp config secrets set doppler agent-kit
wp secrets doctor --profile preview --json
wp secrets run --sink dev-server --profile preview -- codex
wp secrets bootstrap github --profile production --json
wp migrate secrets --dry-run --json
```

## Related docs

- [Local worktrees and runtime overrides](./local-workplaces.md)
- [GitHub bootstrap](./bootstrap-github.md)
- [Pulumi boundary](./pulumi.md)
- [WP secret orchestration errors](../errors/wp-secret-orchestration.md)
