---
type: blueprint
title: "Agent Kit: base `wp` core"
owner: ozby
status: completed
complexity: L
created: "2026-05-30"
last_updated: "2026-05-31"
progress: "100% (completed)"
depends_on:
  - 2026-05-30-cross-project-wp-execution-map
tags:
  - wp
  - agent-kit
  - package-facade
  - tooling
---

# Agent Kit: base `wp` core

**Goal:** Make `@webpresso/agent-kit` sufficient as the base `wp` surface for
human and CI workflows by adding package-manager verbs, keeping managed
toolchain routing internal, and removing public leakage of raw `vp`, direct
`vitest`, and bare `tsc`.

## Planning Summary

- Goal input: `Base wp surface in agent-kit`
- Complexity: `L`
- Draft slug: `2026-05-30-agent-kit-base-wp-core`
- Output path: `blueprints/completed/2026-05-30-agent-kit-base-wp-core.md`
- Validation scope: parser compliance + package-surface safety

## Architecture Overview

```text
user/CI
  -> wp install/add/remove/update/run/exec
  -> wp test/typecheck/lint/format/e2e/audit
  -> managed agent-kit routing
  -> vp / tool binaries (internal only)
```

## Key Decisions

| Decision           | Choice                  | Rationale                                                                           |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| Package verb owner | `agent-kit`             | Base `wp` must be useful without framework installed                                |
| Internal delegate  | `vp`                    | Vite+ already owns package-manager orchestration                                    |
| Public policy      | `wp` first              | Users should not need to know whether a flow is `vp`, `tsc`, or `vitest` underneath |
| Recursion policy   | wrapper-safe by default | package scripts must not loop when switched to `wp`                                 |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies | Parallelizable | Effort (T-shirt) |
| ----------------- | --------------- | ------------ | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2        | None         | 2 agents       | S                |
| **Wave 1**        | 1.3, 1.4        | Wave 0       | 2 agents       | S-M              |
| **Wave 2**        | 2.1             | Wave 1       | 1 agent        | S                |
| **Critical path** | 1.1 → 1.3 → 2.1 | --           | 3 waves        | M                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target | Actual |
| ------ | ---------------------------------- | ------ | ------ |
| RW0    | Ready tasks in Wave 0              | ≥ 1    | 2      |
| CPR    | total_tasks / critical_path_length | ≥ 2.5  | 1.67   |
| DD     | dependency_edges / total_tasks     | ≤ 2.0  | 1.0    |
| CP     | same-file overlaps per wave        | 0      | 0      |

Refinement delta: The public-verb lane and managed-runner lane run separately,
but package-surface cleanup stays downstream to avoid export/bin conflicts.

### Phase 1: public command completion [Complexity: M]

#### [cli] Task 1.1: Add first-class package verbs to base `wp`

**Status:** done

**Depends:** None

Implement `wp install`, `wp add`, `wp remove`, `wp update`, `wp exec`, and
`wp run` as first-class base commands backed by managed `vp`. The commands must
be public UX, not just internal helpers.

**Files:**

- Modify: `package.json`
- Modify: `src/cli/**`
- Modify: `src/tool-runtime/**`
- Modify: `src/**/test*.ts`

**Steps (TDD):**

1. Add failing command-dispatch tests for each new top-level verb.
2. Run scoped tests for the new command surfaces — verify FAIL.
3. Implement minimal command handlers that delegate to managed `vp`.
4. Run scoped tests again — verify PASS.
5. Run scoped lint and typecheck on changed files.

**Acceptance:**

- [x] Base `wp` exposes package verbs directly.
- [x] Delegation happens through managed `vp`, not public raw shell snippets.
- [x] Tests pin the public command surface.

#### [runtime] Task 1.2: Finish managed tool runner routing

**Status:** done

**Depends:** None

Extend the managed runner layer so TypeScript, Vitest, Oxlint, and Oxfmt stay
internal details. The goal is to make `wp` the public surface even when a
command ultimately needs `vp exec`.

**Files:**

- Modify: `src/tool-runtime/**`
- Modify: `src/typecheck/**`
- Modify: `src/test/**`
- Modify: `src/lint/**`
- Modify: `src/format/**`

**Steps (TDD):**

1. Add failing tests proving runner resolution stays on managed commands.
2. Run scoped tests — verify FAIL.
3. Implement or tighten managed runner resolution and output handling.
4. Run scoped tests — verify PASS.

**Acceptance:**

- [x] No runtime path spawns bare `tsc`.
- [x] Public test/typecheck/lint/format flows do not require direct tool commands.
- [x] Managed runner tests cover the intended delegate contracts.

### Phase 2: public-surface cleanup [Complexity: M]

#### [docs] Task 1.3: Migrate public docs, scripts, and workflows to `wp`-first language

**Status:** done

**Depends:** Task 1.1

Replace active public guidance that still tells users to reach for raw `vp`
where a first-class `wp` verb now exists. Keep `vp` visible only as an internal
delegate or explicit low-level escape hatch.

**Files:**

- Modify: `AGENTS.md`
- Modify: `catalog/**`
- Modify: `docs/**`
- Modify: `.github/workflows/**`
- Modify: `scripts/**`

**Steps (TDD):**

1. Add or update contract tests/smokes that scan public docs and scripts for deprecated guidance.
2. Run scoped tests — verify FAIL.
3. Update active user-facing docs/workflows/templates.
4. Run scoped tests — verify PASS.

**Acceptance:**

- [x] Public docs/scripts prefer `wp` for common workflows.
- [x] Remaining `vp` mentions are clearly internal or exceptional.
- [x] Contract tests guard against regressions.

#### [qa] Task 1.4: Keep package scripts and lifecycle hooks recursion-safe

**Status:** done

**Depends:** Task 1.1, Task 1.2

Generalize the existing recursion-safety work beyond `wp test` and
`wp typecheck` so new package verbs and future `wp`-first scripts cannot loop.

**Files:**

- Modify: `src/cli/**`
- Modify: `src/**/test*.ts`

**Steps (TDD):**

1. Add failing tests for self-invoking package scripts and lifecycle contexts.
2. Run scoped tests — verify FAIL.
3. Implement the smallest safe recursion guards.
4. Run scoped tests — verify PASS.

**Acceptance:**

- [x] Self-recursive wrapper paths bypass safely.
- [x] Package-lifecycle chatter stays internal and automatic.
- [x] Guard behavior is covered by tests.

### Phase 3: package-surface safety [Complexity: S]

#### [qa] Task 2.1: Verify new public bins/exports stay package-safe

**Status:** done

**Depends:** Task 1.3, Task 1.4

The new base `wp` surface changes public package behavior, so tarball/export/bin
verification must be part of the plan, not an afterthought.

**Files:**

- Modify: `package.json`
- Modify: `src/build/**`
- Modify: `src/**/test*.ts`

**Steps (TDD):**

1. Add failing package-surface tests for bins/exports touched by the new command model.
2. Run scoped tests — verify FAIL.
3. Implement the minimal fixes to keep package contents and public API safe.
4. Run scoped tests — verify PASS.

**Acceptance:**

- [x] Package-surface tests cover the new base `wp` surface.
- [x] Tarball/bin/export checks are part of the final verification gates.
- [x] No private content leaks onto public package surfaces.

## Completion Evidence

- `wp` top-level package verbs are implemented in `src/cli/commands/package-manager.ts` and registered from `src/cli/cli.ts`.
- Managed runner routing keeps `tsc`, `vitest`, `oxlint`, and `oxfmt` behind the `vp exec` delegate in `src/tool-runtime/resolve-runner.ts`.
- Recursive package-script bypass behavior is covered by `src/cli/package-scripts.test.ts` and the test command builder.
- Package-surface and public-command guardrails are covered by `package.contract.test.ts`, `scripts/bin-launcher.test.ts`, and `src/audit/no-legacy-cli-bin.test.ts`.

## Verification Gates

| Gate            | Command                    | Success Criteria                   |
| --------------- | -------------------------- | ---------------------------------- |
| Type safety     | `wp typecheck`             | Zero errors                        |
| Lint            | `wp lint`                  | Zero violations                    |
| Tests           | `wp test`                  | All targeted tests pass            |
| Audits          | `wp audit`                 | Relevant guardrail audits pass     |
| Package surface | repo tarball/export checks | No leaked or broken public surface |

## Cross-Plan References

| Type       | Blueprint                                         | Relationship                                      |
| ---------- | ------------------------------------------------- | ------------------------------------------------- |
| Upstream   | `2026-05-30-cross-project-wp-execution-map`       | umbrella execution order                          |
| Downstream | `2026-05-30-framework-wp-extension`               | consumes base command model                       |
| Downstream | `2026-05-30-ingest-lens-wp-thin-consumer`         | thin-consumer migration depends on base verbs     |
| Downstream | `2026-05-30-edge-matte-wp-thin-consumer`          | thin-consumer migration depends on base verbs     |
| Downstream | `2026-05-30-monorepo-wp-first-framework-consumer` | framework consumer adoption depends on base verbs |

## Edge Cases and Error Handling

| Edge Case                                               | Risk          | Solution                              | Task |
| ------------------------------------------------------- | ------------- | ------------------------------------- | ---- |
| New package verb still leaks raw `vp` guidance publicly | UX drift      | lock docs/scripts with contract tests | 1.3  |
| Package script calls `wp` recursively                   | infinite loop | keep recursion-safe bypass logic      | 1.4  |

## Non-goals

- Moving framework-specific project commands into `agent-kit`
- Eliminating `vp` as an internal delegate

## Risks

| Risk                                         | Impact | Mitigation                                                       |
| -------------------------------------------- | ------ | ---------------------------------------------------------------- |
| Public package surfaces change unsafely      | High   | make tarball/export verification mandatory                       |
| `wp` still feels incomplete after the change | High   | land package verbs and managed runners before consumer migration |

## Technology Choices

| Component                | Technology             | Version              | Why                                      |
| ------------------------ | ---------------------- | -------------------- | ---------------------------------------- |
| Package-manager delegate | `vite-plus (vp)`       | current repo version | Underlying package-manager orchestration |
| Public CLI owner         | `@webpresso/agent-kit` | workspace            | Base `wp` surface                        |

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                       |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-05-30-agent-kit-base-wp-core.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
