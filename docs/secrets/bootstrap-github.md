---
type: guide
title: Bootstrap GitHub secrets
last_updated: "2026-06-26"
---

# Bootstrap GitHub secrets

`wp secrets bootstrap github` is the public planning/apply surface for GitHub
Actions secret bootstrap.

## Dry-run first

The command defaults to planning only:

```bash
wp secrets bootstrap github --profile production --json
```

Expected result:

- `ok: true`
- `code: WP_GITHUB_BOOTSTRAP_PLANNED`
- a plan containing the lane set and the required GitHub secret names

## Apply explicitly

Mutation requires `--apply` and the required secret values already present in
your local environment:

```bash
export CI_SECRET_PROVIDER_TOKEN_PRODUCTION=...
wp secrets bootstrap github --profile production --apply --json
```

If a required value is missing, the command fails with
`WP_GITHUB_BOOTSTRAP_MISSING_SECRET`.

## Lane defaults

If no `--lane` values are provided, the command plans for these lanes:

- `preview_main`
- `prd`

You can pass `--lane <name>` multiple times to narrow or expand the plan.

## Provider behavior

Built-in providers currently plan service-token bootstrap:

- Doppler → `CI_SECRET_PROVIDER_TOKEN_PREVIEW` and/or
  `CI_SECRET_PROVIDER_TOKEN_PRODUCTION`
- Infisical → the same token names for the current workflow shell, with
  `identityId` recorded in repo metadata for the intended CI identity

The plan is metadata-driven. It does not fetch or print secret values.

## Relationship to reusable workflows

Use this command together with the reusable workflow contract in
[`docs/reusable-cloudflare-deploy-workflows.md`](../reusable-cloudflare-deploy-workflows.md).
Caller repos still own their workflow callsite, immutable SHA pinning, and the
actual repo/org secret storage.

## Recommended smoke order

```bash
wp config secrets status
wp secrets doctor --profile production --json
wp secrets bootstrap github --profile production --json
```

## Related docs

- [Secret providers](./providers.md)
- [WP secret orchestration errors](../errors/wp-secret-orchestration.md)
