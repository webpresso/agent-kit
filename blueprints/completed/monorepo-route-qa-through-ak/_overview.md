---
type: blueprint
title: "Route Monorepo QA Through agent-kit"
owner: agent-kit
status: completed
complexity: M
created: '2026-05-06'
last_updated: '2026-05-06'
completed_at: '2026-05-06'
progress: '100% (4 of 4 tasks completed — Monorepo compact-QA adapter implemented and verified)'
depends_on:
  - compact-qa-output-filters
tags:
  - agent-kit
  - monorepo
  - qa
  - context-window
  - cross-repo
---

# Route Monorepo QA Through agent-kit
## Product wedge anchor

- **Stage outcome:** the completed Route Monorepo QA Through agent-kit work remains truthfully represented in the blueprint lifecycle and continues to describe the shipped outcome of this lane.
- **Consuming surface:** the repo-local agent-kit surfaces and docs touched by this completed lane.
- **New user-visible capability:** none new in this cleanup pass; the capability shipped already, and this blueprint now stays structurally valid as a completed record.


**Goal:** Close the compact-QA caveat for the **Monorepo** by deciding and
implementing the safest bridge from `webpresso/monorepo` `just qa` to compact
agent-kit QA output, without expanding `compact-qa-output-filters` or
reimplementing rtk filters in agent-kit.

## Why

`compact-qa-output-filters` deliberately covers the agent-kit MCP QA path:
`wp qa`, `wp test`, `wp lint`, `wp typecheck`, and local dev commands that
`ak-pretool-guard` redirects to those MCP handlers.

The **Monorepo** `just qa` recipe is different: it runs its own parallel
pipeline and does not currently call `wp qa`. Compacting that output needs a
separate cross-repo boundary decision:

1. route `just qa` through the agent-kit MCP path, preserving Monorepo flags; or
2. keep Monorepo orchestration local and add an explicit adapter that emits the
   same compact contract.

This blueprint exists so the caveat is durable, testable, and not hidden inside
the compact-QA implementation blueprint.

## Scope

### A. Boundary discovery

- Inspect the Monorepo `just qa` recipe and its package/file filter semantics.
- Map which stages correspond to `wp lint`, `wp typecheck`, `wp test`, and
  `wp qa`.
- Identify any Monorepo-only stages that cannot be represented by agent-kit MCP
  tools yet.

### B. Bridge decision

Pick one bridge:

- **Preferred:** route Monorepo `just qa` to `wp qa`/MCP handlers while
  preserving package and file filters.
- **Fallback:** define a Monorepo-side adapter that emits the compact-QA
  transform contract without moving orchestration into agent-kit.

Record the decision in this blueprint before implementation starts.

## Boundary discovery result (2026-05-06)

Current Monorepo `just qa` is a thin shell wrapper over the internal workspace
task runner:

- `justfile` recipe: `qa *args` builds a target string and invokes
  `bun ./apps/cli-wp/src/internal/workspace-tasks.ts qa`.
- Full-repo `just qa` runs root checks first through `vp run -w --log grouped
  qa:root`, then package typecheck and package test stages.
- Scoped package mode:
  - `just qa cli2` becomes `workspace-tasks qa --package cli2`.
  - `just qa --package cli2 config` forwards package filters directly.
- Scoped file mode:
  - `just qa --file <paths...>` resolves file paths back to package filters
    before running package QA.
- Supported workspace-task flags include `--package`, `--file`, `--quick`,
  `--continue`, `--no-cache`, `--cache`, `--affected`, and passthrough after
  `--`.
- Runtime/memory behavior is Monorepo-specific: the `just qa` wrapper applies
  systemd cgroup limits on Linux, dynamic `VP_RUN_CONCURRENCY_LIMIT` on macOS,
  and `NODE_OPTIONS=--max-old-space-size=2048`; the runner further caps QA
  typecheck/test fan-out.

Stage mapping:

| Monorepo stage | Current command surface | agent-kit MCP analogue | Fit |
| --- | --- | --- | --- |
| Root checks | `vp run -w --log grouped qa:root` | none | Monorepo-only |
| Typecheck | `buildTypecheckCommand(...)` over VP package filters | `wp_typecheck(packages)` | Partial; package names/filters differ |
| Test | `buildVpTestCommand(...)` over VP package/file resolution | `wp_test(packages/files)` | Partial; just backend currently maps to `just test`, not Monorepo QA stage logs |
| Lint | mostly package/root `qa` scripts, not a distinct `just qa` stage | `wp_lint(files)` | Partial; Monorepo root checks/package scripts own policy |
| QA aggregate | `workspace-tasks qa` + root/typecheck/test stage logs | `wp_qa` MCP composition | Not a drop-in CLI replacement |

Unsupported or risky for direct `wp_qa` routing:

- `wp_qa` is an MCP tool, not a user-facing `wp qa` CLI command.
- The current agent-kit `just` backend only shells to `just test` for test
  execution; it does not understand Monorepo `workspace-tasks qa` stage logs.
- Direct replacement would bypass root `qa:root`, GraphQL artifact preflight,
  runtime profile bootstrapping, package/file-to-VP filter resolution, and
  memory/concurrency safeguards.
- Monorepo currently consumes `@webpresso/agent-kit` via pnpm catalog
  (`0.2.0` in `pnpm-workspace.yaml`), so relying on unreleased agent-kit MCP
  compaction from this repo is a versioning boundary.

## Bridge decision (2026-05-06)

Choose the **Monorepo-side adapter**.

Rationale: the softest sufficient boundary is to keep Monorepo orchestration
inside `apps/cli-wp/src/internal/workspace-tasks.ts` and adapt its existing
stage outputs to the compact-QA contract. That preserves root checks, artifact
preflights, file/package filters, VP grouping, and memory safeguards while
still making the LLM-facing payload compact.

Rejected: route `just qa` directly through `wp_qa`/MCP now.

Reason: `wp_qa` is not currently a CLI command, its just backend does not model
Monorepo QA stages, and routing would either drop Monorepo-only root/preflight
behavior or require moving Monorepo orchestration into agent-kit. That violates
the blueprint boundary more than an adapter does.

Ownership boundary:

- Monorepo owns command graph, filter semantics, root checks, and stage logs.
- agent-kit owns the generic compact-QA output contract and transforms.
- Any agent-kit change should be limited to exporting/reusing a generic
  transform contract if the adapter needs a package-level helper; no rtk clone
  and no Monorepo-specific orchestration in agent-kit.

### C. Implementation

- Update the chosen Monorepo command surface.
- Keep agent-kit changes limited to generic flags/contracts needed by the MCP
  path.
- Do not edit rtk internals or add rtk-equivalent filters to agent-kit.

### D. Verification

- Seed one lint failure, one type error, and one failing test in a Monorepo
  fixture/worktree.
- Run Monorepo `just qa`.
- Assert the LLM-facing payload uses the compact-QA contract and preserves all
  failures with file/line signal.

## Out of scope

- Reopening `compact-qa-output-filters` scope.
- Reimplementing rtk long-tail filters in agent-kit.
- Compressing arbitrary shell commands such as `git`, `gh`, `kubectl`, `cargo`,
  or `pytest`; those remain rtk's lane.
- Changing completed roadmap decisions.

## Verification Gates

| Gate | Expected behavior |
| --- | --- |
| **G1. Boundary decision** | Blueprint records whether Monorepo uses `wp qa` routing or a Monorepo-side adapter, with reasons. |
| **G2. Flag preservation** | Existing Monorepo package/file filters still work after routing. |
| **G3. Compact payload** | Seeded lint/type/test failures produce an LLM-facing compact payload ≤ 2 KB total, unless the chosen adapter documents a different budget. |
| **G4. Failure preservation** | All seeded failures remain present with file/line signal. |
| **G5. No rtk clone** | No agent-kit-side rtk filter reimplementation is added. |
| **G6. Cross-repo docs** | Boundary contract or blueprint notes document which repo owns future changes. |

## Tasks (Blueprint format)

#### [agent-kit] Task 1.1: Discover Monorepo QA boundary

**Status:** done

**Depends:** None

Inspect the Monorepo QA recipe and document the bridge constraints before
editing either repo.

**Files:**

- Inspect: `webpresso/monorepo/justfile`
- Inspect: Monorepo package/test/lint/typecheck config touched by `just qa`
- Modify: this blueprint's decision section

**Steps (TDD):**

1. Capture current `just qa` command graph.
2. Identify package/file filter semantics.
3. Map stages to agent-kit MCP tools where possible.
4. Record unsupported stages and risks.

**Acceptance:**

- [x] Current Monorepo `just qa` stages are documented.
- [x] Existing filter semantics are documented.
- [x] Unknowns are resolved or explicitly blocked.

**Evidence (2026-05-06):** inspected `/Users/ozby/repos/webpresso/monorepo/justfile`, `apps/cli-wp/src/internal/workspace-tasks.ts`, root package/catalog agent-kit references, and agent-kit MCP `wp_qa`/just backend implementation; documented stage graph, filter semantics, and non-drop-in risks above.

#### [agent-kit] Task 1.2: Choose bridge contract

**Status:** done

**Depends:** Task 1.1

Choose `wp qa` routing or Monorepo-side adapter based on the discovery result.

**Files:**

- Modify: this blueprint's "Bridge decision" section
- Modify/create: relevant boundary contract under `.agent/planning/` if the
  chosen bridge changes cross-repo ownership

**Steps (TDD):**

1. Compare `wp qa` routing vs Monorepo-side adapter.
2. Pick the softest sufficient boundary.
3. Document rejected alternative and reason.
4. Define acceptance fixtures for the chosen path.

**Acceptance:**

- [x] Decision is explicit.
- [x] Rejected alternative is documented.
- [x] Ownership boundary is clear.

**Evidence (2026-05-06):** selected Monorepo-side adapter, rejected direct `wp_qa` routing, and recorded ownership split in the Bridge decision section above.

#### [agent-kit] Task 2.1: Implement selected bridge

**Status:** done

**Depends:** Task 1.2

Make Monorepo `just qa` reach compact-QA output through the selected boundary.

**Files:**

- Modify: Monorepo `just qa` surface or adapter files
- Modify: agent-kit MCP flags/contracts only if the selected bridge requires it

**Steps (TDD):**

1. Write/identify failing integration fixture.
2. Implement the selected bridge.
3. Preserve existing Monorepo flags.
4. Keep agent-kit changes generic.

**Acceptance:**

- [x] `just qa` reaches the compact-QA contract.
- [x] Existing flags still work.
- [x] No rtk filter clone is introduced.

**Evidence (2026-05-06):** implemented the Monorepo-side adapter in `/Users/ozby/repos/webpresso/monorepo/apps/cli-wp/src/internal/workspace-tasks.ts` and tests in `apps/cli-wp/src/internal/workspace-tasks.test.ts`. The adapter keeps the existing `just qa`/`workspace-tasks qa` command graph, switches QA stages to captured log-backed execution only when compact mode is active (`WP_COMPACT`, `QUALITY_ENGINE_COMPACT`, `--json`, or non-TTY agent context), emits the Agent Kit-style summary-first payload with `failures`, `tier`, `bytes`, `tokensSaved`, and `logPath`, continues across failed QA stages when `continue` is true, and does not import or clone rtk filters.

#### [agent-kit] Task 3.1: End-to-end compact-output verification

**Status:** done

**Depends:** Task 2.1

Verify the user-facing Monorepo result.

**Files:**

- Create/modify: cross-repo fixture or documented smoke script
- Modify: this blueprint with final verification evidence

**Steps (TDD):**

1. Seed lint, type, and test failures.
2. Run Monorepo `just qa`.
3. Assert compact payload budget and failure preservation.
4. Record evidence.

**Acceptance:**

- [x] G1-G6 pass.
- [x] Evidence links to commands/output summary.
- [x] Follow-up risks are documented.

**Evidence (2026-05-06):** Monorepo-focused tests passed with `../../node_modules/.bin/vitest run src/internal/workspace-tasks.test.ts --reporter=dot --maxWorkers=1` from `apps/cli-wp` (21 tests). Focused package typecheck passed with `pnpm --filter @repo/cli-wp typecheck`. User-facing smoke passed with `WP_COMPACT=1 NODE_OPTIONS=--max-old-space-size=4096 just qa --package cli-wp --quick --no-cache`, returning compact JSON (`passed: true`, `summary: qa passed`, `details.typecheck`, `bytes: 288`). A temporary seeded failing test file was created and removed to exercise the real `just qa --file` path; it returned non-zero with compact JSON under budget (`bytes: 1875`) and preserved the failing test stage plus log path. Unit fixtures cover the full lint/typecheck/test failure-preservation contract, including file/line/code signals and the ≤2 KB budget.

**Follow-up risks:** full-repo `just qa` remains expensive and was not run; the compact adapter intentionally summarizes Monorepo stage logs rather than adopting agent-kit MCP `wp_qa`; future work can export a generic agent-kit transform package once Monorepo can consume a released version. Existing unrelated Monorepo test failures surfaced in `src/public-surface.integrity.test.ts` during the seeded `--file` smoke and are not introduced by this bridge.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| --- | --- | --- | --- | --- |
| Wave 0 | 1.1 | None | no | S |
| Wave 1 | 1.2 | Task 1.1 | no | S |
| Wave 2 | 2.1 | Task 1.2 | no | M |
| Wave 3 | 3.1 | Task 2.1 | no | S |

Critical path: 1.1 → 1.2 → 2.1 → 3.1.

## Related

- Prerequisite: [`compact-qa-output-filters`](../compact-qa-output-filters/_overview.md)
- Sibling: [`integrate-rtk-as-peer-plugin`](../integrate-rtk-as-peer-plugin/_overview.md)
- Context snapshot: `.omx/context/compact-qa-caveat-20260506T170959Z.md`

## Completion Summary

### Deliverables

- Documented the Monorepo QA boundary and rejected direct `wp_qa` routing for this cross-repo bridge.
- Implemented a Monorepo-owned compact QA adapter in `apps/cli-wp/src/internal/workspace-tasks.ts` that preserves existing `just qa` filters, logs full stage output, and emits Agent Kit-style summary-first compact JSON in agent contexts.
- Added focused Monorepo tests for compact TypeScript diagnostics, lint/type/test failure preservation, ≤2 KB payload budget, and compact-mode escape hatches.
- Moved this blueprint to completed with command evidence and follow-up risks recorded.

### Impact

Monorepo `just qa` can now produce a compact, machine-actionable payload without moving Monorepo orchestration into agent-kit or cloning rtk filters. Full logs remain available by stage log path, while agent-facing output stays budgeted and preserves failure signals.

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/monorepo-route-qa-through-ak/_overview.md |

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
