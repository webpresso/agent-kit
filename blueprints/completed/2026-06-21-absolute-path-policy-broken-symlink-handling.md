---
type: blueprint
title: Absolute path policy broken symlink handling
owner: agent-kit
status: completed
complexity: S
created: '2026-06-21'
last_updated: '2026-06-21'
completed_at: '2026-06-21'
progress: '100%'
tags:
  - audit
  - symlink
  - hooks
  - reliability
---

# Absolute path policy broken symlink handling

## Goal

Prevent `wp audit absolute-path-policy` from crashing on broken or not-yet-materialized symlink targets in fresh worktrees and generated hook surfaces.

## What changed

- `src/audit/absolute-path-policy.ts`
  - wraps `statSync(fullPath)` in a try/catch during directory walk
  - skips broken symlink or raced-deletion entries instead of crashing the audit
- `src/audit/absolute-path-policy.test.ts`
  - adds a regression covering broken symlink entries such as `.github/skills` and `apps/e2e/.schema-engine-generated`

## Verification

- `./bin/wp test --file src/audit/absolute-path-policy.test.ts`
- `./bin/wp audit absolute-path-policy`

## Outcome

Fresh worktrees with placeholder symlinks no longer fail the absolute-path-policy audit with `ENOENT`, so commit/push hook paths are more robust.
