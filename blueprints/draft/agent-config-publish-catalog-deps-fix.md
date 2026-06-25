---
type: blueprint
status: draft
complexity: XS
created: "2026-06-24"
last_updated: "2026-06-24"
progress: "0% (drafted)"
depends_on: []
cross_repo_depends_on: []
tags: []
---

# Agent-config publish catalog deps fix

**Goal:** Make `release-publish` resolve `catalog:` specifiers and drop the
agent-kit runtime optional-dependency block when publishing non-root public
workspace packages (e.g. `@webpresso/agent-config`), so published manifests
never ship unresolved `catalog:` strings.

## Planning Summary

- Goal input: `agent-config publish catalog deps fix`
- Complexity: `XS`
- Draft slug: `agent-config-publish-catalog-deps-fix`
- Output path: `blueprints/draft/agent-config-publish-catalog-deps-fix.md`
- Default shape: flat file (`blueprints/<status>/<slug>.md`)

## Problem

`publishSimpleWorkspacePackage` published non-root workspace packages with a
raw `npm publish`, so the package's `package.json` still carried `catalog:`
dependency specifiers (which only pnpm understands) and inherited the
root-package runtime optional-dependency injection that is meant only for the
root `@webpresso/agent-kit` package. Consumers installing `@webpresso/agent-config`
from the registry would then see unresolved `catalog:` versions.

## Architecture Overview

```text
publishSimpleWorkspacePackage(pkg)
  preparePackedManifest(pkg.root, {                 # NEW: rewrite manifest in place
    assertBlueprintMigrationAssets: false,          #   non-root pkgs have no migration assets
    includeRuntimeOptionalDependencies: false,      #   skip root-only runtime optionalDeps
    workspaceRoot: packageRoot,                      #   read catalog from repo-root pnpm-workspace.yaml
  })
  npm publish --ignore-scripts --provenance ...     # publish the resolved manifest
  finally: restorePackedManifest(pkg.root)          # always restore original package.json
```

## Key Decisions

| Decision                       | Choice                                                                                                        | Rationale                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve catalog before publish | Reuse `preparePackedManifest`/`restorePackedManifest`                                                         | Same path already used for the root package; resolves `catalog:` → concrete versions                                                     |
| New options on packed manifest | `PackedManifestOptions { assertBlueprintMigrationAssets, includeRuntimeOptionalDependencies, workspaceRoot }` | Non-root packages have no blueprint-migration SQL assets and must not inherit root runtime optionalDeps; catalog lives at workspace root |
| `--ignore-scripts` on publish  | Added                                                                                                         | Non-root packed manifests should publish without running lifecycle scripts                                                               |
| try/finally restore            | Wrap publish                                                                                                  | Guarantee `package.json` is restored even when publish exits non-zero                                                                    |

## Quick Reference (Execution Waves)

| Wave              | Tasks | Dependencies | Parallelizable |
| ----------------- | ----- | ------------ | -------------- |
| **Wave 0**        | 1.1   | None         | 1 agent        |
| **Critical path** | 1.1   | --           | 1 wave         |

**Note:** Use t-shirt sizing (XS/S/M/L/XL) for individual task estimates, NOT day/week estimates.

**Lifecycle:** Blueprint frontmatter `status` is one of `draft`, `planned`, `parked`, `in-progress`, `completed`, `archived`. Use `parked` when the blueprint is intentionally paused but should remain distinct from active planning or abandoned work. There is no blueprint-level `blocked` status; when work waits on an external dependency, set the task **Status:** to `blocked` and add a non-empty **Blocked:** line with the reason.

> [!NOTE]
> This template reflects the current preferred blueprint structure. Repo-wide validity is determined by the live blueprint parser/audit rules, so older blueprints may still use a different-but-valid section mix.

### Phase 1: Catalog-safe non-root publish [Complexity: XS]

#### [infra] Task 1.1: Add packed-manifest options for non-root packages

**Status:** done

**Depends:** None

Extend `createPackedManifest` and `preparePackedManifest` to accept a
`PackedManifestOptions` object with `assertBlueprintMigrationAssets`,
`includeRuntimeOptionalDependencies` (both default `true` for backward
compat), and `workspaceRoot` (default `rootDir`). When
`includeRuntimeOptionalDependencies` is `false`, do not inject the root
runtime optional-dependency block. When `assertBlueprintMigrationAssets` is
`false`, skip `assertBuiltBlueprintMigrationSqlAssets`. Read the pnpm catalog
from `workspaceRoot/pnpm-workspace.yaml` so non-root packages resolve
`catalog:` against the repo root.

**Files:**

- Modify: `src/build/package-manifest.ts`
- Modify: `src/build/package-manifest.test.ts`

**Acceptance:**

- [x] `createPackedManifest(..., { includeRuntimeOptionalDependencies: false })`
      resolves `catalog:` specifiers and emits no `optionalDependencies`
- [x] `vp exec vitest run src/build/package-manifest.test.ts` passes

#### [infra] Task 1.2: Wrap non-root publish with packed-manifest prepare/restore

**Status:** done

**Depends:** Task 1.1

In `publishSimpleWorkspacePackage`, call `preparePackedManifest(pkg.root, {
assertBlueprintMigrationAssets: false, includeRuntimeOptionalDependencies:
false, workspaceRoot: packageRoot })` before publishing, publish with
`npm publish --ignore-scripts --provenance --access public`, and always call
`restorePackedManifest(pkg.root)` in a `finally`.

**Files:**

- Modify: `scripts/release-publish.ts`
- Modify: `scripts/release-publish.test.ts`

**Acceptance:**

- [x] Publish path rewrites then restores the manifest even on failure
- [x] `vp exec vitest run scripts/release-publish.test.ts` passes

---

## Verification Gates

| Gate        | Command                      | Success Criteria                                |
| ----------- | ---------------------------- | ----------------------------------------------- |
| Type safety | repo typecheck recipe        | Zero errors                                     |
| Lint        | repo lint recipe (scoped)    | Zero violations                                 |
| Tests       | repo test recipe (scoped)    | All pass                                        |
| Full QA     | repo full-QA recipe          | All pass                                        |
| Perf        | bundle / runtime measurement | No regression vs baseline (or N/A — delete row) |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | None      |              |
| Downstream | None      |              |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
|           |      |          |      |

## Non-goals

- [What this blueprint does NOT cover]

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
|      |        |            |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
|           |            |         |     |

## Trust Dossier

Draft note: complete this dossier before promotion to planned.

### Readiness Verdict

- promotion-ready: false
- unresolved-count: 1
- verified-at: <ISO-8601 timestamp>
- verified-head: <full git commit SHA>
- trust-gate-version: v1

### Material Claims

| ID  | Claim | Evidence |
| --- | ----- | -------- |

### Material Decisions

| ID  | Decision | Chosen option | Rejected alternatives | Rationale |
| --- | -------- | ------------- | --------------------- | --------- |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |

### Residual Unknowns

Complete before planned promotion.
