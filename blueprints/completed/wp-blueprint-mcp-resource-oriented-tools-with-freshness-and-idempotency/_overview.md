---
type: blueprint
title: "WP Blueprint MCP resource-oriented tools with freshness and idempotency"
status: completed
complexity: M
owner: "agent"
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
created: "2026-05-22"
last_updated: "2026-05-22"
progress: "100% (8/8 tasks done)"
depends_on:
  - consolidate-all-webpresso-agent-sub-packages-into-webpresso-itself-with-subpath-exports-consumers-go-from-6-8-pinned-devdeps-down-to-one-webpresso
tags:
  - blueprint
  - mcp
  - wp-tools
  - dx
---

# WP Blueprint MCP resource-oriented tools with freshness and idempotency

## Product wedge anchor

- **Stage outcome:** Webpresso agents use concise, typed, resource-oriented MCP
  tools for blueprint discovery, reading, mutation, and verification.
- **Consuming surface:** Codex/Claude/OpenCode MCP clients calling `wp_*` tools.
- **New user-visible capability:** Agents can operate blueprints through stable
  `wp_blueprint_*` tools with explicit project identity, freshness checks, and
  retry-safe mutations.

## Summary

Replace stale `ak_blueprint_*` guidance with the current `wp_*` public contract,
keep any needed `ak_*` behavior as explicit legacy compatibility only, and harden
the split blueprint MCP surface around standard list/get/create semantics,
custom task-state methods, explicit freshness, and mutation idempotency.

This blueprint is intentionally implementation-and-docs coupled: no doc may
describe a tool name, field, or workflow that is not registered and covered by a
drift test.

## Fact-checked context

- The stale nested worktree docs were backed up in stash
  `backup stale blueprint MCP docs before ralplan sync 2026-05-22` and the
  worktree was reset to `main` at `91764e2`.
- Current working-tree direction is `wp_*`, not `ak_*`: targeted inspection of
  the primary `main` worktree found `wp_test`, `wp_lint`, `wp_typecheck`,
  `wp_qa`, `wp_audit`, and `wp_blueprint_*` names in the MCP implementation and
  dev-routing surfaces.
- Current projection limitation: a manually added, still-untracked blueprint
  file does not appear in `wp_blueprint_list` yet. The projection freshness
  logic is HEAD-pinned, so untracked markdown alone does not force re-ingest;
  explicit create/re-ingest flow or a tracked HEAD change is needed before DB-
  backed task operations can see the blueprint.
- Confirmed re-ingest paths:
  - `wp_blueprint_create` calls `reIngest(cwd)` immediately after writing the
    markdown file.
  - `registerBlueprintTools(...)` calls `coldStartIfNeeded(cwd)` and then
    `reIngest(cwd)` whenever the DB already exists, so a fresh MCP server start
    should pick up newly added tracked markdown.
- Live-session evidence: in the current MCP session, `wp_blueprint_list` still
  returns only the two pre-existing planned blueprints while this new manually
  added planned blueprint validates on disk. That confirms the operator needs a
  re-ingest path or fresh server registration before DB-backed task flows can
  target this blueprint.
- Integration evidence: `src/mcp/blueprint-workflow.integration.test.ts`
  passes on current `main`, strengthening confidence that the blueprint MCP
  workflow and registration path are healthy even though this specific manually
  added blueprint has not yet been ingested into the live projection.
- Registration-path evidence: `src/mcp/blueprint-server.test.ts` includes a
  `wp_blueprint_list` status-filter test that writes blueprint markdown before
  `registerBlueprintTools(...)` runs, then confirms the blueprint appears in the
  projection-backed list result. That is the strongest current proof that a
  fresh registration/re-ingest path is the correct unblock for manually added
  tracked blueprints.
- Existing consolidation blueprint guidance says MCP tool names remain `wp_*`;
  this plan treats `ak_*` as obsolete public naming unless intentionally exposed
  through a documented compatibility alias.
- External evidence:
  - [MCP Tools spec](https://modelcontextprotocol.io/specification/draft/server/tools)
    establishes named tools, `inputSchema`, optional `outputSchema`,
    `structuredContent`, deterministic tool lists, and explicit state handles
    instead of implicit per-connection state.
  - [Google AIP-136](https://google.aip.dev/136) recommends standard methods
    where they fit and custom methods only where standard semantics do not.
  - [Google AIP-154](https://google.aip.dev/154) supports freshness validation
    with resource checksums/etags before state-changing actions.
  - [Google AIP-155](https://google.aip.dev/155) supports client-supplied
    `request_id` values for de-duplication, retry safety, and auditability.
  - [Stripe idempotency docs](https://docs.stripe.com/api/idempotent_requests)
    reinforce that mutating requests should be safely retryable without double
    creation or duplicate updates.

## RALPLAN-DR consensus summary

### Principles

1. **Public names are `wp_*`.** Do not add new `ak_*` user-facing docs,
   prompts, or routing rules.
2. **Docs are generated-or-guarded.** A drift test must fail when docs mention a
   tool or field that the implementation does not expose.
3. **Standard methods first.** Use list/get/create for resource-shaped
   operations; reserve custom verbs for state transitions and verification.
4. **Explicit state beats ambient state.** Pass `project_id`, `slug`, task id,
   freshness token, and `request_id` explicitly.
5. **Markdown remains canonical.** SQLite is a derived projection; mutations
   write markdown and refresh the projection.

### Decision drivers

1. **Agent reliability:** LLMs need stable, discoverable, typed tool names and
   compact structured outputs.
2. **Brownfield safety:** Existing users and tests may still depend on legacy
   behavior; migration must be observable and reversible.
3. **Concurrency correctness:** Multi-agent worktree use needs freshness checks,
   idempotent mutation handling, and no stale task-status writes.

### Viable options considered

| Option                                                                           | Pros                                                | Cons                                                 | Verdict  |
| -------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | -------- |
| A. Big-bang rename all `ak_*` to `wp_*` and delete legacy names                  | Cleanest final surface                              | Breaks hidden consumers and makes rollback harder    | Rejected |
| B. `wp_*` canonical surface with documented legacy aliases and deprecation tests | Best DX, safest migration, supports gradual cleanup | Slightly larger tool registry during transition      | Chosen   |
| C. Docs-only rename                                                              | Fast                                                | Leaves implementation drift and user-facing breakage | Rejected |

### Architect review

Approved with three constraints: keep resource-oriented split tools, do not
hide stale reads as fresh, and make alias/deprecation behavior explicit in tests
and docs. A compatibility layer is acceptable only if the `wp_*` names are the
canonical registry, examples, prompts, and routing guidance.

### Critic review

Approved after adding non-negotiable verification gates for: no public `ak_*`
docs, exact registered-tool/doc parity, mutation `request_id`, freshness token
use on writes, and scoped `wp_test`/`wp_lint`/`wp_typecheck` evidence.

### Consensus result

**APPROVE.** Conservative resolution of the only review ambiguity: keep any
`ak_*` behavior out of canonical docs and prompts; if compatibility aliases are
needed, they must be legacy-labeled, test-covered, and scheduled for removal.

## ADR

### Decision

Implement `wp_blueprint_*` as the canonical blueprint MCP surface:

- Resource reads:
  - `wp_blueprint_projects`
  - `wp_blueprint_list`
  - `wp_blueprint_get`
  - `wp_blueprint_context`
- Resource creation:
  - `wp_blueprint_create`
- Task mutations:
  - `wp_blueprint_task_advance`
  - `wp_blueprint_task_verify`
- Existing advanced/legacy operations may remain only as documented compatibility
  aliases or maintainer tools, with explicit tests and deprecation wording.

### Drivers

- MCP tools are discovered by name; names must match current Webpresso `wp_*`
  routing.
- Resource-oriented split tools are easier for agents to select than a single
  action-dispatch facade.
- Mutations need retry safety and stale-write protection in multi-agent flows.

### Alternatives considered

- Keep the old `ak_blueprint_*` names and only update docs: rejected because it
  contradicts current `wp_*` routing and user-facing nomenclature.
- Add one generic `wp_blueprint` action tool: rejected because it weakens schema
  specificity and makes tool selection harder.
- Delete all legacy names immediately: rejected until consumer impact is known.

### Why chosen

The chosen design aligns MCP tool mechanics, resource-oriented API guidance,
Webpresso package naming, and multi-agent concurrency needs without forcing a
breaking migration before aliases and docs are ready.

### Consequences

- Tests must cover the tool registry and docs together.
- Mutating tools need idempotency storage or deterministic replay behavior.
- Docs must clearly distinguish canonical `wp_*` tools from legacy aliases.
- Some compatibility code may exist temporarily, but no new public docs should
  recommend `ak_*`.

### Follow-ups

- Remove legacy aliases after one release cycle or after explicit maintainer
  approval.
- Consider generating `commands/blueprint.md` tool tables from tool metadata.
- Add release notes and a Changeset if public tool names or behavior change.

## Scope

### In scope

- Blueprint MCP server tool names, schemas, and structured outputs.
- Blueprint command docs and architecture/cookbook docs.
- Routing and guard messages that mention direct test/lint/typecheck/qa/audit
  command alternatives.
- Drift tests that bind docs to the registered tool list.
- Freshness/idempotency behavior for blueprint mutations.

### Out of scope

- Publishing or deprecating packages.
- Replacing the blueprint SQLite schema wholesale.
- Editing generated `.agent/`, `.codex/`, `.claude/`, `.omx/`, or IDE surfaces
  directly.

## Tasks

### Phase 0: Baseline and sync safety [Complexity: XS]

#### Task 0.1: [repo] Record the synchronized baseline and stale-doc backup

**Status:** done

**Depends:** None

Capture the exact baseline before implementation so nobody revives stale `ak_*`
docs from the nested worktree by accident.

**Files:**

- Modify: this blueprint
- Read-only: nested stale worktree stash metadata

**Steps (TDD):**

1. Confirm target implementation worktree is based on current `main` or a branch
   created from current `main`.
2. Record the stale-doc stash identifier and HEAD in task notes.
3. Confirm no implementation starts from the stale uncommitted
   `commands/blueprint.md` / docs changes.

**Acceptance:**

- [x] Task notes identify the implementation worktree HEAD and any stashes used
      only as reference material.
- [x] No stale `ak_blueprint_*` docs are copied forward without `wp_*` rewrite.

**Notes:**

- Active implementation surface at execution start: primary worktree
  `main` at `91764e2` (`chore: version packages`).
- Stale nested worktree was hard-reset to `main` before planning/execution.
- Stale uncommitted docs were preserved only as reference in stash:
  `backup stale blueprint MCP docs before ralplan sync 2026-05-22`.
- This blueprint was authored from the synced `wp_*` direction and does not
  carry forward canonical `ak_blueprint_*` examples.

### Phase 1: Canonical tool registry [Complexity: M]

#### Task 1.1: [mcp] Make `wp_blueprint_*` the canonical registered names

**Status:** done

**Depends:** Task 0.1

Ensure the MCP registry exposes canonical `wp_blueprint_*` names and that any
legacy `ak_blueprint_*` support is implemented as an explicit compatibility
alias layer, not as the primary docs/examples path.

**Files:**

- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/mcp/blueprint-server.test.ts`
- Modify as needed: `src/mcp/server.ts`

**Steps (TDD):**

1. Add or update a registry test that expects every canonical
   `wp_blueprint_*` tool name and fails for missing names.
2. Add a compatibility test documenting which `ak_blueprint_*` aliases remain,
   if any, and what deprecation summary they return.
3. Update registration names and alias handling.
4. Run scoped `wp_test` for the MCP registry tests.

**Acceptance:**

- [x] Canonical tools are registered under `wp_blueprint_*`.
- [x] Any `ak_blueprint_*` alias is documented as legacy and covered by tests.
- [x] No implementation error summary tells users to call an `ak_*` tool when a
      `wp_*` equivalent exists.

#### Task 1.2: [mcp] Add precise input and output schemas for canonical tools

**Status:** done

**Depends:** Task 1.1

Make every canonical tool return predictable `structuredContent` and, where the
MCP SDK surface supports it, an `outputSchema`.

**Files:**

- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/mcp/blueprint-server.test.ts`

**Steps (TDD):**

1. Add tests that inspect tool metadata for `inputSchema` and structured result
   shape.
2. Define shared schema helpers for summary-first envelopes, blueprint summary,
   blueprint detail, task detail, freshness, and mutation result.
3. Return serialized JSON in text content for backwards compatibility while
   keeping `structuredContent` authoritative.
4. Run scoped `wp_test`.

**Acceptance:**

- [x] `wp_blueprint_projects`, `list`, `get`, `context`, `create`,
      `task_advance`, and `task_verify` have explicit input schemas.
- [x] Structured outputs are stable enough for docs examples and tests.
- [x] Tool list order is deterministic.

### Phase 2: Freshness and idempotency [Complexity: M]

#### Task 2.1: [mcp] Require freshness tokens on blueprint mutations

**Status:** done

**Depends:** Task 1.2

Prevent stale task-status writes by carrying a freshness token from read tools
into mutation tools.

**Files:**

- Modify: `src/blueprint/freshness.ts`
- Modify: `src/mcp/blueprint-server.ts`
- Modify: relevant tests under `src/blueprint/**` and `src/mcp/**`

**Steps (TDD):**

1. Add failing tests for stale `head_at_ingest` / etag-style mutation rejection.
2. Make `wp_blueprint_get` and `wp_blueprint_list` return a mutation-ready
   freshness token.
3. Make `wp_blueprint_task_advance`, `wp_blueprint_task_verify`, and
   `wp_blueprint_create` validate the token when provided or required by the
   target operation.
4. Return actionable `next_action` guidance that names `wp_blueprint_list` or
   the correct refresh tool.
5. Run scoped `wp_test`.

**Acceptance:**

- [x] Stale mutations fail before markdown is changed.
- [x] Fresh mutations succeed and refresh the SQLite projection.
- [x] Error payloads name only canonical `wp_*` tools.

#### Task 2.2: [mcp] Add `request_id` idempotency to mutating tools

**Status:** done

**Depends:** Task 2.1

Make retries safe for `create`, `task_advance`, and `task_verify`.

**Files:**

- Modify: `src/blueprint/db/migrations/run.ts`
- Modify: `src/mcp/blueprint-server.ts`
- Create or modify: idempotency tests under `src/mcp/**`

**Steps (TDD):**

1. Add failing tests for duplicate `request_id` with identical payload.
2. Add failing tests for duplicate `request_id` with different payload.
3. Persist a compact request ledger in the blueprint DB or another repo-local
   state surface consistent with existing state-root conventions.
4. Return the original result for exact duplicate retries and reject conflicting
   duplicates.
5. Run scoped `wp_test`.

**Acceptance:**

- [x] Exact retry of a mutating request is safe and idempotent.
- [x] Conflicting reuse of `request_id` fails with a clear error.
- [x] `request_id` docs specify UUID/random high-entropy guidance and warn
      against sensitive data.

### Phase 3: Docs, commands, and drift guards [Complexity: S]

#### Task 3.1: [docs] Rewrite blueprint command docs for `wp_*`

**Status:** done

**Depends:** Task 1.2

Update docs to describe current canonical tools and explicitly label aliases.

**Files:**

- Modify: `commands/blueprint.md`
- Modify: `docs/architecture.md`
- Modify: `docs/blueprint-db-cookbook.md`
- Modify as needed: `README.md`, `MIGRATION.md`, `docs/dev-surface-parity.md`

**Steps (TDD):**

1. Add a docs assertion that fails if canonical examples use `ak_blueprint_*`.
2. Update docs to use `wp_blueprint_*` names and current fields only.
3. Include a short legacy-alias note if aliases remain.
4. Run docs assertions and `wp_audit(kind="docs-frontmatter")`.

**Acceptance:**

- [x] Canonical docs and examples use `wp_blueprint_*`.
- [x] Every documented field exists in implementation tests.
- [x] Any `ak_*` mention is explicitly marked legacy/compatibility.

#### Task 3.2: [test] Add registered-tool/docs drift tests

**Status:** done

**Depends:** Task 3.1

Prevent the stale-doc failure mode from recurring.

**Files:**

- Create or modify: `src/mcp/blueprint-docs-drift.test.ts`
- Modify as needed: `src/mcp/blueprint-server.test.ts`

**Steps (TDD):**

1. Parse registered blueprint tool names from the server metadata.
2. Parse documented `wp_blueprint_*` names from command/docs surfaces.
3. Fail if docs mention unknown canonical tools.
4. Fail if docs omit required canonical tools.
5. Fail if docs contain non-legacy `ak_blueprint_*` examples.
6. Run scoped `wp_test`.

**Acceptance:**

- [x] Tests fail on the previously stashed stale docs.
- [x] Tests pass on updated `wp_*` docs.
- [x] Drift output cites file paths, not raw logs.

### Phase 4: Migration and verification [Complexity: S]

#### Task 4.1: [qa] Verify all affected surfaces through wp MCP gates

**Status:** done

**Depends:** Task 2.2, Task 3.2

Run narrow checks first, then broader repo gates.

**Files:**

- No source changes expected unless checks reveal defects.

**Steps (TDD):**

1. Run scoped `wp_test` for MCP and docs-drift tests.
2. Run `wp_typecheck`.
3. Run `wp_lint`.
4. Run `wp_qa` if the scoped gates are green.
5. Run `wp_audit` for blueprint/docs-related audits.

**Acceptance:**

- [x] Scoped tests pass.
- [x] `wp_typecheck` passes.
- [x] `wp_lint` passes.
- [x] `wp_qa` passes or any failure is unrelated and documented with evidence.
- [x] Blueprint/docs audits pass.

#### Task 4.2: [release] Add migration notes and Changeset if public behavior changed

**Status:** done

**Depends:** Task 4.1

Document the public `ak_*` to `wp_*` migration and create a Changeset only if
the implementation changes the published public surface.

**Files:**

- Modify as needed: `MIGRATION.md`
- Create as needed: `.changeset/<slug>.md`

**Steps (TDD):**

1. Determine whether aliases make this non-breaking or whether any public name
   is removed.
2. Add migration notes with old-to-new mapping.
3. Create a Changeset with the correct bump if package behavior changes.
4. Run `vp run changeset:status` only if a Changeset is created.

**Acceptance:**

- [x] Migration guidance names `wp_*` as canonical.
- [x] Changeset exists if and only if public package behavior changes.
- [x] No version fields or `v*` tags are manually changed.

## Verification gates

| Gate                  | Tool / command surface                 | Success criteria                                              |
| --------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Registry tests        | `wp_test` scoped to MCP registry tests | Canonical `wp_blueprint_*` names present; aliases intentional |
| Docs drift            | `wp_test` scoped to docs-drift tests   | Docs and implementation agree                                 |
| Type safety           | `wp_typecheck`                         | Zero diagnostics                                              |
| Lint                  | `wp_lint`                              | Zero violations                                               |
| QA                    | `wp_qa`                                | Full quality pass or documented unrelated failures            |
| Blueprint/docs audits | `wp_audit`                             | Blueprint lifecycle/docs checks pass                          |

## Available agent-types roster

- **Planner:** owns sequencing, task dependencies, and migration boundaries.
- **Architect:** owns MCP surface design, alias policy, freshness/idempotency
  architecture, and schema consistency.
- **Critic:** owns drift prevention, verification strength, and release-risk
  review.
- **Implementer:** owns code changes and TDD loop.
- **Docs:** owns command, architecture, cookbook, migration, and examples.
- **QA:** owns `wp_*` verification evidence and failure triage.

## Follow-up staffing guidance

- Recommended default: `$ultragoal` to execute this blueprint sequentially with
  durable evidence checkpoints.
- Parallel option: `$ultragoal` leader plus `$team` lanes:
  - Lane A: registry/schema implementation.
  - Lane B: freshness/idempotency implementation.
  - Lane C: docs and drift tests.
  - Lane D: verification and migration notes.
- `$ralph` fallback: use only if a single persistent owner is preferred for
  end-to-end rename/verification pressure.

## Team verification path

1. Each lane returns changed files, tests run, and evidence.
2. Lead runs scoped `wp_test` for all MCP/docs tests.
3. Lead runs `wp_typecheck`, `wp_lint`, and then `wp_qa`.
4. Lead updates this blueprint task statuses only with evidence.

## Goal-mode follow-up suggestions

- `$ultragoal` — default for durable implementation of this blueprint.
- `$team` — use with `$ultragoal` if parallelizing implementation lanes.
- `$autoresearch-goal` — not needed unless new MCP/API evidence conflicts.
- `$performance-goal` — not applicable; this is an API/DX correctness change.

## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                                                        |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/wp-blueprint-mcp-resource-oriented-tools-with-freshness-and-idempotency/\_overview.md |

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
