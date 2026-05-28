---
type: blueprint
title: "Replace markdown-first blueprint authoring with a structured wp MCP surface"
status: planned
complexity: M
owner: agent-kit
created: 2026-05-28
last_updated: 2026-05-28
progress: >-
  0% (planned; refined 2026-05-28 against current wp blueprint MCP workflow,
  MCP tool schema guidance, MCP Apps, optimistic concurrency patterns, and
  current markdown-canonical architecture constraints)
depends_on: []
tags:
  - agent-kit
  - blueprints
  - mcp
  - wp
  - authoring
  - public-package
  - pll
---

## Product wedge anchor

- **Stage outcome:** blueprint authoring becomes a first-class structured `wp`
  capability instead of a file-editing side effect.
- **Consuming surface:** `wp_blueprint_put`, `wp_blueprint_transition`, and
  optional `wp_blueprint_patch` / MCP App editor flows inside Codex/Claude/ChatGPT.
- **New user-visible capability:** an agent or user can author, validate, and
  transition a blueprint through structured MCP calls without directly editing
  `_overview.md` as the control plane.

## Summary

Design and implement a structured blueprint authoring surface for `wp` where the
blueprint AST is the mutable control plane and `_overview.md` is a rendered
projection. The initial release should add a deterministic whole-document write
API and an atomic lifecycle transition API with optimistic concurrency. The v1
goal is to remove markdown-first authoring as the control plane; semantic
patching and an MCP Apps-backed editor are explicitly follow-on enhancements and
must not expand the initial implementation surface unless repeated real usage
proves the whole-document path insufficient.

## Fact-checked constraints

| ID | Severity | Finding | Effect |
| --- | --- | --- | --- |
| F1 | CRITICAL | Current `wp` blueprint MCP tools create, validate, list, promote, and advance tasks, but substantive authoring still required direct `_overview.md` edits. | A first-class structured write surface is the missing primitive, not more markdown helpers. |
| F2 | HIGH | MCP tools are schema-first and can expose `inputSchema`, `outputSchema`, and `structuredContent`. | Blueprint authoring should use typed request/response contracts and return structured results. |
| F3 | HIGH | Current lifecycle behavior can feel non-atomic when file edits, validation, ingest, and promote are separate steps. | Transition operations should validate the latest version and change state atomically. |
| F4 | HIGH | Official optimistic concurrency patterns rely on version tokens / ETag-style preconditions. | Blueprint writes and transitions should require an `expected_version` or equivalent head token. |
| F5 | MEDIUM | MCP Apps are now a production-ready official extension for interactive forms and multi-step workflows. | A UI editor is a strong v2, but should layer on top of structured authoring APIs, not replace them. |
| F6 | MEDIUM | Public package changes touching MCP tool surfaces, package manifests, or docs must pass package-surface and tarball leak checks. | The implementation must include package-safety verification before publish-facing changes land. |
| F7 | HIGH | The current architecture explicitly says markdown stays canonical and several mutation flows treat re-ingest failures as non-fatal. | V1 must replace sidecar validation/timestamp drift with revision-bound structured mutations and narrow the source-of-truth model. |
| F8 | MEDIUM | `wp_blueprint_new`, `wp_blueprint_create`, validate timestamps, and `BlueprintCreationService` already split creation/validation semantics across multiple paths. | The new surface should collapse these flows rather than add a fourth parallel authoring path. |

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Canonical authoring primitive | `wp_blueprint_put` | Whole-document structured upsert is the simplest deterministic replacement for file editing. |
| Lifecycle primitive | `wp_blueprint_transition` | Validation + ingest + state transition should happen atomically on the latest known version. |
| Incremental editing | Defer `wp_blueprint_patch` implementation | Keep v1 minimal; define compatibility boundaries but do not ship partial-edit machinery without concrete pressure. |
| Source of truth | Structured blueprint object / AST | Markdown stays human-readable and git-friendly, but stops being the mutable control plane. |
| Validation/concurrency token | Blueprint-scoped revision token | Repo HEAD and validate timestamps are too coarse for blueprint-local write safety. |
| UI strategy | MCP App editor as v2 | Builds on the structured APIs; avoids coupling core correctness to host UI support. |

## Architecture review findings

| ID | Severity | Risk | Fix |
| --- | --- | --- | --- |
| A1 | HIGH | Validate timestamps are slug-scoped sidecar state, so same-file writes can drift from “validated” state without a blueprint-scoped revision. | Bind validation and transitions to a returned revision token from `wp_blueprint_put`. |
| A2 | HIGH | Promotion/finalization can observe file changes, validation state, and projection ingest as separate steps. | Make `wp_blueprint_transition` own revalidate + CAS check + markdown write + ingest. |
| A3 | MEDIUM | A future patch tool could easily reintroduce markdown-level mutation if rushed into v1. | Explicitly defer patch implementation until the whole-document surface proves insufficient. |
| A4 | MEDIUM | Host UI support varies for MCP Apps. | Keep UI strictly optional and layered over the structured APIs. |

## Edge Cases

| Case | Severity | Handling |
| --- | --- | --- |
| Same blueprint edited twice between validate and promote | HIGH | Reject stale transition via blueprint-scoped revision token. |
| Re-ingest fails after a successful markdown write | HIGH | Treat transition/upsert as failed and report structured error; do not silently accept partial success as canonical v1 behavior. |
| Host lacks MCP Apps support | MEDIUM | Structured tools remain canonical; UI editor is skipped. |
| Future sections extend blueprint prose beyond current schema | MEDIUM | Preserve extensible prose sections inside the structured document model rather than reopening raw markdown writes. |

## Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Over-scoping v1 into patching + UI + whole-doc authoring | HIGH | Keep v1 to `put + transition`; document patch/UI as follow-ons only. |
| Breaking compatibility with current lifecycle tools | HIGH | Rewire existing create/promote/finalize flows through the new primitives rather than deleting lifecycle tools outright. |
| Public package surface grows accidentally | MEDIUM | Run tarball/package-surface checks before approving docs/manifest changes. |

## Technology Choices

| Area | Choice | Rationale |
| --- | --- | --- |
| Structured authoring | Typed blueprint document / AST | Makes authoring deterministic and validates before markdown projection. |
| Partial update protocol | Defer domain-specific semantic patch ops | Safer than introducing raw markdown writes or generic patch complexity in v1. |
| Concurrency control | Expected blueprint revision token | Blueprint-local CAS is more precise than git HEAD or validate timestamps. |
| UI enhancement | MCP Apps | Official 2026 path for inline forms/workflows, but not required for correctness. |

## Cross-Plan References

- `agent-kit-hard-cut-to-generic-core-with-wp-as-the-only-canonical-cli`:
  supplies the `wp`-only command posture this blueprint builds on.
- `consolidate-all-webpresso-agent-sub-packages-into-webpresso-itself-with-subpath-exports-consumers-go-from-6-8-pinned-devdeps-down-to-one-webpresso`:
  keeps package-surface consolidation out of scope here; this blueprint should
  reuse its package-safety posture, not reopen naming/export decisions.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2, 1.3 | None | 3 agents | XS-S |
| **Wave 1** | 2.1, 2.2, 2.3 | Wave 0 | 3 agents | S |
| **Wave 2** | 3.1, 3.2 | Wave 1 | 2 agents | S-M |
| **Critical path** | 1.1 → 2.1 → 3.1 | — | 3 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 3 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 8 / 3 = 2.67 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 8 / 8 = 1.0 |
| CP | same-file overlaps per wave | 0 | 0 |

Parallelization score: **A**. Contract design, lifecycle mechanics, and docs/
verification work are split so `/pll` can run parallel lanes without same-file
contention.

## Tasks

#### Task 1.1: [contract] Freeze the structured blueprint authoring contract

**Status:** todo
**Wave:** 0
**Depends:** None
**Files:**
- Modify: `blueprints/draft/replace-markdown-first-blueprint-authoring-with-a-structured-wp-mcp-surface/_overview.md`
- Modify: `src/mcp/tools` contract docs or tests as needed

Define the v1 source-of-truth contract: AST/structured input is authoritative;
`_overview.md` is a rendered artifact; no raw markdown write helper is part of
the canonical MCP surface.

**Steps (TDD):**
1. Write failing contract assertions or doc tests for the intended tool surface.
2. Verify current assumptions are captured as failing expectations.
3. Update the contract docs/tests to encode the chosen surface.
4. Re-run the targeted checks until they pass.

**Acceptance:**
- [ ] V1 contract is explicit about AST-as-source-of-truth.
- [ ] Markdown is documented as projection, not control plane.
- [ ] No raw markdown helper is part of the canonical API contract.

#### Task 1.2: [api] Add `wp_blueprint_put` whole-document authoring

**Status:** todo
**Wave:** 0
**Depends:** None
**Files:**
- Create: `src/mcp/tools/blueprint-put.ts`
- Create: `src/mcp/tools/blueprint-put.test.ts`
- Modify: shared blueprint render/ingest modules as needed

Implement the canonical structured whole-document write API that accepts a
blueprint object, renders markdown, validates structure, syncs the projection,
and returns structured metadata including a blueprint-scoped revision token.

**Steps (TDD):**
1. Add failing tests for valid whole-document upsert, schema rejection, and rendered markdown output.
2. Run the targeted tool tests — verify FAIL.
3. Implement the minimal put flow and structured return shape.
4. Re-run the targeted tests — verify PASS.
5. Run lint/typecheck for changed files.

**Acceptance:**
- [ ] `wp_blueprint_put` can create or replace a blueprint deterministically.
- [ ] The tool returns structured metadata including revision/state info.
- [ ] Render + validate + ingest happen in one controlled path.

#### Task 1.3: [lifecycle] Add `wp_blueprint_transition` with optimistic concurrency

**Status:** todo
**Wave:** 0
**Depends:** None
**Files:**
- Create: `src/mcp/tools/blueprint-transition.ts`
- Create: `src/mcp/tools/blueprint-transition.test.ts`
- Modify: lifecycle/ingest glue as needed

Implement an atomic transition tool that revalidates the latest blueprint
revision, checks an expected blueprint-scoped revision token, replaces the
current timestamp-driven freshness gate, and then performs state changes such as
`draft -> planned` or `planned -> in-progress`.

**Steps (TDD):**
1. Add failing tests for successful transition, stale-version conflict, and invalid-structure refusal.
2. Run the targeted lifecycle tests — verify FAIL.
3. Implement the transition path with expected-version checks.
4. Re-run the targeted tests — verify PASS.
5. Run lint/typecheck for changed files.

**Acceptance:**
- [ ] Lifecycle transitions are atomic with validation and version checking.
- [ ] Stale writes fail cleanly with structured conflict information.
- [ ] Promote/finalize flows stop depending on validate timestamps or out-of-band markdown timing.

#### Task 2.1: [integration] Rewire existing blueprint flows around put/transition

**Status:** todo
**Wave:** 1
**Depends:** Task 1.2, Task 1.3
**Files:**
- Modify: existing blueprint create/promote/finalize tool implementations as needed
- Modify: existing blueprint lifecycle tests as needed

Refactor the current MCP surface so create/promote/finalize operations route
through the new deterministic authoring/lifecycle primitives instead of
parallel ad hoc file-state paths.

**Steps (TDD):**
1. Add failing integration tests that cover create -> author -> validate -> transition without direct file editing.
2. Run the targeted integration tests — verify FAIL.
3. Rewire the existing flows to reuse put/transition.
4. Re-run the same tests — verify PASS.
5. Run lint/typecheck for changed files.

**Acceptance:**
- [ ] Existing lifecycle flows compose through the new primitives.
- [ ] The MCP surface no longer requires direct markdown editing for normal authoring.
- [ ] No duplicate render/ingest/transition logic remains.

#### Task 2.2: [patch] Define the deferred semantic patch compatibility boundary

**Status:** todo
**Wave:** 1
**Depends:** Task 1.2
**Files:**
- Modify: docs/specs as needed

Define the follow-on contract for a future semantic patch tool with domain
operations such as `add_task`, `update_task`, `set_summary`, and
`replace_decision`, but do not implement it in v1. The goal is to keep the
whole-document authoring path small and deterministic while preserving a clean
expansion path.

**Steps (TDD):**
1. Add a design contract or docs check for the minimum future semantic patch operations.
2. Verify that v1 whole-document upsert covers current required authoring flows.
3. Record the explicit deferral and compatibility boundary.
4. Re-run targeted docs/contract checks.

**Acceptance:**
- [ ] The deferred patch model is semantic, not raw markdown mutation.
- [ ] V1 stays limited to `put + transition`.
- [ ] The deferral and rationale are explicit in docs/specs.

#### Task 2.3: [ui] Specify MCP Apps-backed blueprint editor as a follow-on surface

**Status:** todo
**Wave:** 1
**Depends:** Task 1.2, Task 1.3
**Files:**
- Modify: docs / design notes for the blueprint tool surface
- Create: UI resource notes or stubs only if needed

Define the v2 editor shape: an inline MCP App form/editor layered on top of the
structured authoring APIs, with graceful fallback when hosts do not support MCP
Apps.

**Steps (TDD):**
1. Add a design/test note for UI capability detection and non-UI fallback behavior.
2. Verify the design does not require UI support for correctness.
3. Record the minimum API/UI contract for a future implementation.
4. Re-run targeted docs/design checks.

**Acceptance:**
- [ ] MCP Apps is positioned as an enhancement, not a prerequisite.
- [ ] Non-UI hosts still work correctly through structured tools alone.
- [ ] The future UI contract is precise enough to implement later.

#### Task 3.1: [verify] Add publish-safe package/documentation coverage

**Status:** todo
**Wave:** 2
**Depends:** Task 2.1, Task 2.2, Task 2.3
**Files:**
- Modify: `package.json` if new exports are needed
- Modify: README / MCP docs / release notes as needed
- Modify: tarball/package-surface tests as needed

Ensure the new MCP blueprint surface is documented and publish-safe.

**Steps (TDD):**
1. Add failing docs/package-surface assertions for any new public tool surfaces.
2. Run targeted package-surface and docs checks — verify FAIL.
3. Update docs/manifests/tests.
4. Re-run the same checks — verify PASS.
5. Run dry tarball inspection.

**Acceptance:**
- [ ] Public tool surfaces are documented intentionally.
- [ ] Tarball/package-surface checks pass.
- [ ] No private/internal-only blueprint artifacts leak into the publish surface.

#### Task 3.2: [proof] Add end-to-end authoring proof without direct markdown editing

**Status:** todo
**Wave:** 2
**Depends:** Task 2.1, Task 3.1
**Files:**
- Create: end-to-end integration test or fixture for blueprint authoring flow
- Modify: existing blueprint integration tests as needed

Prove that a blueprint can be authored, validated, and transitioned entirely
through structured MCP operations.

**Steps (TDD):**
1. Add a failing end-to-end test that performs create/put/transition without touching markdown directly.
2. Run the targeted integration test — verify FAIL.
3. Implement any missing glue.
4. Re-run the same test — verify PASS.
5. Run lint/typecheck for changed files.

**Acceptance:**
- [ ] End-to-end blueprint authoring works without direct markdown editing.
- [ ] Validation and lifecycle transitions are deterministic in the test flow.
- [ ] The new flow is strong enough to replace the current manual markdown authoring path.

## Refinement Summary

| Metric | Value |
| --- | --- |
| Findings total | 8 |
| Critical | 1 |
| High | 5 |
| Medium | 6 |
| Low | 0 |
| Fixes applied | 14/14 |
| Cross-plans updated | 0 (references added in this blueprint only) |
| Edge cases documented | 4 |
| Risks documented | 3 |
| **Parallelization score** | A |
| **Critical path** | 3 waves |
| **Max parallel agents** | 3 |
| **Total tasks** | 8 |
| **Blueprint compliant** | 8/8 |
