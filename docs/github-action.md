---
title: GitHub Action
type: guide
last_updated: 2026-05-27
---

# GitHub Action

The GitHub Action lives in a separate repo:
`webpresso/webpresso-action`.

## Status

This doc is a placeholder reference, not part of the core setup flow.

Most users should start with:

```bash
wp setup
```

and add CI wiring later.

## Intended usage

```yaml
# .github/workflows/webpresso.yml
jobs:
  webpresso:
    uses: webpresso/webpresso-action/.github/workflows/audit.yml@v1
    with:
      pr-comment: true
```

The action is intended to run the repo audit in CI and optionally post a PR
comment.

## Local equivalent

Before depending on the action, make sure this passes locally:

```bash
wp audit --all
```
