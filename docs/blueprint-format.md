---
type: system
last_updated: '2026-04-25'
---

# Blueprint format specification

A blueprint is a single Markdown file at `blueprints/<state>/<slug>/_overview.md`
with mandatory YAML frontmatter and a specific heading structure. This
document is the authoritative spec — the `blueprint-plan` docs-linter
enforces these rules.

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

One directory per blueprint, with `_overview.md` as the canonical entry
point. Supporting files (research notes, data fixtures, etc.) can live
alongside as `research/*.md`, `data/*.json`, etc.

## Frontmatter

```yaml
---
# Required
type: blueprint                    # "blueprint" or "parent-roadmap"
status: planned                    # state (see lifecycle.md)
complexity: M                      # XS | S | M | L | XL

# Typically required
created: 2026-04-22                # YYYY-MM-DD
last_updated: 2026-04-22           # YYYY-MM-DD
progress: '0% (0 of N tasks completed)'   # human-readable string

# Optional — dependencies between blueprints
depends_on:
  - other-blueprint-slug
  - >-
    other-blueprint-slug (planned) — one-line context about the dependency

# Optional — tags for filtering
tags:
  - infra
  - observability

# Optional — if blueprint is parked
parked_reason: >-
  One or two sentences explaining why it's paused and what unblocks resumption.

# Optional — set by `ak blueprint finalize`
completed_at: 2026-04-22

# Optional — execution hints
# execution_backend is omitted for package-core lifecycle; optional runtimes may set their adapter name
max_parallel_agents: 3
---
```

Full schema lives in `@webpresso/agent-kit/blueprint` as a Zod schema
(`planFrontmatterSchema`). The CLI validates frontmatter on every
`ak blueprint audit` run.

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

| Wave | Blueprints | Dependencies |
| --- | --- | --- |
| Wave 0 | [api-hardening](../planned/api-hardening/_overview.md) | None |
| Wave 1 | [ui-polish](../planned/ui-polish/_overview.md) | api-hardening |
```

Child blueprints link back with `parent_roadmap:`:

```yaml
parent_roadmap: q2-platform-roadmap
```

Validation and discovery surfaces:

- `ak blueprint new "<goal>" --complexity M --type parent-roadmap` scaffolds a roadmap stub.
- `ak blueprint list` shows `ROADMAP`, nested `CHILD`, and fallback `ORPHANS` rows.
- `ak roadmap list` lists only roadmap-layer entries.
- `ak roadmap show <slug>` shows a single parent-roadmap.
- `ak audit roadmap-links` checks bidirectional roadmap/child references; add `--strict` to fail unresolved orphan parents.

## Body structure

The body follows this outline. Sections in **bold** are required for
executable blueprints (`status: planned | in-progress | completed`);
others are conventional but not enforced.

```markdown
# <Short descriptive title>

## Product wedge anchor            # required for infra-tier blueprints per blueprint-scoping rule
## Planning Summary
## Architecture Overview           # optional
## Key Decisions                   # optional
## Quick Reference (Execution Waves)   # optional summary of phase-1 ready work
## Fact-Check Summary              # optional — table of verified claims

## Phases                          # REQUIRED

### Phase 1: <Name> [Complexity: <S|M|L>]

#### [lane] Task 1.1: <Name>       # REQUIRED task block
- [ ] **Status:** todo | in_progress | blocked | done
- **Depends on:** — | Task 1.2
- **Files:** …
- **Change:** …
- **Verify:** …
- **Acceptance:** …

#### [lane] Task 1.2: …

### Phase 2: …

## Verification Gates              # optional — whole-plan gates
## Cross-Plan References           # optional
## Edge Cases and Error Handling   # optional
## Non-goals                       # strongly recommended
## Risks                           # optional
## Technology Choices              # optional
```

## Task block rules (enforced)

The docs-linter flags any of:

1. **Wrong heading level.** Task headings MUST use `####` (four hashes).
   Three hashes (`###`) is phase-level; tasks nested under phases use four.

2. **Malformed task ID.** Task IDs MUST match `<digit>(\.<digit>)+([a-z])?`.
   Examples:
   - ✅ `1.1`, `2.3`, `10.4b`, `1.2.1`
   - ❌ `one-point-one`, `A.B`, `task1`

3. **Bare dependency reference.** Use `Task X.Y`, not bare `X.Y`:
   - ✅ `**Depends on:** Task 1.2, Task 3.4`
   - ❌ `**Depends on:** 1.2, 3.4`

4. **Non-canonical task status.** Executable blueprints use only these
   statuses: `todo`, `in_progress`, `blocked`, `done`. No `wip`, `pending`,
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
`cleanup`, etc.) — the executor just uses them to partition the DAG.

Tasks without a `[lane]` marker are treated as unlabeled — fine for
blueprints that don't need parallel execution.

## Acceptance criteria syntax

```markdown
- **Acceptance:** all of the following:
  - [ ] `pnpm test` is green for `<pkg>`
  - [ ] `pnpm run e2e` green
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
} from '@webpresso/agent-kit/blueprint'

const parsed = parseBlueprint(await readFile(overviewPath, 'utf-8'))
// parsed: { frontmatter, tasks, phases, acceptanceCriteria, ... }
```

For lifecycle transitions:

```typescript
import {
  applyBlueprintLifecycle,
  applyBlueprintLifecycleToFile,
} from '@webpresso/agent-kit/blueprint/local'

await applyBlueprintLifecycleToFile(overviewPath, { type: 'start' })
// Updates frontmatter status and task[0].status; rewrites the file.
```

See `src/blueprint/lifecycle/engine.ts` for the full intent vocabulary
(`start`, `park`, `finalize`, `task_start`, `task_block`, `task_unblock`,
`task_complete`).

## DAG + graph

A blueprint's task graph is parsed from the `**Depends on:**` lines
into a directed acyclic graph. `ak blueprint graph <slug>` renders
that DAG as Mermaid, and the DAG executor (`ak blueprint exec <slug>`)
walks it respecting dependencies.

For details on the graph runtime, see `src/blueprint/dag/` source.
