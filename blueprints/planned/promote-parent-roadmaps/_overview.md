---
type: blueprint
status: planned
complexity: M
created: '2026-04-25'
last_updated: '2026-05-06'
progress: '0% (planned — refined into executable CLI, audit, dispatcher, and docs tasks)'
depends_on: []
tags:
  - agent-kit
  - cli
  - blueprint-hierarchy
  - dx
  - pll
parent_roadmap: 'cross-repo: webpresso/monorepo → webpresso/blueprints/completed/webpresso-public-extraction-roadmap'
---

# Promote Parent Roadmaps to First-Class

**Goal:** Stop hiding `type: parent-roadmap` blueprints from `ak blueprint list`. Make the parent → child → `/pll` lane dispatch chain explicit and audited, so a single `ak blueprint list` invocation gives both strategic context (which roadmaps are active) and tactical options (which child lanes are pickable).

## Why

Today, `BlueprintService.ts:86` silently filters `type: parent-roadmap` from `ak blueprint list`. A user who creates a parent-roadmap, runs `list`, and sees nothing assumes their file is broken. A `/pll` dispatcher running `list` to pick a lane gets orphaned children with no strategic anchor. The "they have no meaningful progress stat" excuse is wrong — a roadmap's progress is the rollup of its children, which is more informative than any single child's number.

Roadmaps are the natural source of "what should the next parallel lane do?" — hiding them severs that loop.

## Scope

### CLI changes

- **`ak blueprint list`** — show parent-roadmaps **at the top**, with a `ROADMAP` glyph and rollup stats: `children=N done=N in-progress=N planned=N draft=N`. Render each roadmap's children as an indented tree underneath.
- **Orphan detection** — blueprints without a `parent_roadmap:` field are listed in a separate "orphan" group at the bottom.
- **Breadcrumb in child rows** — when a child blueprint declares `parent_roadmap:`, show the parent slug as a breadcrumb in its row.
- **`ak roadmap list`** — alias of `ak blueprint list --only roadmaps`, returns just the parent-roadmap layer.
- **`ak roadmap show <slug>`** — drills into one roadmap: full `_overview.md` summary, child status table, `depends_on:` graph, blocker callouts.
- **`ak blueprint new --type parent-roadmap`** — scaffolder support so authors don't have to hand-edit frontmatter (closes the doc gap from the prior audit).

### Audit additions

- **`ak audit roadmap-links`** — bidirectional integrity check:
  - Every child claiming `parent_roadmap: X` is listed in X's wave map.
  - Every entry in X's wave map points at an actual blueprint that exists and has `parent_roadmap: X`.
  - Roadmaps with zero children get flagged.
  - Orphan children get flagged (configurable: warn vs fail).

### `/pll` dispatcher integration

- `/pll` lane-picking heuristic reads from active parent-roadmaps first: "next planned child of an in-progress roadmap, respecting `depends_on:`."
- Fallback to orphan blueprints only when no parent-roadmap has actionable children.
- Document this in agent-kit skills so the heuristic is discoverable.

### Documentation

- README section: "Parent roadmaps vs blueprints" — when to use each, with a worked example.
- `ak blueprint --help` and `ak blueprint new --help` list allowed `type:` values.
- `ak roadmap --help` documents the new sub-commands.
- Update `docs/blueprint-format.md` to elevate the type distinction from a single-line aside to a full subsection.

## Out of scope

- Rules fan-out / MCP / AGENTS.md parity (lives in `planned/agent-kit-parity-pass`)
- Quality-engine absorption (lives in `planned/agent-kit-parity-pass`)
- Roadmap-of-roadmaps / nested hierarchies — flat parent → child for now

## Verification Gates

- `ak blueprint list draft` shows `webpresso-public-extraction-roadmap` and `go-live-readiness-orchestrator` as `ROADMAP` entries with rollup stats.
- `ak roadmap show webpresso-public-extraction-roadmap` lists every child blueprint with current status.
- `ak audit roadmap-links` exits zero on the current monorepo state, non-zero when a seeded mismatch is introduced (e.g. delete a child but leave the wave-map row).
- `ak blueprint new --type parent-roadmap test-rm` produces a valid roadmap stub that round-trips through `list`.
- README + `--help` outputs explicitly mention `parent-roadmap`.

## Planning decision

Scope is now locked for a first implementation pass: ship the roadmap read-model and CLI first, add the audit on top of the same parser, then wire `/pll`/documentation after the command output is stable. Orphan handling is warning-first in this blueprint; failing policy remains configurable and can harden later.

## Tasks (Blueprint format)

#### [agent-kit] Task 1.1: Roadmap parsing and rollup model

**Status:** todo

**Depends:** None

Build the shared read-model that exposes parent-roadmaps, children, orphan children, and child status rollups without changing CLI output yet.

**Files:**

- Modify: `src/blueprint/parser.ts`
- Modify: `src/blueprint/schema.ts`
- Modify: `src/blueprint/types.ts`
- Create/modify: `src/blueprint/roadmap.test.ts`

**Steps (TDD):**

1. Add fixtures with one `type: parent-roadmap`, three children, and one orphan.
2. Assert rollups: `children=N done=N in-progress=N planned=N draft=N`.
3. Assert children can resolve `parent_roadmap:` by slug and cross-repo label without crashing.
4. Implement the read-model using existing blueprint parse utilities.
5. Run: `ak test --file src/blueprint/roadmap.test.ts`.

**Acceptance:**

- [ ] Parent-roadmap files are parsed, not filtered out of the internal model.
- [ ] Rollup counts match child lifecycle state.
- [ ] Orphans are detected but do not fail parsing.

#### [agent-kit] Task 1.2: `ak blueprint list` roadmap display

**Status:** todo

**Depends:** Task 1.1

Expose the roadmap model in the existing list command.

**Files:**

- Modify: `src/cli/commands/blueprint/list.ts`
- Modify: `src/cli/commands/blueprint/list.test.ts`

**Steps (TDD):**

1. Add failing snapshots for roadmap rows, indented children, breadcrumbs, and orphan grouping.
2. Implement `ROADMAP` rows at the top with rollup stats.
3. Keep non-roadmap list behavior stable when no roadmaps exist.
4. Run: `ak test --file src/cli/commands/blueprint/list.test.ts`.

**Acceptance:**

- [ ] `ak blueprint list` shows parent-roadmaps before child/orphan groups.
- [ ] Child rows include parent breadcrumb when `parent_roadmap:` exists.
- [ ] Orphan group appears only when needed.

#### [agent-kit] Task 2.1: `ak roadmap` command surface

**Status:** todo

**Depends:** Task 1.1

Add explicit roadmap commands backed by the same read-model.

**Files:**

- Create: `src/cli/commands/roadmap/index.ts`
- Create: `src/cli/commands/roadmap/index.test.ts`
- Modify: `src/cli/cli.ts`

**Steps (TDD):**

1. Test `ak roadmap list` as `ak blueprint list --only roadmaps`.
2. Test `ak roadmap show <slug>` with summary, child status table, dependency graph, and blocker callouts.
3. Register the command in the CLI.
4. Run: `ak test --file src/cli/commands/roadmap/index.test.ts`.

**Acceptance:**

- [ ] `ak roadmap list` returns only roadmap-layer entries.
- [ ] `ak roadmap show <slug>` reports children and blockers.
- [ ] Missing roadmap slug exits non-zero with a clear message.

#### [agent-kit] Task 2.2: `ak blueprint new --type parent-roadmap`

**Status:** todo

**Depends:** Task 1.1

Make roadmap creation first-class.

**Files:**

- Modify: `src/cli/commands/blueprint/new.ts`
- Modify: `src/cli/commands/blueprint/new.test.ts`
- Modify: `docs/templates/blueprint.md` or the active blueprint template source

**Steps (TDD):**

1. Add a failing test for `ak blueprint new --type parent-roadmap test-rm`.
2. Assert generated frontmatter uses `type: parent-roadmap` and round-trips through list/show.
3. Update help text to list allowed `type:` values.
4. Run: `ak test --file src/cli/commands/blueprint/new.test.ts`.

**Acceptance:**

- [ ] New roadmap stub is valid.
- [ ] Stub appears in `ak roadmap list`.
- [ ] Help output names `parent-roadmap`.

#### [agent-kit] Task 3.1: `ak audit roadmap-links`

**Status:** todo

**Depends:** Tasks 1.1, 2.1

Add bidirectional integrity checks for roadmap/child links.

**Files:**

- Create: `src/audit/roadmap-links.ts`
- Create: `src/audit/roadmap-links.test.ts`
- Modify: `src/cli/audit.ts`

**Steps (TDD):**

1. Add fixtures for clean links, missing child, wrong parent, zero-child roadmap, and orphan child.
2. Implement warning/failure result types using existing audit conventions.
3. Register `ak audit roadmap-links`.
4. Run: `ak test --file src/audit/roadmap-links.test.ts`.

**Acceptance:**

- [ ] Current repo exits zero.
- [ ] Seeded mismatch exits non-zero.
- [ ] Orphan policy is configurable: warn by default, fail when requested.

#### [agent-kit] Task 4.1: `/pll` routing docs and command-output contract

**Status:** todo

**Depends:** Tasks 1.2, 2.1

Teach the planning/lane-picking surface to prefer active roadmap children.

**Files:**

- Modify: `.agent/skills/pll/SKILL.md` or active catalog source for `/pll`
- Modify: `catalog/agent/skills/pll/SKILL.md` if catalog owns the skill
- Run: `ak symlink sync`

**Steps (TDD):**

1. Document heuristic: next planned child of an active roadmap, respecting `depends_on:`.
2. Document fallback to orphan blueprints only when no roadmap child is actionable.
3. Sync catalog-derived surfaces.
4. Run: `ak audit catalog-drift`.

**Acceptance:**

- [ ] `/pll` guidance matches `ak blueprint list` output shape.
- [ ] Catalog drift audit is clean.

#### [agent-kit] Task 4.2: User documentation and final verification

**Status:** todo

**Depends:** Tasks 2.2, 3.1, 4.1

Update docs/help and run the end-to-end gates.

**Files:**

- Modify: `README.md`
- Modify: `docs/blueprint-format.md`
- Modify: CLI help tests for `blueprint` and `roadmap`

**Steps (TDD):**

1. Add README section: "Parent roadmaps vs blueprints."
2. Expand `docs/blueprint-format.md` with type semantics and a worked example.
3. Verify help output mentions `parent-roadmap` and `ak roadmap`.
4. Run: `ak test --file <changed tests>`.
5. Run: `ak audit blueprint-lifecycle` and `ak audit roadmap-links`.

**Acceptance:**

- [ ] README + help outputs explicitly mention `parent-roadmap`.
- [ ] `ak blueprint new --type parent-roadmap test-rm` round-trips through list.
- [ ] All Verification Gates pass.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| --- | --- | --- | --- | --- |
| Wave 0 | 1.1 | None | no | M |
| Wave 1 | 1.2, 2.1, 2.2 | Task 1.1 | yes | S-M |
| Wave 2 | 3.1, 4.1 | Tasks 1.2/2.1 | yes | S-M |
| Wave 3 | 4.2 | Tasks 2.2, 3.1, 4.1 | no | S |

Critical path: 1.1 → 1.2/2.1 → 3.1 → 4.2.

## Related

- Parent: `completed/webpresso-public-extraction-roadmap/_overview.md`
- Sibling: `planned/agent-kit-parity-pass` (rules-fanout work, kept separate)
- Triggered by: discoverability gap audit on 2026-04-25 — `ak blueprint list` silently dropped a legitimate parent-roadmap
- Source-of-bug: `webpresso/agent-kit/src/blueprint/service/BlueprintService.ts:86-94`
