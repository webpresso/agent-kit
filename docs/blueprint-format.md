---
type: system
last_updated: "2026-07-01"
---

# Blueprint format specification

A blueprint is a folder at `blueprints/<state>/<slug>/_overview.md` (with
optional sibling docs such as `reviews.md`), or — for legacy compatibility — a
flat file `blueprints/<state>/<slug>.md`. Either shape carries mandatory YAML
frontmatter and a specific heading structure. This document is the authoritative
spec — the `blueprint-plan` docs-linter enforces these rules.

## File location

```
<repo-root>/blueprints/
├── draft/              # not yet executable
├── planned/            # ready to execute
├── in-progress/        # being executed
├── completed/          # all tasks done
├── archived/           # historical
└── parked/             # paused indefinitely
```

The folder shape is the default/canonical shape: each blueprint lives at
`blueprints/<state>/<slug>/_overview.md`, with sibling docs alongside — notably
`reviews.md` for the ≥2-approval promotion gate (see
`catalog/agent/rules/pre-implementation.md`), plus any research notes or data
fixtures as peer files. A flat `blueprints/<state>/<slug>.md` remains valid for
legacy or simple drafts that never need siblings.

When OMX or other runtimes materialize execution handoffs, keep that split
explicit:

- `blueprints/<state>/<slug>/_overview.md` is the default canonical plan (folder shape).
- `blueprints/<state>/<slug>.md` is the flat, legacy-compatible canonical plan.
- `.omx/state/` is runtime/session state only.
- `.omx/plans/` is derived handoff metadata only, never a second plan store.
- Completion authority stays with task-local canonical verification evidence in
  the blueprint; runtime progress or handoff files cannot mark work complete on
  their own.

## Frontmatter

```yaml
---
# Required
type: blueprint # "blueprint" or "parent-roadmap"
status: planned # state (see lifecycle.md)
complexity: M # XS | S | M | L | XL

# Typically required
created: 2026-04-22 # YYYY-MM-DD
last_updated: 2026-04-22 # YYYY-MM-DD
progress: "0% (0 of N tasks completed)" # human-readable string

# Optional — dependencies between blueprints
depends_on:
  - other-blueprint-slug
  - >-
    other-blueprint-slug (planned) — one-line context about the dependency

# Optional — cross-repo blueprint blockers
cross_repo_depends_on:
  - repo: webpresso/framework
    slug: public-secret-surface-hard-cut
    require_status: planned

# Optional — tags for filtering
tags:
  - infra
  - observability

# Required to promote past draft — ≥2 approvals from DISTINCT reviewers (the
# gate input; the in-body `## Approvals` checklist is a human-readable mirror).
# Enforced by `wp blueprint promote` + `wp audit blueprint-lifecycle`.
approvals:
  - reviewer: codex # enum: eng-review | codex | deepseek | mimo | glm | ceo-review
    verdict: approve
    commit: <sha-or-content-hash the review ran against>
    evidence: <repo: path / review record>
  - reviewer: deepseek
    verdict: approve
    commit: <sha-or-content-hash>
    evidence: <repo: path / review record>

# Optional — if blueprint is parked
parked_reason: >-
  One or two sentences explaining why it's paused and what unblocks resumption.

# Optional — set by `wp blueprint finalize`
completed_at: 2026-04-22

# Optional — execution hints
# execution_backend is omitted for package-core lifecycle; optional runtimes may set their adapter name
max_parallel_agents: 3
---
```

Full schema lives in `webpresso/blueprint` as a Zod schema
(`planFrontmatterSchema`). The CLI validates frontmatter on every
`wp blueprint audit` run.

## Blueprint vs parent-roadmap

`type: blueprint` is the executable unit: it owns tasks, acceptance checks,
implementation scope, and verification evidence.

`type: parent-roadmap` is the strategic grouping unit: it gives `/pll` and
operators a queue of child blueprints to choose from. Parent roadmaps should
not hide executable work inside themselves; they should point to child
blueprints in their execution-wave map and let each child own its detailed
task list.

```yaml
---
type: parent-roadmap
status: planned
complexity: M
created: 2026-05-06
last_updated: 2026-05-06
---
```

```markdown
## Quick Reference (Execution Waves)

| Wave   | Blueprints                        | Dependencies                     |
| ------ | --------------------------------- | -------------------------------- |
| Wave 0 | `agent-kit-public-release-scrub`  | None                             |
| Wave 1 | `ai-reliability-contract-roadmap` | `agent-kit-public-release-scrub` |
```

Child blueprints link back with `parent_roadmap:`:

```yaml
parent_roadmap: q2-platform-roadmap
```

## Local graph vs cross-repo graph

Use **local** roadmap/dependency keys for the **local repo graph only**:

- `parent_roadmap:` → local child → local parent-roadmap backlink
- `depends_on:` → local blueprint → local blueprint dependency

Use **cross-repo** references for everything outside the repo:

- `cross_repo_depends_on:` in frontmatter for real cross-repo blockers
- GitHub links in body sections such as `## Cross-Plan References`

### Enforced rules

1. `parent_roadmap:` must resolve to a roadmap in the **same repo**.
2. `depends_on:` must contain **local** blueprint references only.
3. `cross_repo_depends_on:` is the only supported frontmatter field for executable
   cross-repo dependencies.
4. Cross-repo references in body text must use **GitHub links**, not local filesystem
   paths such as `<local-absolute-path>/...` or `../other-repo/...`.
5. A parent-roadmap's `## Quick Reference (Execution Waves)` section is for **local
   auditable children only**. Do not list external blueprints there.
6. Public downstream examples must distinguish current CLI examples from durable
   public command ownership. Use canonical MCP tool names such as `wp_test`,
   `wp_ci_act`, and `wp_worker_tail` when naming agent tools. Treat `wp ...`
   command snippets as current-state examples; future unified public command
   ownership belongs to the `webpresso ...` CLI surface.

Canonical cross-repo dependency example:

```yaml
cross_repo_depends_on:
  - repo: ozby/ingest-lens
    slug: 2026-06-02-ingest-lens-wp-deploy-adapter-toolchain-isolation
    require_status: planned
```

Canonical documentary cross-plan link example:

```markdown
## Cross-Plan References

| Blueprint                                                                                                                                                                                                          | Relationship                             | Required alignment                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [ozby/ingest-lens: 2026-06-02-ingest-lens-wp-deploy-adapter-toolchain-isolation](https://github.com/ozby/ingest-lens/blob/main/blueprints/planned/2026-06-02-ingest-lens-wp-deploy-adapter-toolchain-isolation.md) | Downstream `wp`-first thin-consumer lane | Use shipped `wp deploy`, `wp ci act`, and canonical `wp_*` tool names; keep deploy specifics behind the local adapter seam.          |
| [ozby/edge-matte: 2026-06-02-edge-matte-wp-deploy-adapter-toolchain-isolation](https://github.com/ozby/edge-matte/blob/main/blueprints/planned/2026-06-02-edge-matte-wp-deploy-adapter-toolchain-isolation.md)     | Downstream split-consumer lane           | Preserve the `vp` + `wp` split and local deploy specifics; only remove direct tool ownership when the shared surface already exists. |
```

Validation and discovery surfaces:

- `wp blueprint new "<goal>" --complexity M --type parent-roadmap` scaffolds a roadmap stub.
- `wp blueprint list` shows `ROADMAP`, nested `CHILD`, and fallback `ORPHANS` rows.
- `wp roadmap list` lists only roadmap-layer entries.
- `wp roadmap show <slug>` shows a single parent-roadmap.
- `wp audit roadmap-links` checks bidirectional roadmap/child references; add `--strict` to fail unresolved orphan parents.

## Body structure

The body follows this outline. Sections in **bold** are required for
executable blueprints (`status: planned | in-progress | completed`);
others are conventional but not enforced.

```markdown
# <Short descriptive title>

## Product wedge anchor # required for infra-tier blueprints per blueprint-scoping rule

## Planning Summary

## Architecture Overview # optional

## Key Decisions # optional

## Quick Reference (Execution Waves) # optional summary of phase-1 ready work

## Fact-Check Summary # optional — table of verified claims

## Phases # REQUIRED

### Phase 1: <Name> [Complexity: <S|M|L>]

#### [lane] Task 1.1: <Name> # REQUIRED task block

- [ ] **Status:** todo | in-progress | blocked | done
- **Depends:** — | Task 1.2
- **Files:** …
- **Change:** …
- **Verify:** …
- **Acceptance:** …

#### [lane] Task 1.2: …

### Phase 2: …

## Verification Gates # optional — whole-plan gates

## Cross-Plan References # optional

## Edge Cases and Error Handling # optional

## Non-goals # strongly recommended

## Risks # optional

## Technology Choices # optional
```

## Public wording and command names

Blueprints that affect downstream adopters must keep command ownership
explicit:

- Use `wp_*` names for MCP tools, for example `wp_test`, `wp_ci_act`, and
  `wp_worker_tail`.
- Treat `wp ...` CLI examples as current-state or migration examples unless the
  blueprint explicitly owns durable public CLI branding.
- Do not introduce legacy AK-prefixed aliases as replacement tool names.
- For secret-gated local execution, describe the public shell contract as
  `wp secrets run --sink <sink> --profile <profile> -- <cmd>` and downstream CI adoption through shared `wp ci act`.
- Public cross-plan references must use GitHub URLs and must not include local
  absolute paths, sibling-repo filesystem paths, or private historical context
  that is unrelated to the public plan.

## Task block rules (enforced)

The docs-linter flags any of:

1. **Wrong heading level.** Task headings MUST use `####` (four hashes).
   Three hashes (`###`) is phase-level; tasks nested under phases use four.

2. **Malformed task ID.** Task IDs MUST match `<digit>(\.<digit>)+([a-z])?`.
   Examples:
   - ✅ `1.1`, `2.3`, `10.4b`, `1.2.1`
   - ❌ `one-point-one`, `A.B`, `task1`

3. **Bare dependency reference.** Use `Task X.Y`, not bare `X.Y`:
   - ✅ `**Depends:** Task 1.2, Task 3.4`
   - ❌ `**Depends:** 1.2, 3.4`

4. **Non-canonical task status.** Executable blueprints use only these
   statuses: `todo`, `in-progress`, `blocked`, `done`. No `wip`, `pending`,
   `tbd`, etc.

5. **Missing `**Status:**`.** Every executable task must have an explicit
   status line.

6. **Non-canonical blueprint status.** Executable blueprints must use:
   `draft`, `planned`, `in-progress`, `completed`, `archived`, `parked`.
   No synonyms.

## Lane markers

The `[lane]` prefix on task titles (`#### [frontend] Task 1.1: ...`,
`#### [backend] Task 1.2: ...`) is a soft convention used by parallel
execution tooling (`/pll`) to group independent tasks into worktrees.
Lane names are free-form strings (`frontend`, `backend`, `migration`,
`cleanup`, etc.) — the `/pll` adapter uses them to partition work
across worktrees.

Tasks without a `[lane]` marker are treated as unlabeled — fine for
blueprints that don't need parallel execution.

## Acceptance criteria syntax

```markdown
- **Acceptance:** all of the following:
  - [ ] `vp run test` is green for `<pkg>`
  - [ ] `vp run e2e` green
  - [ ] Manual smoke: `<verb>` produces `<observable>`
```

The `blueprint-plan` validator counts checkbox-style criteria and
reports progress (`3/5 acceptance checks ticked`). Free-form acceptance
prose is allowed but doesn't count toward the ratio.

## Parser + public API

For programmatic access:

```typescript
import {
  parseBlueprint,
  serializeBlueprint,
  type Blueprint,
  type Task,
  type Phase,
  planFrontmatterSchema,
} from "webpresso/blueprint";

const parsed = parseBlueprint(await readFile(blueprintPath, "utf-8"));
// parsed: { frontmatter, tasks, phases, acceptanceCriteria, ... }
```

For lifecycle transitions:

```typescript
import { applyBlueprintLifecycle, applyBlueprintLifecycleToFile } from "webpresso/blueprint/local";

await applyBlueprintLifecycleToFile(projectRoot, "planned/my-blueprint", { type: "start" });
// Updates frontmatter status and task[0].status; rewrites the file.
```

See `src/blueprint/lifecycle/engine.ts` for the full intent vocabulary
(`start`, `park`, `finalize`, `task_start`, `task_block`, `task_unblock`,
`task_complete`).

## Dependency graph

A blueprint's task dependencies are parsed from the `**Depends:**`
lines into a directed acyclic graph and persisted to the SQLite
projection. The `wp_blueprint_depgraph` MCP tool returns that graph as
structured `nodes` + `edges` (including cross-repo edges). `wp blueprint
exec <slug>` hands the blueprint to a runtime backend (for example the
OMX `/pll` adapter), which walks the dependencies to run independent
tasks in parallel — execution is delegated to that adapter, not the
package core.

## Trust Dossier

Executable blueprints (`planned`, `in-progress`, `completed`) require a `## Trust Dossier` with these subsections: Readiness Verdict, Material Claims, Material Decisions, Promotion Gates, and Residual Unknowns. Trust Dossier evidence is separate from task completion evidence. Material claim evidence supports `repo:<path>`, `web:<url> (<YYYY-MM-DD>)`, and `derived:<claim-id>[,<claim-id>]`. Task dependencies use `**Depends:**`. Residual Unknowns must be exactly `None.`.

Use `wp_blueprint_put` / `wp blueprint put` when rewriting a whole blueprint so
the parser can preserve the canonical folder/flat shape and render the Trust
Dossier consistently. Do not hand-maintain a generated README index for blueprint
discovery; folder `_overview.md` files and the SQLite/MCP projection are the
authoritative surfaces.
