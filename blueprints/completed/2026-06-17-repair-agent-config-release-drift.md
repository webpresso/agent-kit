---
type: blueprint
title: Repair agent-config release drift
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: 'Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note.'
complexity: S
owner: agent-kit
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '100% (completed 2026-06-17)'
tags:
  - release
  - changesets
  - package-surface
  - agent-config
completed_at: '2026-06-17'
---

# Repair agent-config release drift

## Summary

Sync `@webpresso/agent-config` to the already-published npm baseline and repair
release publishing so public non-root workspace packages are published by the
custom release command. Add a guard so local package manifests cannot regress
below known published baselines.

## Acceptance

- [x] `packages/agent-config/package.json` matches the published `0.1.4` baseline.
- [x] A real `@webpresso/agent-config` patch changeset is present so Version Packages bumps the next release above `0.1.4`.
- [x] `release:publish` publishes public non-root workspace packages whose manifest version is not yet on npm.
- [x] `release:publish` fails before publishing when a local package version is behind npm latest.
- [x] Package-surface audit catches `@webpresso/agent-config` manifest regressions below the published baseline.

## Verification

- `npm view @webpresso/agent-config versions --json`
- `./bin/wp audit ai-contracts`
- `./bin/wp lint --file ...`
- `./bin/wp typecheck`
- `pnpm exec vitest run scripts/release-publish.test.ts src/audit/package-surface.test.ts`
- `./bin/wp audit package-surface`
- `./bin/wp audit blueprint-lifecycle`
- `./bin/wp audit blueprint-readme-drift`
- `./bin/wp audit guardrails`
