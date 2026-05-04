---
type: blueprint
status: draft
complexity: M
created: '2026-04-25'
last_updated: '2026-04-25'
progress: '0% (draft)'
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

## Why draft (not planned)

CLI ergonomics need a sketch + dogfooding pass before this is locked. Specifically: the orphan-handling rule and the `/pll` dispatcher heuristic both need at least one round of "does this feel right when you actually run it?" before committing to scope.

## Related

- Parent: `completed/webpresso-public-extraction-roadmap/_overview.md`
- Sibling: `planned/agent-kit-parity-pass` (rules-fanout work, kept separate)
- Triggered by: discoverability gap audit on 2026-04-25 — `ak blueprint list` silently dropped a legitimate parent-roadmap
- Source-of-bug: `webpresso/agent-kit/src/blueprint/service/BlueprintService.ts:86-94`
