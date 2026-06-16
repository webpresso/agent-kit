---
type: blueprint
title: "Public readiness smoke and visibility gate fix"
owner: agent-kit
status: completed
complexity: S
created: '2026-06-16'
last_updated: '2026-06-16'
progress: '100% (2 of 2 tasks completed)'
tags:
  - public-readiness
  - release
  - setup
---

# Public readiness smoke and visibility gate fix

## Problem

`vp run public:readiness` failed even though the package surface checks passed:

- The packed consumer smoke ran `wp setup --host none` but asserted
  `.agents/skills` and `.claude/skills` fallback projections.
- The repository visibility gate checked a stale task id in an unrelated
  runtime-distribution blueprint instead of the completed public-release scrub
  history task.

## Scope

#### [qa] Task 1.1: Exercise host fallback skill projection in packed smoke

**Status:** done

**Acceptance:**

- [x] Packed consumer smoke selects all hosts while opting Claude and Codex
  plugin delivery out.
- [x] Shared favorite skill projections are asserted in both `.agents/skills`
  and `.claude/skills`.
- [x] Regression coverage rejects returning the smoke to `--host none`.

#### [release] Task 1.2: Point repo visibility readiness at public-release scrub evidence

**Status:** done

**Acceptance:**

- [x] Public readiness reads `agent-kit-public-release-scrub/_overview.md`.
- [x] The gate checks completed public-history Task 1.5.
- [x] Full `vp run public:readiness` reports package and repo visibility PASS.

## Verification

- `pnpm exec vitest run scripts/public-readiness.test.ts src/symlinker/consumers.test.ts`
- `WP_SKIP_UPDATE_CHECK=1 bun scripts/public-consumer-smoke.ts --setup-only --skip-build`
- `vp run public:readiness`

