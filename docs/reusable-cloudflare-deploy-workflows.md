---
title: Reusable Cloudflare deploy workflows
type: guide
last_updated: 2026-06-11
---

# Reusable Cloudflare deploy workflows

`webpresso/github-actions` ships the reusable GitHub workflow shells that
Webpresso consumer repos pin by immutable commit SHA:

- `.github/workflows/cloudflare-preview.yml`
- `.github/workflows/cloudflare-production.yml`

They are intentionally **shell-only**. The caller repo still owns:

- trigger policy (`push`, `pull_request`, tags, manual dispatch)
- concurrency groups
- lane resolution (`preview_main`, `preview_pr_<n>`, `prd`)
- repo-specific verify/build/deploy/smoke commands
- repo-local deploy scripts and adapters behind the caller commands

## Secret bootstrap contract

The shared workflows do **not** use cross-owner `secrets: inherit` as the
primary design.

Instead, the caller passes one explicit reusable-workflow secret:

- `ci_secret_provider_token`

The shared workflow then reads the caller repo’s committed
`.webpresso/secrets.config.json` metadata and bootstraps the selected provider:

- `doppler` → `dopplerhq/secrets-fetch-action`
- `infisical` → `infisical export` via `INFISICAL_TOKEN`

This keeps CI aligned with the repo-local operator contract:

- configure metadata with `wp config secrets ...`
- run local secret-scoped commands through `wp secrets run --sink <sink> --profile <profile> -- <cmd>`

### Caller requirements

1. Commit `.webpresso/secrets.config.json` with metadata only — never secret
   values.
2. Store the CI bootstrap token in the caller repo/org secrets.
3. Pass that secret explicitly in the reusable workflow call.
4. For Infisical callers, also pass `secret_profile` so the shared shell
   knows which environment slug to export, and scope
   `ci_secret_provider_token` to that same environment as an Infisical service
   token fallback until OIDC bootstrap is implemented.

## Runtime/bootstrap contract

The reusable workflows own only the common setup shell:

- Node `24.16.0`
- Corepack enabled
- pnpm derived from the caller repo `package.json#packageManager`
- Bun via `oven-sh/setup-bun`

There is deliberately no caller-local setup action dependency in the shared
workflow shell.

## Workflow-call inputs

### Preview

Required inputs:

- `lane`
- `install_command`
- `verify_command`
- `deploy_command`

Optional inputs:

- `mode` (`deploy` or `destroy`)
- `destroy_command`
- `smoke_command`
- `secret_profile`
- `runner`
- `skip_when_ci_secret_missing`

### Production

Required inputs:

- `install_command`
- `verify_command`
- `deploy_command`

Optional inputs:

- `smoke_command`
- `secret_profile`
- `release_version`
- `runner`

## SHA pinning rule

Caller repos must reference reusable workflow files by **immutable commit SHA**,
not by floating branches or tags.

Example:

```yaml
jobs:
  deploy:
    uses: webpresso/github-actions/.github/workflows/cloudflare-production.yml@<released-commit-sha>
    with:
      install_command: pnpm install --frozen-lockfile
      verify_command: pnpm run lint
      deploy_command: wp deploy --lane prd
    secrets:
      ci_secret_provider_token: ${{ secrets.CI_SECRET_PROVIDER_TOKEN_PRODUCTION }}
```

When the shared shell changes:

1. release or otherwise publish the `github-actions` commit
2. update each caller repo to the new immutable SHA
3. rerun the caller repo’s own verification/deploy proofs

## Boundary reminder

Do **not** migrate these repo-local concerns into `agent-kit`:

- Cloudflare/Pulumi/Neon orchestration
- release policy
- smoke/e2e assertions
- preview cleanup details
- any deploy adapter implementation
