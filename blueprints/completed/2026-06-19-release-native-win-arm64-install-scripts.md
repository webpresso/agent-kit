---
type: blueprint
title: Release native Windows ARM64 install scripts fix
status: completed
complexity: XS
owner: agent-kit
created: '2026-06-19'
last_updated: '2026-06-19'
progress: '100% (1/1 tasks done, 0 blocked)'
tags:
  - release
  - native
  - ci
---

# Release native Windows ARM64 install scripts fix

## Summary

The release workflow's `Session memory native (win32-arm64)` matrix job ran a workspace-wide `pnpm install --frozen-lockfile`. That executed unrelated workspace postinstall scripts, including `workerd`, which does not support `win32 arm64` and failed before the session-memory native build started.

## Tasks

#### [release] Task 1.1: Disable lifecycle scripts in the native artifact matrix install

**Status:** done

**Depends:** None

Patch the release native artifact matrix so dependency installation uses `pnpm install --frozen-lockfile --ignore-scripts`. The job only needs JS dependencies, Bun, and Rust for `scripts/build-session-memory-native-artifacts.ts`; package lifecycle scripts are unrelated to compiling the Rust/NAPI artifact and can fail on unsupported matrix platforms.

**Acceptance:**

- [x] Release native artifact matrix install disables package lifecycle scripts.
- [x] Regression test proves the matrix does not use bare `pnpm install --frozen-lockfile`.
- [x] Existing release publish install path remains unchanged.

## Verification

- RED: `./node_modules/.bin/vitest run src/build/auth-preflight-packages.test.ts -t 'installs release native-artifact dependencies without lifecycle scripts'` failed before the workflow patch.
- GREEN: `./node_modules/.bin/vitest run src/build/auth-preflight-packages.test.ts -t 'installs release native-artifact dependencies without lifecycle scripts'` passed after the workflow patch.
- `./bin/wp audit guardrails` passed.

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-release-native-win-arm64-install-scripts.md |

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
