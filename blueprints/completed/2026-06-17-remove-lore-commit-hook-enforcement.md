---
type: blueprint
title: Remove Lore commit-message hook enforcement
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: 'Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note.'
complexity: S
owner: agent-kit
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '100% (completed 2026-06-17)'
tags:
  - hooks
  - release
  - setup
  - ci
completed_at: '2026-06-17'
---

# Remove Lore commit-message hook enforcement

## Summary

Remove automatic `wp audit commit-message --require-lore` enforcement from local
and generated Husky hooks. The audit command remains available for manual use,
but hook enforcement does not add enough value because repository history is
curated through squash commits.

## Acceptance

- [x] The repository no longer has a `commit-msg` hook enforcing Lore trailers.
- [x] The repository `pre-push` hook no longer scans commit messages.
- [x] `base-kit` no longer scaffolds commit-message/pre-push Lore enforcement hooks.
- [x] The `lore-commits` setup preset is removed from setup help and dispatch.
- [x] Lore documentation describes manual/advisory use instead of hook installation.
- [x] The Release workflow does not run local Husky hooks for generated compatibility branch pushes.

## Verification

- `./bin/wp lint --file ...`
- `./bin/wp typecheck`
- `pnpm exec vitest run src/cli/commands/init/scaffold-base-kit.test.ts src/cli/commands/init/init.e2e.test.ts`
- `./bin/wp audit blueprint-lifecycle`
- `./bin/wp audit blueprint-readme-drift`
- `./bin/wp audit guardrails`
- `pnpm exec vitest run src/build/auth-preflight-packages.test.ts`
