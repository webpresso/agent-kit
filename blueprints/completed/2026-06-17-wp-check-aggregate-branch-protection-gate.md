---
type: blueprint
title: Shared wp-check aggregate branch-protection gate
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: 'Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note.'
complexity: S
owner: agent-kit
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '100% (completed 2026-06-17)'
tags:
  - ci
  - github-actions
  - branch-protection
  - scaffolding
completed_at: '2026-06-17'
---

# Shared wp-check aggregate branch-protection gate

## Summary

Promote `wp-check` to the single branch-protection-facing status emitted by the
base-kit CI template while keeping the underlying quality, e2e,
architecture-drift, and deploy-verification jobs parallel. This lets consumers
require one stable GitHub check without losing coverage from sibling CI lanes.

## Acceptance

- [x] The scaffolded CI template keeps the underlying quality jobs parallel.
- [x] The scaffolded CI template emits a final `wp-check` aggregate job for
      branch protection.
- [x] Scaffold tests pin the generated `wp-check` aggregate contract.

## Verification

- `./bin/wp lint --file src/cli/commands/init/scaffold-base-kit.test.ts`
- `./bin/wp typecheck`
- `pnpm exec vitest run src/cli/commands/init/scaffold-base-kit.test.ts`
