---
type: blueprint
status: draft
complexity: M
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "0% (drafted)"
depends_on: []
cross_repo_depends_on: []
tags:
  - blueprints
  - mcp
  - cli
  - guardrails
approvals: [] # ≥2 distinct reviewer approvals required before draft→planned (see ## Approvals)
---

# Structured blueprint creation guardrails

**Goal:** Future-proof blueprint creation so CLI/MCP-generated blueprints are structured by construction and cannot drift into taskless prose or placeholder-only artifacts.

## Planning Summary

- Goal input: `Structured blueprint creation guardrails`
- Complexity: `M`
- Draft slug: `structured-blueprint-creation-guardrails`
- Output path: `blueprints/draft/structured-blueprint-creation-guardrails.md`
- Generated command: `wp blueprint new "Structured blueprint creation guardrails" --complexity M`
- Validation scope: parser compliance before write; MCP and CLI creation surfaces share the same service.

## Architecture Overview

```text
CLI wp blueprint new ─┐
                      ├─ BlueprintCreationService ── parser validation ── draft markdown
MCP wp_blueprint_new ─┤
MCP wp_blueprint_create ┘
```

## Key Decisions

| Decision                     | Choice                                                                       | Rationale                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Single creation owner        | Route MCP scaffold/write through `BlueprintCreationService`                  | Prevents CLI/MCP template drift and makes the parser validation gate shared. |
| Keep completion gate         | Preserve existing zero-task completion rejection                             | Completion guard is correct; creation must also make the valid path obvious. |
| No hand-authored bypass docs | Update docs/tool descriptions to say creation uses structured service output | Agents should call CLI/MCP and not invent markdown skeletons.                |

## Quick Reference (Execution Waves)

| Wave              | Tasks   | Dependencies | Parallelizable |
| ----------------- | ------- | ------------ | -------------- |
| **Wave 0**        | 1.1     | None         | 1 agent        |
| **Wave 1**        | 1.2     | 1.1          | 1 agent        |
| **Wave 2**        | 1.3     | 1.2          | 1 agent        |
| **Critical path** | 1.1→1.3 | --           | 3 waves        |

## Approvals (≥2 required before promotion to `planned`)

Promotion `draft → planned` requires ≥2 provenance-backed approvals from distinct reviewers. This PR is a bounded repair requested by the maintainer; the blueprint remains tracked as the planning artifact for the diff and lifecycle audit.

### Phase 1: Structured creation hardening [Complexity: M]

#### Task 1.1: Add regression tests for MCP/CLI structured creation

**Status:** todo

**Depends:** None

Add failing coverage proving MCP creation/scaffold output is produced by the same structured creation path as the CLI: formal `#### Task` sections parse, target paths match the actual output shape, and placeholder/taskless creation cannot be returned as a successful blueprint.

**Files:**

- Modify: `src/blueprint/service/BlueprintCreationService.test.ts`
- Modify: `src/mcp/blueprint-server.test.ts`
- Modify: `src/mcp/blueprint-server.platform-first.scaffold-read.test.ts`

**Steps (TDD):**

1. Add expectations that `wp_blueprint_create` writes a parseable draft with formal tasks and the canonical planning sections.
2. Add expectations that `wp_blueprint_new` returns the same structured scaffold shape and target path semantics as `BlueprintCreationService`.
3. Add/update creation-service expectations around output path shape consistency.
4. Run the scoped tests and verify they fail against the current MCP-local template/flat-shape mismatch.

**Acceptance:**

- [ ] Failing tests prove MCP creation does not use the shared structured creation service today.
- [ ] Tests assert parser-visible tasks, not just raw substring placeholders.
- [ ] Tests cover both scaffold-only and write/re-ingest creation paths.

#### Task 1.2: Route every creation surface through BlueprintCreationService

**Status:** todo

**Depends:** Task 1.1

Update MCP `wp_blueprint_new` and `wp_blueprint_create` to compile/create through `BlueprintCreationService`, remove the MCP-local `BLUEPRINT_TEMPLATE`, and keep platform sync/idempotency behavior intact.

**Files:**

- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/mcp/blueprint-server.test.ts`
- Modify: `src/mcp/blueprint-server.platform-first.scaffold-read.test.ts`
- Modify: `src/mcp/blueprint-server.platform-timeouts.test.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/blueprint-db-cookbook.md`

**Steps (TDD):**

1. Import and use `BlueprintCreationService` for scaffold and create handlers.
2. Preserve `wp_blueprint_new` as read/scaffold-only while using `compileDraft` for markdown and target path.
3. Preserve `wp_blueprint_create` write/idempotency semantics while using `create` for validated writes and README index behavior.
4. Update descriptions/docs to state CLI/MCP share the creation service and parser validation.
5. Run the failing tests from Task 1.1 and verify PASS.

**Acceptance:**

- [ ] No MCP-local blueprint template remains.
- [ ] `wp_blueprint_new` and `wp_blueprint_create` return structured service-generated markdown/paths.
- [ ] Platform sync timeout and idempotency behavior remain covered.

#### Task 1.3: Verify lifecycle and quality gates

**Status:** todo

**Depends:** Task 1.2

Run focused tests plus repo-level gates that prove structured creation and lifecycle checks stay green.

**Files:**

- Modify: `blueprints/draft/structured-blueprint-creation-guardrails.md`

**Steps (TDD):**

1. Run targeted creation/MCP tests.
2. Run blueprint lifecycle audit.
3. Run typecheck, lint, and relevant full test subset if targeted gates pass.
4. Record verification evidence in this blueprint before PR update/merge.

**Acceptance:**

- [ ] Targeted tests pass.
- [ ] `vp run blueprints:check` passes.
- [ ] Typecheck/lint/test gates pass or any unrelated blocker is documented with evidence.

## Verification Gates

| Gate        | Command                                                                                                                                                                                                                         | Success Criteria       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Targeted    | `pnpm exec vitest run src/blueprint/service/BlueprintCreationService.test.ts src/mcp/blueprint-server.test.ts src/mcp/blueprint-server.platform-first.scaffold-read.test.ts src/mcp/blueprint-server.platform-timeouts.test.ts` | Creation tests pass    |
| Blueprints  | `vp run blueprints:check`                                                                                                                                                                                                       | Lifecycle audit passes |
| Type safety | `vp run typecheck`                                                                                                                                                                                                              | Zero errors            |
| Lint        | `vp run lint`                                                                                                                                                                                                                   | Zero violations        |
| Tests       | `vp run test`                                                                                                                                                                                                                   | All pass               |

## Cross-Plan References

| Type       | Blueprint                        | Relationship                                                                       |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| Upstream   | None                             |                                                                                    |
| Downstream | Consumer duplication upstreaming | Prevents future invalid consumer blueprint hand-authorship during cross-repo work. |

## Edge Cases and Error Handling

| Edge Case                                               | Risk                                          | Solution                                                     | Task    |
| ------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ | ------- |
| MCP create diverges from CLI template                   | Agents get inconsistent scaffolds             | Shared creation service                                      | 1.2     |
| Scaffold-only `wp_blueprint_new` should not write files | Platform event/read use case changes behavior | Use `compileDraft`, not `create`                             | 1.2     |
| Create idempotency with request IDs                     | Retries duplicate files                       | Keep replay ledger around service output                     | 1.2     |
| Zero-task completion                                    | Taskless prose reaches completed              | Existing completion/audit gates remain, creation emits tasks | 1.1/1.2 |

## Non-goals

- Redesigning blueprint approval policy.
- Rewriting historical blueprints.
- Removing legacy flat blueprint support in scanners/resolvers.

## Risks

| Risk                                                 | Impact                      | Mitigation                                                                |
| ---------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| MCP consumers depend on old scaffold text            | Minor prompt drift          | Preserve output envelope and improve structure; tests assert stable keys. |
| Service creation refreshes README index unexpectedly | MCP create behavior changes | Existing test covers preserving prose and index markers.                  |
| Platform sync event uses derived slug differently    | Remote/local mismatch       | Use service-derived slug for event payload and target path.               |

## Trust Dossier

Draft note: complete this dossier before promotion to planned.

### Readiness Verdict

- promotion-ready: false
- unresolved-count: 1
- verified-at: <ISO-8601 timestamp>
- verified-head: <full git commit SHA>
- trust-gate-version: v1

### Residual Unknowns

- Whether docs need a broader “never hand-author completed blueprints” guidance update after implementation.
