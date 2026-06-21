---
type: blueprint
title: Fix Codex PreToolUse duplicate OMX hooks
owner: ozby
status: completed
complexity: S
created: '2026-06-21'
last_updated: '2026-06-21'
progress: '100% (completed)'
depends_on: []
cross_repo_depends_on: []
tags:
  - codex
  - hooks
  - setup
  - timeout
worktree_owner_id: codex
worktree_owner_branch: fix/pretool-duplicate-hooks-20260621
---

# Fix Codex PreToolUse duplicate OMX hooks

## Problem

Codex `PreToolUse` can time out before tool execution when setup-managed OMX hooks are duplicated across overlapping matchers. A live reproduction showed Bash preflight running duplicate global OMX hooks plus the repo pretool guard, pushing aggregate hook runtime above the 5s PreToolUse budget.

## Root cause

`normalizeGlobalCodexHooksJson` only deduplicated exact hook groups. A setup-managed catch-all OMX group and a Bash-specific group normalize to the same launcher command but keep different matcher fields, so they both remain and both match Bash tools.

## Plan

1. Add a regression test for overlapping managed OMX `PreToolUse` groups.
2. Normalize/deduplicate managed OMX global groups by hook command payload when a catch-all matcher already covers a narrower matcher.
3. Keep non-managed/third-party hook groups untouched.
4. Verify focused tests, hook scaffolder tests, typecheck, lint, and repo audits.

## Tasks

#### [hooks] Task 1.1: Reproduce duplicate global OMX PreToolUse groups

**Status:** done

Add a failing regression that models a setup-managed catch-all OMX `PreToolUse` group plus a Bash-specific group that normalize to the same managed launcher.

**Verification:** `wp_test` failed before implementation with `expected false to be true`, proving the existing normalizer did not collapse the duplicate groups.

#### [hooks] Task 1.2: Deduplicate overlapping managed OMX groups

**Status:** done

Update global Codex hook normalization to keep the catch-all managed OMX hook and remove narrower managed OMX groups with the same hook payload. Preserve non-managed hook groups and avoid changing timeout budgets.

**Verification:** `wp_test` passes for `codex-global-normalize.test.ts` after implementation.

#### [release] Task 1.3: Land with repo policy coverage

**Status:** done

Update release and blueprint metadata, then run the hook-scaffolder tests plus lint, typecheck, changeset, blueprint, guardrail, and sync gates.

**Verification:** hook-scaffolder tests, typecheck, lint, changeset status, blueprint lifecycle, guardrails, and sync checks passed.

## Acceptance criteria

- Bash-specific managed OMX `PreToolUse` duplicates are removed when an equivalent catch-all managed OMX group exists.
- Exact duplicate behavior remains idempotent.
- No timeout values are raised as a workaround.
- Generated/setup-owned source is changed instead of hand-editing user hook files.

## Verification

- [x] Failing focused regression captured before implementation.
- [x] Focused regression passes after implementation.
- [x] Hook scaffolder test suite passes.
- [x] Typecheck passes.
- [x] Lint passes (existing warning in `src/cli/cli.ts` only).
- [x] Blueprint/audit gates pass.
