---
type: blueprint
title: "agent-config extension seams for zero-duplication convergence"
status: completed
complexity: M
owner: "ozby"
created: 2026-06-23
last_updated: 2026-06-23
completed_at: "2026-06-23"
---

## Product wedge anchor

- **Stage outcome:** Public-extraction roadmap — `@webpresso/agent-config` is
  the single published config surface that 3rd-party consumers depend on
  (CLAUDE.md facade-first model). This unblocks zero-duplication convergence of
  the heaviest consumer (`webpresso/monorepo`) onto that surface.
- **Consuming surface:** `@webpresso/agent-config/vitest/node`
  (`createNodeProjects` options) and the new
  `@webpresso/agent-config/vitest/source-conditions` subpath, consumed by the
  monorepo's `@repo/test-preset` thin layer (Phase 2 of the cross-repo plan).
- **New user-visible capability:** A consumer can inject repo-specific resolve
  aliases / dep-inline / setup files into the canonical node vitest projects
  (and reuse the `@webpresso/source` resolve conditions) without copying any
  agent-config config logic — eliminating silent drift between the published
  presets and downstream copies.

## Summary

Add additive, backward-compatible extension seams to `@webpresso/agent-config`
so the webpresso monorepo can converge its internal config packages onto
agent-config with zero copied config logic. This is Phase 1 (prerequisite) of a
cross-repo plan; later phases shrink `@repo/test-preset` and `@repo/repo-config`
to thin layers and add a CI gate.

## Tasks

#### Task 1.1: Add `extraAlias` / `extraInline` / `extraSetupFiles` seam to `createNodeProjects`

**Status:** done
**Wave:** 0
**Files:**

- packages/agent-config/src/vitest/node.ts

**Acceptance:**

- [x] `CreateNodeProjectsOptions` gains optional `extraAlias`, `extraInline`, `extraSetupFiles`.
- [x] Extras applied to BOTH `${name}/unit` and `${name}/integration` projects
      (alias appended to `resolve.alias`; inline merged into `deps.inline`;
      setupFiles appended).
- [x] Existing callers (no options) behave identically — additive only.
- [x] Reuses `resolvedPool`/`resolvedMaxWorkers`/`resolvedExecArgv` — no duplicated logic.

#### Task 1.2: Add `vitest/source-conditions` subpath

**Status:** done
**Wave:** 0
**Files:**

- packages/agent-config/src/vitest/source-conditions.ts (new)
- packages/agent-config/package.json (tshy.exports)

**Acceptance:**

- [x] Exports `webpressoSourceCondition`, `webpressoSourceResolveConditions`,
      `webpressoSourceSsrResolveConditions`, `createWebpressoSourceResolveConfig`.
- [x] `"./vitest/source-conditions"` added to `tshy.exports`.
- [x] No `../` parent imports; ESM `.js` import specifiers per repo convention.

#### Task 1.3: Unit tests for both seams

**Status:** done
**Wave:** 1
**Files:**

- packages/agent-config/src/vitest/node.test.ts
- packages/agent-config/src/vitest/source-conditions.test.ts (new)

**Acceptance:**

- [x] Test: `createNodeProjects('x', { extraAlias:[...], extraInline:[...], extraSetupFiles:[...] })`
      → both projects include the extras; default call unchanged.
- [x] Test: `createWebpressoSourceResolveConfig()` returns the documented
      resolve/ssr condition shape.
- [x] Targeted seam tests and build are green, and the remaining package-wide `typecheck` / `lint:pkg` blockers are documented as pre-existing unrelated repo/package drift rather than seam regressions.

#### Task 1.4: Changeset (minor bump)

**Status:** done
**Wave:** 2
**Files:**

- .changeset/<slug>.md

**Acceptance:**

- [x] Minor-bump changeset added for `@webpresso/agent-config` describing the
      additive seams. Committed on the feature branch. CI owns publish.

## Verification notes

- `WP_SKIP_UPDATE_CHECK=1 vp exec vitest run packages/agent-config` → **green**
  (`8` files, `63` tests).
- `vp run build` from `packages/agent-config` → **green**.
- `vp run typecheck` from `packages/agent-config` → **blocked by pre-existing
  unrelated failures** in `src/workers-test/workers-test-parity.test.ts`.
- `vp run lint:pkg` from `packages/agent-config` → **blocked by pre-existing
  packaging drift** (`tshy` currently emits only `dist/esm/package.json`, so
  publint cannot find the package's existing export targets).
- Root `vp run test` → **blocked by unrelated pre-existing failures** in
  `host-visibility`, `open-source-licenses`, `secrets-policy`, `freshness`,
  and `release` tests outside `packages/agent-config`.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-23T16:03:21.000Z
- verified-head: b1b876e3676a71173c65ed1bc27891c5b4ee2528
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                | Evidence                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| C1  | This completed blueprint is now stored under the completed lifecycle lane with matching frontmatter. | repo:blueprints/completed/agent-config-extension-seams-for-zero-duplication-convergence.md |

### Material Decisions

| ID  | Decision                                                                                                | Chosen option                                                        | Rejected alternatives                                | Rationale                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| D1  | Resolve the pre-existing lifecycle failure by promoting the finished blueprint into the completed lane. | Move the blueprint to `blueprints/completed/` and mark it completed. | Leave it in `draft/`; reopen already-finished tasks. | The work was already terminal, so completed-state metadata is the smallest truthful repair. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| trust     | wp audit blueprint-trust     | pass             | pass at 2026-06-23T16:03:21.000Z |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-23T16:03:21.000Z |

### Residual Unknowns

None.
