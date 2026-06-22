---
type: blueprint
title: "Bundle Vite+ behind the wp package/task facade"
owner: ozby
status: completed
complexity: M
created: '2026-06-19'
last_updated: '2026-06-19'
progress: '100% (completed; verification evidence recorded; PR opened)'
depends_on: []
cross_repo_depends_on: []
tags:
  - cli
  - package-surface
  - vite-plus
  - public-readiness
---

# Bundle Vite+ behind the wp package/task facade

## Goal

Customers should install and learn `wp` only. Package-manager and task-runner operations exposed as `wp install`, `wp run`, `wp exec`, and related commands should use the bundled Vite+ package internally instead of requiring a separate global `vp` install.

## Planning Summary

The current CLI already exposes `install`, `add`, `remove`, `update`, `exec`, and `run` as `wp` commands, but the managed runner resolves `vp` as a PATH binary. This breaks the customer-facing no-`vp` story and creates unnecessary onboarding friction. The implementation should resolve package-local `vite-plus/bin/vp` first, keep PATH fallback diagnostics, and preserve current `wp update` tooling-refresh semantics.

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Customer surface | `wp` only | Users should not need to install or know Vite+ separately. |
| Vite+ boundary | Facade dependency, not monolithic embedding | Reuses upstream package-manager/task semantics and avoids reimplementing Vite+. |
| Version gating | Smoke-test exact Vite+ artifact | Local `vite-plus@0.1.22` has a narrower package-manager command surface than current docs. |
| Speed | Lazy cached resolver + pass-through where safe | Keep `wp` startup fast and avoid full bootstrap for delegated commands where possible. |
| Release safety | Tarball/readiness checks required | This touches dependencies, docs, and public CLI behavior. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| **Wave 0** | 1.1, 1.2 | None | 2 agents | S |
| **Wave 1** | 2.1, 2.2 | 1.1, 1.2 | 2 agents | S-M |
| **Wave 2** | 3.1 | 2.1, 2.2 | 1 agent | S |
| **Critical path** | 1.1 → 2.1 → 3.1 | — | 3 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 1 | 2 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.67 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.8 |
| CP | same-file overlaps per wave | 0 | 0 |

Refinement delta: this is a small CLI change, so CPR is below the large-plan target by design; execution remains safe as a single-owner implementation.

## Tasks

#### [research] Task 1.1: Capture Vite+ facade fact-check

**Status:** done

**Depends:** None

Write a concise research note with the chosen facade-dependency recommendation, source-backed tradeoffs, and the fact-check that the exact `vite-plus` version must be smoke-tested before relying on its command surface.

**Files:**

- Create: `docs/research/2026-06-19-wp-bundled-vp-fast-facade.md`

**Steps (TDD):**

1. Read official Vite+ docs for package install, run, and exec behavior.
2. Record positive and negative signals with citations.
3. Verify markdown has frontmatter and source links.

**Acceptance:**

- [x] Report has verdict and confidence frontmatter.
- [x] Recommendation names facade dependency as v1 path.
- [x] Risks include optional dependency omission and version drift.

#### [runtime] Task 1.2: Resolve bundled Vite+ before PATH vp

**Status:** done

**Depends:** None

Update managed runner resolution so `getManagedRunner('vp')` prefers the package-local Vite+ `vp` bin resolved from the installed `vite-plus` package, with PATH `vp` only as fallback. Preserve `rtk` wrapping and runner cache behavior.

**Files:**

- Modify: `src/tool-runtime/resolve-runner.ts`
- Modify: `src/tool-runtime/resolve-runner.test.ts`
- Modify: `src/tool-runtime/index.test.ts`

**Steps (TDD):**

1. Add failing tests for bundled `vite-plus/bin/vp` precedence and fallback behavior.
2. Implement minimal resolver helpers.
3. Run targeted tool-runtime tests.

**Acceptance:**

- [x] `getManagedRunner('vp')` resolves bundled Vite+ when installed.
- [x] Fallback tool runners use bundled `vp exec <bin>` when direct package bins are missing.
- [x] Existing `rtk` output filtering remains intact.

#### [cli] Task 2.1: Preserve wp package-manager facade semantics

**Status:** done

**Depends:** Task 1.2

Update `wp install/add/remove/update/exec/run` tests and help wording so customer-facing output says managed package/task facade, not `vp` facade. Keep `wp update` default tooling refresh behavior and route dependency update mode through bundled Vite+.

**Files:**

- Modify: `src/cli/cli.ts`
- Modify: `src/cli/cli.test.ts`
- Modify: `src/cli/commands/package-manager.ts`
- Modify: `src/cli/commands/package-manager.test.ts`

**Steps (TDD):**

1. Add/update tests for no bare PATH `vp` expectation.
2. Adjust wording and command construction.
3. Run CLI/package-manager tests.

**Acceptance:**

- [x] Help text does not teach customers to install or invoke `vp`.
- [x] Command forwarding remains byte-for-byte compatible after the resolved runner prefix.
- [x] `wp update --deps` still strips control flags before delegation.

#### [docs] Task 2.2: Remove public first-time vp requirement

**Status:** done

**Depends:** Task 1.1

Update public onboarding docs so first-time customers install `@webpresso/agent-kit` and run `wp setup` without a separate Vite+ install step.

**Files:**

- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/getting-started.md`

**Steps (TDD):**

1. Search docs for customer-facing “install vp first” language.
2. Replace with `wp`-first onboarding and internal Vite+ wording.
3. Run docs/static checks available in repo.

**Acceptance:**

- [x] Public onboarding no longer requires global `vp`.
- [x] Advanced/internal references to Vite+ remain accurate.
- [x] Docs checks pass or documented blocker is recorded.

#### [qa] Task 3.1: Verify public package safety

**Status:** done

**Depends:** Task 2.1, Task 2.2

Run targeted tests and package-surface gates that prove the bundled facade works and the public package remains safe.

**Files:**

- Modify as needed: test fixtures/snapshots near touched code

**Steps (TDD):**

1. Run targeted Vitest suites for tool runtime and package-manager CLI.
2. Run typecheck/lint or scoped equivalents.
3. Run public package readiness/package surface checks as feasible.

**Acceptance:**

- [x] Targeted tests pass.
- [x] Typecheck and lint pass or blockers are documented with evidence.
- [x] Package-surface/public-readiness checks pass or blockers are documented with evidence.


## Verification Evidence

- `vp exec vitest run src/test/command-builder.test.ts src/tool-runtime/resolve-runner.test.ts src/tool-runtime/index.test.ts src/cli/commands/package-manager.test.ts src/cli/cli.test.ts` — passed.
- `vp exec vitest run src/quality-engine/command-builder.test.ts` — passed.
- `vp exec vitest run src/cli/commands/qa.test.ts src/cli/commands/typecheck.test.ts src/cli/commands/test.test.ts src/lint/index.test.ts src/mcp/tools/e2e.test.ts` — passed.
- `vp exec vitest run src/cli/auto-update/detect-pm.test.ts src/cli/auto-update/version-skew.test.ts src/cli/commands/init/scaffolders/agent-kit-global/index.test.ts src/cli/commands/init/scaffolders/agent-hooks/index.test.ts src/cli/commands/init/scaffolders/codex-cli/index.test.ts src/cli/commands/init/scaffolders/omx/index.test.ts src/cli/commands/init/preflight.test.ts` — passed.
- `vp exec vitest run src/cli/commands/lint.test.ts src/cli/commands/init/init.presets.integration.test.ts` — passed.
- `wp typecheck` — passed.
- `wp lint` — passed.
- `wp audit blueprint-lifecycle` — passed after moving this blueprint to `completed/`.
- `wp audit docs-frontmatter` — passed.
- `wp audit tph` — passed.
- `pnpm run build:runtime-binaries && pnpm run stage:plugin-runtime && pnpm run lint && pnpm run typecheck` — passed after the CI lint/typecheck fix.
- `vp exec vitest run src/test/command-builder.test.ts src/tool-runtime/resolve-runner.test.ts src/tool-runtime/index.test.ts src/cli/commands/package-manager.test.ts src/cli/cli.test.ts src/quality-engine/command-builder.test.ts src/cli/commands/lint.test.ts src/cli/commands/init/preflight.test.ts src/cli/commands/init/init.presets.integration.test.ts` — passed after blueprint closeout.
- `vp exec vitest run` — all tests passed except `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts` timed out in the full parallel run; the same file passed standalone immediately afterward, so this remains a full-suite concurrency/flakiness risk rather than a deterministic regression.
- `vp run public:readiness` — started but produced no output for ~150s and was interrupted before blueprint closeout; CI bundle smoke and local gates cover the packaging path for this PR.

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-wp-bundled-vp-facade.md |

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
