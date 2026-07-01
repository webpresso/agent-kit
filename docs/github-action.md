---
title: GitHub Action
type: guide
last_updated: 2026-07-01
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

## PR branch-protection gate

The agent-kit repo uses the `WP check` workflow job as the required aggregate
branch-protection check. It depends on the scoped CI jobs (`lint-typecheck`,
`pr-description-contract`, `test`, `native-session-memory`, `audits`,
`bundle-smoke`, `blueprint-gate`, `e2e`, `architecture-drift`, and
`deploy-verify`) and fails if any required dependency failed or was cancelled.
Require `WP check` on `main` rather than trying to mirror every individual job
in repository rulesets.

The `PR description contract` job requires non-automation pull requests to keep
the `.github/PULL_REQUEST_TEMPLATE.md` AI/model disclosure fields filled in:
execution model(s), planning/refinement model(s), and review/verification
model(s). Use concrete model names when an AI agent performed that phase; use a
specific non-placeholder rationale only when a phase was genuinely not
AI-assisted.

The `Audits` job includes the repo-specific
`./bin/wp audit security-quality-regressions` gate, so smells already caught by
CodeQL or Code Quality cannot merge just because the external analyzer has not
re-run yet. Keep GitHub native rulesets for code scanning and code quality on as
a second line of defense.

Change-scope jobs intentionally skip expensive lanes when the PR cannot affect
them: non-Rust changes skip native session-memory checks, and browser/e2e lanes
only run when relevant paths are present. The aggregate `WP check` still remains
the merge-blocking surface.

## Dependency and action freshness

Dependency and action updates are allowed only through the repo freshness
policy: Dependabot should respect the minimum release-age delay, GitHub Actions
are pinned to immutable SHAs, and dependency freshness/security audits run under
the normal CI and `wp` audit surfaces. Do not bypass those gates with ad-hoc
manual version bumps.

## Local equivalent

Before depending on either CI surface, make sure the local repo contract passes:

```bash
wp audit --all
wp audit security-quality-regressions
```
