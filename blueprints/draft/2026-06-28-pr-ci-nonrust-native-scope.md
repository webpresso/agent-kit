---
type: blueprint
title: "Skip native session-memory CI for non-Rust PR changes"
owner: ozby
status: draft
complexity: S
created: "2026-06-28"
last_updated: "2026-06-28"
progress: "0%"
depends_on:
  - "blueprints/completed/2026-06-28-pr-ci-change-scope-native-session-memory.md"
cross_repo_depends_on: []
tags: [ci, github-actions, performance]
---

# Skip native session-memory CI for non-Rust PR changes

## Goal

Tighten the PR change-scope classifier so the expensive native session-memory Rust job is skipped for PRs that do not touch Rust/native-session-memory CI inputs, while still failing closed for non-PR events and native-impacting files.

## Why this exists

The prior change added the required-check-safe `ci-change-scope` job and skipped native checks for docs/markdown-only PRs. The original request explicitly called out the broader case: if a PR has no Rust/native-session-memory changes, the native session-memory job should not run. This slice expands the classifier from docs-only to native-impact paths.

## Constraints

- Keep required checks safe: do not use workflow-level `paths` filters.
- Keep fail-closed defaults for non-PR events and indeterminate diffs.
- No new dependencies.
- Preserve native checks for Rust crate files, native CI wiring, package manager scripts/lockfiles, and classifier tests.

## Plan

1. Replace the docs-only classifier with an explicit native-impact classifier.
2. Add regression fixtures proving ordinary non-Rust source/test/script changes skip native checks.
3. Keep native-impact fixtures for Rust crate files, package manager files, workflow/classifier changes, and native build/stage scripts.
4. Validate with targeted tests, formatting, workflow pin checks, typecheck/lint if needed, and PR CI.

## Acceptance criteria

- [ ] `scripts/ci/change-scope.sh classify-native src/cli/cli.ts` returns `false`.
- [ ] Native-impact paths under `native/session-memory-engine/**` return `true`.
- [ ] Native CI/workflow/package-manager/classifier changes return `true`.
- [ ] Empty/unreadable diff and non-PR events still fail closed.
- [ ] PR CI remains required-check-safe via `ci-change-scope` + `wp-check` aggregation.
- [ ] Outside voice review finds no blockers.

## Verification plan

- `./bin/wp format --check --file scripts/ci/change-scope.sh --file src/build/native-session-memory-ci.test.ts --file blueprints/draft/2026-06-28-pr-ci-nonrust-native-scope.md`
- `./node_modules/.bin/vitest run src/build/native-session-memory-ci.test.ts --project unit --reporter verbose`
- `bun scripts/check-workflow-action-pins.ts .`
- `vp run typecheck`
- `vp run lint`
- `vp run blueprints:check`
- PR CI `WP check` pass.
