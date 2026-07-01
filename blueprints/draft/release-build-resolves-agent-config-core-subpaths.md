---
type: blueprint
status: draft
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "100% (implemented; local verification passing)"
depends_on: []
cross_repo_depends_on: []
tags: []
approvals: [] # ≥2 distinct reviewer approvals required before draft→planned (see ## Approvals)
---

# Release build resolves agent-config core subpaths

**Goal:** Make the release publish script build direct workspace dependencies before building a publishable package, so `@webpresso/agent-config` can resolve `@webpresso/agent-core/*` subpath exports during release reruns when `agent-core` was already published and skipped.

## Planning Summary

- Goal input: `Release build resolves agent-config core subpaths`
- Complexity: `S`
- Draft slug: `release-build-resolves-agent-config-core-subpaths`
- Output path: `blueprints/draft/release-build-resolves-agent-config-core-subpaths.md`
- Generated command: `wp blueprint new "Release build resolves agent-config core subpaths" --complexity S`
- Default shape: folder (`blueprints/<status>/<slug>/_overview.md`, with sibling `reviews.md` for approvals); flat `blueprints/<status>/<slug>.md` is legacy-valid
- Validation scope: parser compliance before write

## Architecture Overview

```text
release-publish.ts
  ├─ discoverWorkspacePackages(orderWorkspacePackagesForRelease)
  ├─ publishSimpleWorkspacePackage(agent-core)
  │    └─ skips publish if version already exists
  └─ publishSimpleWorkspacePackage(agent-config)
       ├─ buildWorkspaceDependencies(agent-config) -> pnpm --filter @webpresso/agent-core run build
       └─ pnpm --filter @webpresso/agent-config run build
```

## Key Decisions

| Decision                                                  | Choice                                                                                | Rationale                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Build direct workspace dependencies in the release script | Add `buildWorkspaceDependencies(pkg)` before each publishable workspace package build | Release uses workspace symlinks; skipped already-published packages can leave dependency `dist/` outputs absent in a clean runner. |

## Quick Reference (Execution Waves)

| Wave              | Tasks | Dependencies | Parallelizable |
| ----------------- | ----- | ------------ | -------------- |
| **Wave 0**        | 1.1   | None         | 1 agent        |
| **Critical path** | 1.1   | --           | 1 wave         |

**Note:** Use t-shirt sizing (XS/S/M/L/XL) for individual task estimates, NOT day/week estimates.

**Lifecycle:** Blueprint frontmatter `status` is one of `draft`, `planned`, `parked`, `in-progress`, `completed`, `archived`. Use `parked` when the blueprint is intentionally paused but should remain distinct from active planning or abandoned work. There is no blueprint-level `blocked` status; when work waits on an external dependency, set the task **Status:** to `blocked` and add a non-empty **Blocked:** line with the reason.

> [!NOTE]
> This template reflects the current preferred blueprint structure. Repo-wide validity is determined by the live blueprint parser/audit rules, so older blueprints may still use a different-but-valid section mix.

## Approvals (≥2 required before promotion to `planned`)

Promotion `draft → planned` requires **≥2 provenance-backed approvals from distinct reviewers**,
recorded in the frontmatter `approvals:` list (the gate input; this checklist is
a human-readable mirror). Each entry is a real independent review pass tied to a
committed `reviews.md` structured record with a separate tracked transcript/artifact
(for example `artifact: review-artifacts/deepseek-final.md`). Enforced by
`wp audit blueprint-lifecycle` and the `wp blueprint promote` command. See
`catalog/agent/rules/pre-implementation.md`.

- [ ] Eng review (`/plan-eng-review`)
- [ ] Codex (`/codex`)
- [ ] Outside voice — `/deepseek` / `/mimo` / `/glm`
- [ ] CEO review (`/plan-ceo-review`)

### Phase 1: [Phase Name] [Complexity: S]

#### Task 1.1: [Component Name]

> **Task header (current accepted form):** Use `#### [lane] Task X.Y:` when the task has a clear lane (`[schema]`, `[backend]`, `[ui]`, `[infra]`, `[docs]`, `[qa]`). `#### Task X.Y:` is still valid, but lane-prefixed headers are preferred in new blueprints.

**Status:** done

**Depends:** None

Fix the release failure from GitHub Actions job `84612126635`: `@webpresso/agent-config@0.3.4` failed to build because TypeScript could not resolve `@webpresso/agent-core/deploy`, `/dev`, `/e2e`, `/process`, and `/repo-root`. In a clean release rerun, `@webpresso/agent-core@0.1.2` was already published and skipped, so its workspace `dist/` exports were never rebuilt before `agent-config` compiled against the workspace symlink.

**Files:**

- Modify: `scripts/release-publish.ts`
- Modify: `scripts/release-publish.test.ts`

**Steps (TDD):**

1. Add a release-script regression test that requires direct workspace dependencies to build before the package build.
2. Implement `buildWorkspaceDependencies(pkg)` using the existing `run`/`exitCode` helpers.
3. Call the helper before `pnpm --filter <pkg> run build` in `publishSimpleWorkspacePackage`.
4. Verify the release-path failure mode by building `@webpresso/agent-core` before `@webpresso/agent-config` in a clean local tree.

**Acceptance:**

- Done: Regression test covers dependency build ordering
- Done: Implementation exits on dependency build failure
- Done: `@webpresso/agent-core` then `@webpresso/agent-config` build sequence passes
- Done: Test/typecheck/lint/format evidence recorded

---

## Verification Gates

| Gate                | Command                                                                                        | Success Criteria    |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------- |
| Type safety         | `./bin/wp typecheck`                                                                           | Passed              |
| Lint                | `./bin/wp lint`                                                                                | Passed              |
| Format              | `./bin/wp format --check`                                                                      | Passed              |
| Tests               | `./bin/wp test --file scripts/release-publish.test.ts`                                         | Passed              |
| Release-path build  | `vp run --filter @webpresso/agent-core build && vp run --filter @webpresso/agent-config build` | Passed              |
| Blueprint lifecycle | `./bin/wp audit blueprint-lifecycle --json`                                                    | Passed (`ok: true`) |

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

- Publishing directly from a local machine.
- Changing package versions or release provenance.
- Replacing `workspace:*` dependencies.

## Risks

| Risk                                          | Impact                      | Mitigation                                                                                |
| --------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| Duplicate dependency builds in release reruns | Slightly longer release job | Keep the helper scoped to direct workspace dependencies and existing package build order. |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
|           |            |         |     |

## Trust Dossier

Implementation dossier for the release-fix PR.

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T20:30:00Z
- verified-head: PR #356 head (`Fix release workspace dependency builds` commit)
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                                                                  | Evidence                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Release failure was caused by `agent-config` compiling against an unbuilt workspace `agent-core` symlink after the already-published `agent-core` package was skipped. | GitHub job `84612126635` log; local clean build reproduced missing `@webpresso/agent-core/*` subpaths until `agent-core` was built first. |
| C2  | Building direct workspace dependencies before each publishable workspace package build resolves the failure path.                                                      | `vp run --filter @webpresso/agent-core build && vp run --filter @webpresso/agent-config build` passed.                                    |

### Material Decisions

| ID  | Decision                                        | Chosen option                                           | Rejected alternatives                                                                         | Rationale                                                                                       |
| --- | ----------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| D1  | Where to fix release dependency build readiness | Release script pre-builds direct workspace dependencies | Change package exports; force publish already-published packages; rely on global `wp` changes | The failure is release-orchestration-specific and reproducible with local package dist missing. |

### Promotion Gates

| Gate             | Command                                                                                        | Expected outcome | Last result |
| ---------------- | ---------------------------------------------------------------------------------------------- | ---------------- | ----------- |
| Test             | `./bin/wp test --file scripts/release-publish.test.ts`                                         | pass             | pass        |
| Dependency build | `vp run --filter @webpresso/agent-core build && vp run --filter @webpresso/agent-config build` | pass             | pass        |
| Typecheck        | `./bin/wp typecheck`                                                                           | pass             | pass        |
| Lint             | `./bin/wp lint`                                                                                | pass             | pass        |
| Format           | `./bin/wp format --check`                                                                      | pass             | pass        |
| Blueprint audit  | `./bin/wp audit blueprint-lifecycle --json`                                                    | ok               | ok          |

### Residual Unknowns

None for the code fix; GitHub Actions still needs to validate after PR update.
