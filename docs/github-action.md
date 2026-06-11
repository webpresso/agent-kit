---
title: GitHub Action
type: guide
last_updated: 2026-06-11
---

# GitHub Action

`agent-kit` exposes two different GitHub-hosted CI surfaces:

1. **`webpresso/webpresso-action`** — the separate audit-oriented action repo.
2. **Repo-hosted reusable Cloudflare deploy workflows** in this repo:
   - `.github/workflows/cloudflare-preview.yml`
   - `.github/workflows/cloudflare-production.yml`

## Reusable Cloudflare deploy workflows

The reusable Cloudflare deploy shell is owned here in `agent-kit`.

- Authoritative lineage ADR: [`docs/adrs/0001-reusable-cloudflare-workflow-lineage.md`](./adrs/0001-reusable-cloudflare-workflow-lineage.md)
- Caller contract guide: [`docs/reusable-cloudflare-deploy-workflows.md`](./reusable-cloudflare-deploy-workflows.md)
- Current downstream consumer lineage: `317fc3aa5952f5dee0604413a0b9dd1e6d7635dd`

Consumers must pin these workflow files by immutable commit SHA and keep their
repo-local verify/deploy/smoke commands in the caller repo.

## Separate audit action

The standalone audit action still lives in:
`webpresso/webpresso-action`.

Example:

```yaml
jobs:
  webpresso:
    uses: webpresso/webpresso-action/.github/workflows/audit.yml@v1
    with:
      pr-comment: true
```

## Local equivalent

Before depending on either CI surface, make sure the local repo contract passes:

```bash
wp audit --all
```
