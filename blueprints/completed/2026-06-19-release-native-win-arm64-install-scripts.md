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
