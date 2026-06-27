---
type: blueprint
title: "Worktree dependency fast install"
owner: ozby
status: draft
complexity: S
created: "2026-06-27"
last_updated: "2026-06-27"
progress: "100% (PoC proven; implementation verified)"
depends_on: []
cross_repo_depends_on: []
tags: [devex, performance, worktrees, dependencies]
---

# Worktree dependency fast install

**Goal:** Make repeated dependency setup in fresh agent/test worktrees fast and reliable without copying `node_modules`, increasing timeouts, or bypassing the repo's `vp` facade for normal installs.

## User intent

A previous under-5-minute suite plan exposed a dependency setup problem: fresh clean worktrees can fail or waste time until dependencies are installed. The desired fix is an elegant Vite+/pnpm-supported approach so package changes and new worktrees do not require long reinstall waits every time.

## External guidance summary

- pnpm has an official Git worktrees guide for multi-agent development that recommends `enableGlobalVirtualStore: true` for fast repeated worktree installs.
- pnpm documents `enableGlobalVirtualStore` as supported in current pnpm releases; this repo uses `pnpm@11.1.1`.
- pnpm warns against manually sharing `virtualStoreDir`; use the global virtual store instead.
- pnpm official settings document that the global virtual store depends on `NODE_PATH` resolution, so direct repo launchers must preserve pnpm's module lookup path when they bypass package-manager-generated `.bin` shims.
- Vite+ documents `vp install --frozen-lockfile --prefer-offline/--offline`, so normal worktree bootstrap should remain `vp install --frozen-lockfile --prefer-offline`.

## PoC evidence

Measured on 2026-06-27 from committed `HEAD` (`741b2bef`) in disposable detached worktrees under `/tmp/agent-kit-deps-poc-correct-*`. Each command was run from inside the disposable worktree:

| Scenario                             | Workspace setting                | Command                                         | Real time | Outcome                 |
| ------------------------------------ | -------------------------------- | ----------------------------------------------- | --------: | ----------------------- |
| Current config fresh worktree        | no global virtual store          | `vp install --frozen-lockfile --prefer-offline` |    90.27s | success                 |
| Global virtual store first worktree  | `enableGlobalVirtualStore: true` | `vp install --frozen-lockfile --prefer-offline` |    17.41s | success                 |
| Global virtual store second worktree | `enableGlobalVirtualStore: true` | `vp install --frozen-lockfile --prefer-offline` |    18.35s | success                 |
| Binary resolution smoke              | `enableGlobalVirtualStore: true` | `vp exec vitest --version`                      |     8.79s | resolved `vitest/4.1.7` |

This proves the pnpm-native setting reduces fresh worktree dependency setup by about 80% in the measured warm-store case and fixes the local binary availability needed before running tests.

## Decision

Enable pnpm's global virtual store in `pnpm-workspace.yaml`, keep worktree bootstrap guidance on `vp install --frozen-lockfile --prefer-offline`, and make the direct `bin/wp` launcher pass the pnpm global-virtual-store `NODE_PATH` entries to Node-based child launches.

## Constraints

- No new dependencies.
- Do not copy or symlink `node_modules` across worktrees by hand.
- Do not manually share `virtualStoreDir`.
- Keep normal repo commands through `vp` unless a pnpm-specific diagnostic/prewarm command is needed.

## Tasks

### Task 1: Enable pnpm global virtual store

**Status:** done

Add `enableGlobalVirtualStore: true` to `pnpm-workspace.yaml`.

**Acceptance:**

- [x] `vp install --frozen-lockfile --prefer-offline` succeeds in a fresh worktree.
- [x] Local binaries resolve after install.
- [x] Formatting/checks for touched files pass.

### Task 2: Verify configuration and document evidence

**Status:** done

Run targeted config verification and update this blueprint with final results.

**Acceptance:**

- [x] `wp format --check` passes.
- [x] Targeted launcher regression passes: `vp exec vitest run bin/_run.test.ts --project unit --reporter=dot` (13 tests, 2.15s Vitest duration).
- [x] `vp run typecheck` passes.
- [x] `vp run lint` passes; it reports an existing non-blocking parse note in `src/cli/commands/init/scaffolders/rtk/index.ts`.
