---
type: blueprint
title: "Release provenance GitHub-hosted runner fix"
owner: agent-kit
status: completed
complexity: S
created: '2026-06-16'
last_updated: '2026-06-16'
progress: '100% (1 of 1 tasks completed)'
tags:
  - release
  - github-actions
  - npm
  - provenance
---

# Release provenance GitHub-hosted runner fix

## Problem

The Release workflow published with `npm publish --provenance` from the
Ubicloud runner label. npm rejected the provenance bundle because GitHub Actions
self-hosted runners are not accepted for provenance verification.

## Scope

#### [infra] Task 1.1: Run provenance-backed release publish on GitHub-hosted Actions

**Status:** done

**Files:**

- Modify: `.github/workflows/release.yml`
- Modify: `src/build/auth-preflight-packages.test.ts`

**Acceptance:**

- [x] Release workflow uses `ubuntu-latest` for the provenance-backed publish job.
- [x] Workflow comments document why the release job intentionally differs from
  the repo's Ubicloud CI runner policy.
- [x] Regression test fails if the release workflow returns to the Ubicloud
  runner while still using the provenance-backed publish path.
- [x] Scoped workflow/test/typecheck/lint/secret checks pass.

## Verification

- `pnpm exec vitest run src/build/auth-preflight-packages.test.ts`
- `actionlint .github/workflows/release.yml`
- `vp run workflow-actions:check`
- `vp run typecheck`
- `vp run lint`
- `vp run verify:secrets`

