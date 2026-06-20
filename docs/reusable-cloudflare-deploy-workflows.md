---
title: Reusable Cloudflare deploy workflows
type: guide
last_updated: 2026-06-19
---

# Reusable Cloudflare deploy workflows

`webpresso/github-actions` ships the reusable GitHub workflow shells that
Webpresso consumer repos pin by immutable commit SHA:

- `webpresso/github-actions/.github/workflows/cloudflare-preview.yml`
- `webpresso/github-actions/.github/workflows/cloudflare-production.yml`

They are intentionally **shell-only**. The caller repo still owns:

- trigger policy (`push`, `pull_request`, tags, manual dispatch)
- concurrency groups
- lane resolution (`preview_main`, `preview_pr_<n>`, `prd`)
- repo-specific verify/build/deploy/smoke commands
- repo-local deploy scripts and adapters behind the caller commands

## Secret bootstrap contract

The shared workflows use repo-owned secret profiles plus provider-specific bootstrap.

The caller commits `.webpresso/secrets.config.json` metadata and passes a repo-owned `secret_profile` name. Bootstrap then depends on the provider:

- `doppler` → reusable-workflow secret `ci_secret_provider_token` (for example preview / production config tokens), or optionally `doppler_identity_id` when OIDC-capable service accounts exist
- `infisical` → `Infisical/secrets-action` via `infisical_identity_id`

This keeps CI aligned with the repo-local operator contract:

- configure metadata with `wp config secrets ...`
- run local secret-scoped commands through `with-secrets -- <cmd>`

### Caller requirements

1. Commit `.webpresso/secrets.config.json` with metadata only — never secret
   values.
2. Commit a `profiles` map in `.webpresso/secrets.config.json` and pass
   `secret_profile` so the shared shell can resolve the provider environment slug
   from repo-owned metadata.
3. For Doppler, map the appropriate GitHub secret onto the reusable workflow secret
   `ci_secret_provider_token` (for example preview / production config tokens).
4. For Infisical or Doppler OIDC-capable workspaces, pass the provider identity as a non-secret workflow input when that bootstrap mode is available.

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
- `doppler_identity_id`
- `ci_secret_provider_token` (workflow secret, for Doppler token bootstrap)
- `ci_secret_provider_token` (workflow secret, for Doppler token bootstrap)
- `infisical_identity_id`
- `runner`

### Production

Required inputs:

- `install_command`
- `verify_command`
- `deploy_command`

Optional inputs:

- `smoke_command`
- `secret_profile`
- `doppler_identity_id`
- `infisical_identity_id`
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
      secret_profile: deploy
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
