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

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-16-public-readiness-smoke-and-visibility-fix.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
