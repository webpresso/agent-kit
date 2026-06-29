---
type: blueprint
title: "Worktree dependency fast install"
owner: ozby
status: completed
complexity: S
created: "2026-06-27"
last_updated: "2026-06-28"
progress: "100% (4 of 4 tasks completed; PoC, implementation, and CI verified)"
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
- pnpm official settings recommend `packageExtensions` when a package has an incomplete dependency declaration; this is preferred over broad hoisting or changing unrelated TypeScript runtime libs.
- Vite+ documents `vp install --frozen-lockfile --prefer-offline/--offline`, so normal worktree bootstrap should remain `vp install --frozen-lockfile --prefer-offline`.

## PoC evidence

Measured on 2026-06-27 from committed `HEAD` (`741b2bef`) in disposable detached worktrees under `/tmp/agent-kit-deps-poc-correct-*`. Each command was run from inside the disposable worktree:

| Scenario                             | Workspace setting                                             | Command                                                                                       | Real time | Outcome                                                  |
| ------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------: | -------------------------------------------------------- |
| Current config fresh worktree        | no global virtual store                                       | `vp install --frozen-lockfile --prefer-offline`                                               |    90.27s | success                                                  |
| Global virtual store first worktree  | `enableGlobalVirtualStore: true`                              | `vp install --frozen-lockfile --prefer-offline`                                               |    17.41s | success                                                  |
| Global virtual store second worktree | `enableGlobalVirtualStore: true`                              | `vp install --frozen-lockfile --prefer-offline`                                               |    18.35s | success                                                  |
| Binary resolution smoke              | `enableGlobalVirtualStore: true`                              | `vp exec vitest --version`                                                                    |     8.79s | resolved `vitest/4.1.7`                                  |
| Linux CI type reproduction           | `enableGlobalVirtualStore: true`                              | `./node_modules/.bin/tshy` in Node 24.16 + Bun container                                      |    failed | `Response`/`Headers` errors from Bun fetch fallback      |
| Linux CI control                     | global virtual store disabled                                 | `./node_modules/.bin/tshy` in same container                                                  |    passed | proves layout-dependent phantom dependency issue         |
| Rejected DOM-lib experiment          | `enableGlobalVirtualStore: true`, `lib += DOM`                | `./node_modules/.bin/tshy` in same container                                                  |    failed | traded fetch errors for `ReadableStream` incompatibility |
| Package extension fix                | `enableGlobalVirtualStore: true`, `bun-types -> undici-types` | `pnpm install --no-frozen-lockfile && ./node_modules/.bin/tshy` in Node 24.16 + Bun container |    passed | fixes the undeclared package edge directly               |

This proves the pnpm-native setting reduces fresh worktree dependency setup by about 80% in the measured warm-store case and fixes the local binary availability needed before running tests.

## Decision

Enable pnpm's global virtual store in `pnpm-workspace.yaml`, keep worktree bootstrap guidance on `vp install --frozen-lockfile --prefer-offline`, make the direct `bin/wp` launcher pass the pnpm global-virtual-store `NODE_PATH` entries to Node-based child launches, and use pnpm `packageExtensions` for the `bun-types -> undici-types` manifest edge exposed by the global virtual store on Linux CI.

## Constraints

- No new dependencies.
- Do not copy or symlink `node_modules` across worktrees by hand.
- Do not manually share `virtualStoreDir`.
- Keep normal repo commands through `vp` unless a pnpm-specific diagnostic/prewarm command is needed.

## Tasks

#### Task 1: Enable pnpm global virtual store

**Status:** done

Add `enableGlobalVirtualStore: true` to `pnpm-workspace.yaml`.

**Acceptance:**

- [x] `vp install --frozen-lockfile --prefer-offline` succeeds in a fresh worktree.
- [x] Local binaries resolve after install.
- [x] Formatting/checks for touched files pass.

#### Task 2: Verify configuration and document evidence

**Status:** done

Run targeted config verification and update this blueprint with final results.

**Acceptance:**

- [x] `wp format --check` passes.
- [x] Targeted launcher regression passes: `vp exec vitest run bin/_run.test.ts --project unit --reporter=dot` (13 tests, 2.15s Vitest duration).
- [x] `vp run typecheck` passes.
- [x] `vp run lint` passes; it reports an existing non-blocking parse note in `src/cli/commands/init/scaffolders/rtk/index.ts`.

#### Task 3: Fix Linux global-virtual-store type edge

**Status:** done

A CI/Linux reproduction showed `tshy` failing under pnpm global virtual store because `bun-types@1.3.14` imports `undici-types` for non-DOM Fetch API fallbacks without declaring that dependency. The state-of-the-art pnpm fix is a narrow `packageExtensions` entry, not adding broad DOM libs or disabling the worktree optimization.

**Acceptance:**

- [x] Linux Node 24.16 + Bun container reproduces the original `Response`/`Headers` failure with global virtual store enabled.
- [x] Same container passes `tshy` with global virtual store disabled, proving a layout/manifest-edge issue.
- [x] DOM-lib experiment rejected because it introduces a `ReadableStream` incompatibility.
- [x] `packageExtensions` for `bun-types@* -> undici-types` passes `tshy` with global virtual store enabled.

#### Task 4: Fix full Test suite global-virtual-store exposures

**Status:** done

After the Linux typecheck fix, CI `Test` exposed two additional global-virtual-store issues: exact launcher-plan tests had not accounted for the intentional inherited `NODE_PATH` environment, and secretlint inline default config could not resolve the repo-owned preset from pnpm global-store package realpaths.

**Acceptance:**

- [x] Launcher tests assert the stable launch fields plus required global-virtual-store `NODE_PATH` entries instead of exact-matching the full inherited process environment.
- [x] Package-surface audit resolves the owned default secretlint preset to an absolute module path before passing `--secretlintrcJSON`, avoiding phantom rule resolution.
- [x] Targeted slice passes: `vp exec vitest run scripts/bin-launcher.test.ts src/audit/package-surface.test.ts --project unit --reporter=dot` (61 tests).

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-28T02:41:00.000Z
- verified-head: e361145978f14226e94eb45dbce33f7a86d37df5
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                 | Evidence                                                                 |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| C1  | This executable blueprint has a canonical repository document.        | repo:blueprints/completed/2026-06-27-worktree-dependency-fast-install.md |
| C2  | Fresh worktree dependency setup is faster with pnpm global store.     | repo:blueprints/completed/2026-06-27-worktree-dependency-fast-install.md |
| C3  | Local changed-surface verification passed after the origin/main sync. | derived:C1,C2                                                            |

### Material Decisions

| ID  | Decision                              | Chosen option                                          | Rejected alternatives                         | Rationale                                                                                 |
| --- | ------------------------------------- | ------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| D1  | Worktree dependency sharing strategy. | pnpm `enableGlobalVirtualStore: true`.                 | Copying/symlinking `node_modules` manually.   | Official pnpm worktree guidance supports the global virtual store for repeated worktrees. |
| D2  | Missing Bun Fetch type dependency.    | Narrow pnpm `packageExtensions` entry for `bun-types`. | Broad DOM libs or disabling the global store. | Fixes the undeclared dependency edge directly without changing unrelated TypeScript libs. |
| D3  | Blueprint lifecycle state.            | Move the completed plan to `blueprints/completed/`.    | Leave completed work in `blueprints/draft/`.  | Completed executable blueprints must remain auditable by the blueprint trust guardrail.   |

### Promotion Gates

| Gate       | Command                                                                                                                                             | Expected outcome | Last result                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------- |
| format     | wp format --check                                                                                                                                   | pass             | pass scoped to changed files at 2026-06-28T02:41:59Z |
| tests      | wp test --file bin/\_run.test.ts --file scripts/bin-launcher.test.ts --file src/audit/package-surface.test.ts --file src/typecheck/affected.test.ts | pass             | pass at 2026-06-28T02:42:14Z                         |
| typecheck  | wp typecheck                                                                                                                                        | pass             | pass at 2026-06-28T02:42:30Z                         |
| lint       | wp lint                                                                                                                                             | pass             | pass at 2026-06-28T02:42:40Z                         |
| guardrails | wp audit guardrails --affected --branch                                                                                                             | pass             | pass at 2026-06-28T02:45:00Z                         |
| blueprint  | wp audit blueprint-pr-coverage --base origin/main                                                                                                   | pass             | pass at 2026-06-28T02:43:00Z                         |

### Residual Unknowns

None.
