---
title: GitHub Action
type: guide
last_updated: 2026-06-11
---

# GitHub Action

`agent-kit` exposes two different GitHub-hosted CI surfaces:

1. **`webpresso/webpresso-action`** — the separate audit-oriented action repo.
2. **Shared reusable Cloudflare deploy workflows** in `webpresso/github-actions` (pinned by consumer repos via immutable commit SHA).

## Reusable Cloudflare deploy workflows

The reusable Cloudflare deploy shell is owned by `webpresso/github-actions`, not by this repo.

- Authoritative lineage ADR: [`docs/adrs/0001-reusable-cloudflare-workflow-lineage.md`](./adrs/0001-reusable-cloudflare-workflow-lineage.md)
- Caller contract guide: [`docs/reusable-cloudflare-deploy-workflows.md`](./reusable-cloudflare-deploy-workflows.md)
- Current downstream consumer lineage lives in the separately versioned `webpresso/github-actions` repo.

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
