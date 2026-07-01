---
type: blueprint
owner: webpresso
title: "Managed hook sections"
status: in-progress
complexity: M
created: "2026-07-01"
last_updated: "2026-07-01"
progress_pct: 20
progress: "Started: make agent-kit own Husky hook entrypoints with managed/user-owned sections so setup can refresh Webpresso behavior while preserving repo-local hook extensions."
depends_on:
  - "catalog/base-kit Husky templates"
  - "wp setup base-kit scaffolder"
---

# Managed hook sections

## Status

In progress — move Husky hook entrypoint ownership into agent-kit with AGENTS-style managed and user-owned blocks.

## Problem

Some consumers still track stale commit-message/pre-push enforcement even though agent-kit no longer installs Lore enforcement for squash-merge repos. Removing those files by hand fixes today but does not prevent future drift or preserve legitimate repo-local hook customizations.

## Scope

- Make agent-kit setup own the standard Husky hook entrypoints.
- Use section markers so `wp setup` can update Webpresso-managed commands without clobbering user-owned hook extensions.
- Preserve unknown existing hook bodies as user-owned content during migration.
- Drop known obsolete Lore-enforcement hook bodies instead of preserving them as custom behavior.
- Add tests for fresh setup, managed updates, custom preservation, and stale-hook cleanup.

## Non-goals

- Do not reintroduce mandatory Lore trailer enforcement.
- Do not add a consumer-local hook policy surface outside agent-kit.
- Do not overwrite arbitrary user hook code.

## Tasks

#### [design] Task 1.1: Define hook section contract

**Status:** in-progress

**Depends:** None

- Add stable managed/user-owned markers to Husky hook templates.
- Keep comments concise and shell-safe.

#### [impl] Task 1.2: Merge hook sections during setup

**Status:** pending

**Depends:** Task 1.1

- Replace managed sections on repeated setup.
- Preserve user-owned sections.
- Migrate unknown pre-existing hook bodies into user-owned sections.
- Recognize and discard known obsolete Lore-only hook bodies.

#### [qa] Task 1.3: Verify setup behavior

**Status:** pending

**Depends:** Task 1.2

- Add unit/e2e coverage for fresh setup, update, preservation, and stale cleanup.
- Run targeted tests plus typecheck/lint.

## Acceptance criteria

- `wp setup` owns `.husky/pre-commit`, `.husky/commit-msg`, and `.husky/pre-push` entrypoints.
- Repo-local custom hook commands can live in preserved user-owned sections.
- Stale `--require-lore` hook bodies are cleaned by setup and cannot re-block squash-merge PR workflows.
- Tests prove the contract.
