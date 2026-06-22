---
type: blueprint
title: Changesets-only production deploys
owner: ozby
status: draft
complexity: M
created: '2026-06-22'
last_updated: '2026-06-22'
progress: '0% (draft)'
tags:
  - deploy
  - changesets
  - cloudflare
---

# Changesets-only production deploys (agent-kit)

## Status

Draft — implementation branch notes captured.

## Goal

Production deploys must occur only after the Changesets Version Packages PR is merged to `main`. Normal feature merges may open or update the Version Packages PR but must not deploy production.

## Scope

- Remove the standalone/manual production deploy workflow.
- Keep preview deploys and production dry-run plans.
- Let the shared Changesets release workflow decide whether to prepare/publish or open/update the Version Packages PR.
- Gate the Cloudflare production deploy on `should_deploy == 'true'` and pass the resolved `release_version` into deploy code.
- Use lane-specific production secret-provider bootstrap (`CI_SECRET_PROVIDER_TOKEN_PRODUCTION`) for production.

## Files

- `src/audit/cloudflare-deploy-contract.ts`
- `src/audit/cloudflare-deploy-contract.test.ts`
- `src/cli/commands/init/scaffold-base-kit.test.ts`

## Acceptance criteria

- [ ] No `.github/workflows/deploy-production.yml` remains.
- [ ] `.github/workflows/release.yml` triggers on `push` to `main` only.
- [ ] `release.yml` calls `changesets-release.yml` directly with no repo-local `release-preflight`.
- [ ] Production deploy runs only when the reusable release output says `should_deploy == 'true'`.
- [ ] Production deploy receives an explicit release version and rejects missing or mismatched metadata before Cloudflare mutation.
- [ ] Tests/audits cover the no-manual-production workflow contract.

## Verification

Record targeted commands in the final implementation report.
