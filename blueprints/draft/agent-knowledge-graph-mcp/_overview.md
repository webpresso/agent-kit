---
type: blueprint
title: Agent knowledge graph + MCP watcher (Kuzu + remark + chokidar)
status: draft
complexity: L
owner: ozby
created: 2026-05-11
depends_on:
  - agent-asset-compiler-multi-runtime
tags:
  - agent-kit
  - knowledge-graph
  - mcp
  - kuzu
  - drift-detection
lifecycle:
  state: draft
---

# Agent knowledge graph + MCP watcher

## Product wedge anchor

- **Stage outcome:** VISION.md north star ("One command, fully wired — every AI coding agent has the context, hooks, and guardrails it needs to work correctly") **only holds if the wiring stays correct over time**. Today there is no machine-checked relationship between `AGENTS.md` sections, skill descriptions, command refs, subagent invocations, hook entries, blueprint citations, and tech-debt items — drift accumulates silently (the 12 `q-*` files that triggered the original investigation are exactly this failure mode at the global scope). This blueprint adds a Kuzu-backed knowledge graph plus a watcher that ingests every change in `.agent/` and surfaces broken refs, size budgets, and structural inconsistency in real time — and exposes those queries to every connected agent runtime via the existing `ak_*` MCP surface.
- **Consuming surface:** New MCP tools under the `mcp__plugin_webpresso-agent-kit_agent-kit__ak_graph_*` namespace (`ak_graph_query`, `ak_graph_orphans`, `ak_graph_sizes`, `ak_graph_compact`, `ak_graph_provenance`), new CLI verbs `ak graph {build,query,watch,mcp,explore}`, two new audits (`ak audit graph-refs`, `ak audit graph-sizes`), and an `ak tech-debt new --from-graph <query>` integration that auto-files `h-NNN-*.md` items from KG findings.
- **New user-visible capability:** A developer can ask their agent runtime in plain English "which skills exceed Codex's 800-char description budget?" or "show me every `## Build` section across our memory layers that references a deleted skill" and get an exact, deterministic answer — *and* can run `ak graph compact AGENTS.md` to get a structured proposal for shrinking a memory file by collapsing redundant sections (with provenance: each compaction suggestion points to the duplicated source). Plus: when drift is detected, `ak tech-debt new --from-graph` files a properly-formatted `h-NNN-slug.md` so the maintenance burden is visible in the existing tech-debt lifecycle.

## Why this exists

The compiler blueprint (`agent-asset-compiler-multi-runtime`) gives us a canonical source (`.agent/`) and six deterministic compiles. What it does NOT give us:

- **Size visibility.** Each runtime has different listing budgets (Claude 1%-of-context default, Codex hard 8000-char cap, OpenCode no cap but skill description is the only model-visible attribute). The compiler emits per-skill — there's no aggregate view, no "you're at 87% of Codex's budget after this PR."
- **Reference validity.** A SKILL.md body that says "see also: `/qa-only`" works only if that command exists. A `## Conventions` section in AGENTS.md that says "follow the rules in `.agent/rules/no-timeout-as-fix.md`" works only if that file exists. Today: nobody checks.
- **Cross-asset relationships.** A subagent references skills; skills reference commands; commands reference rules; rules cite blueprints; blueprints close on tech-debt items. The graph is real but invisible — and so is its drift.
- **Compaction discovery.** AGENTS.md files grow. Sections get duplicated across user-global / project / per-directory layers (or just inside a single file). The merger from the compiler blueprint deduplicates section names, but not redundant content within a section. A KG with `mentions` edges between sections can spot near-duplicates.
- **Tech-debt provenance.** The existing tech-debt system (`tech-debt/{accepted,monitoring,...}/h-NNN-*.md` with Zod schema in `src/blueprint/tech-debt/schema.ts`) is hand-curated. KG findings should auto-file structured items so drift becomes visible work instead of silent accumulation.

Today's state of the world (verified on disk 2026-05-11):

- `webpresso/agent-kit/blueprints/`: 13 completed, 1 draft (the compiler blueprint), all using `_overview.md` with the documented YAML frontmatter (`type`, `status`, `complexity`, `created`, `progress`, `depends_on`, `tags`, `completed_at`).
- `webpresso/agent-kit/catalog/`: `agent/{skills,commands,rules,guides,workflows,agents}`, `base-kit/`, `docs/templates/`, `vision/`. Rule files are plain markdown without frontmatter (instruction docs, not data).
- `webpresso/agent-kit/tech-debt/accepted/`: `h-001-*.md` etc. with full Zod-validated frontmatter (`type: tech-debt`, `status`, `severity`, `category`, `review_cadence`, `last_reviewed`, `linked_blueprints`, `affected_modules`).
- `webpresso/monorepo/docs/`: VitePress site, `freshness.data.ts` loader pattern, no size-budget metadata in doc frontmatter.
- No existing KG or MCP watcher in agent-kit; `opencode.json` has `watcher.ignore` but that's file-watch ignore patterns, not artifact tracking.

So this work has clean integration points: existing frontmatter schemas to ingest, an existing tech-debt lifecycle to auto-file findings into, and an existing MCP surface (`ak_*`) to extend.

## Non-goals

- Not a generic graph DB or RAG store. Strictly: an embedded KG over `.agent/` artifacts plus a watcher and a small query/audit surface.
- Not an LLM-driven concept-extraction tool. Every edge is **derivable from markdown AST** (links, headings, frontmatter refs) — no model calls in the hot path. Embeddings are out of scope for v0.12.0; reserved for a possible v0.13.0 "semantic similarity" extension.
- Not a replacement for the existing manifest (`.agent/.sync-manifest.json` from the compiler blueprint). The KG ingests the manifest plus the source files; the manifest stays the source of truth for sync drift.
- Not a backwards-compat shim layer. Net-new capability; first ship is v0.12.0; no legacy code path to preserve.

## Architecture

### Core stack (verified, fact-checked 2026-05-11)

| Component | Choice | Why |
|---|---|---|
| Embedded graph store | **[Kuzu](https://github.com/kuzudb/kuzu)** (3.9k stars, MIT, C++ with Node bindings) | Embedded property-graph DB with Cypher query language, single-file `.kz` storage, vector + FTS built-in. Zero daemon. Zero Docker. Fits inside `.agent/.graph.kz`. |
| Markdown AST parser | **`remark` + `remark-frontmatter` + `mdast-util-to-string`** | De-facto standard, deterministic, well-maintained, already widely used. No LLM cost. |
| File watcher | **`chokidar`** | Battle-tested, debounced, cross-platform; the same library OpenCode and Claude Code use internally. |
| MCP server transport | **stdio** via the existing `@modelcontextprotocol/sdk` server scaffold already used by `ak_qa`, `ak_test`, etc. | Single SDK surface; the new tools register the same way. |
| Tech-debt integration | Extend existing `src/blueprint/tech-debt/schema.ts` Zod schema | Auto-filed items use the same shape consumers already review weekly/biweekly. |

### Storage layout

```
.agent/
├── .graph.kz                    ← embedded Kuzu DB (gitignored)
├── .graph.snapshot.json         ← exported snapshot for CI/PR review (gitignored by default; opt-in commit for review)
├── .graph.lock                  ← O_EXCL lock for concurrent watchers
├── .merged.provenance.json      ← from compiler blueprint (input)
└── .sync-manifest.json          ← from compiler blueprint (input)
```

`.kz` is binary and large-ish → gitignored. The snapshot JSON is a stable, human-reviewable export (node list + edge list, sorted) — opt-in commit via consumer's `.gitignore` override if they want graph-state diffs in PRs.

### Schema (Cypher node + edge definitions)

```cypher
-- Nodes ---------------------------------------------------------
CREATE NODE TABLE File (
  path STRING PRIMARY KEY,        -- e.g. ".agent/skills/foo/SKILL.md"
  kind STRING,                    -- 'skill' | 'command' | 'agent' | 'memory' | 'rule' | 'hook' | 'blueprint' | 'tech-debt'
  byte_size INT64,
  char_count INT64,
  line_count INT64,
  content_hash STRING,            -- sha256
  last_modified INT64             -- epoch ms
);
CREATE NODE TABLE Heading (id SERIAL PRIMARY KEY, slug STRING, level INT8, byte_offset INT64);
CREATE NODE TABLE FrontmatterKey (id SERIAL PRIMARY KEY, key STRING, value STRING);
CREATE NODE TABLE RuntimeTarget (name STRING PRIMARY KEY);  -- 'claude' | 'codex' | 'opencode' | 'cursor' | 'windsurf' | 'gemini'
CREATE NODE TABLE Budget (
  target STRING PRIMARY KEY,     -- 'codex-skill-listing' | 'claude-skill-description' | ...
  max_bytes INT64,
  measured_bytes INT64,
  ratio FLOAT
);
CREATE NODE TABLE Blueprint (
  slug STRING PRIMARY KEY,
  status STRING,
  complexity STRING,
  created STRING,
  progress STRING
);
CREATE NODE TABLE TechDebtItem (
  slug STRING PRIMARY KEY,        -- 'h-001-track-codex-cli-plugin-marketplace-maturity'
  severity STRING,
  category STRING,
  status STRING,
  review_cadence STRING,
  next_review STRING
);

-- Edges ---------------------------------------------------------
CREATE REL TABLE has_heading        (FROM File TO Heading);
CREATE REL TABLE has_frontmatter    (FROM File TO FrontmatterKey);
CREATE REL TABLE references         (FROM File TO File, ref_text STRING, source_line INT64, is_resolved BOOLEAN);
CREATE REL TABLE imports            (FROM File TO File, mode STRING);  -- '@import' | 'symlink' | 'memory-layer'
CREATE REL TABLE compiles_to        (FROM File TO File, target STRING);  -- target = runtime name
CREATE REL TABLE overrides          (FROM Heading TO Heading, op STRING);  -- 'replace' | 'append' | 'prepend' | 'delete'
CREATE REL TABLE mentions           (FROM Heading TO File, source_line INT64);
CREATE REL TABLE belongs_to         (FROM File TO Blueprint);
CREATE REL TABLE tracks_techdebt    (FROM File TO TechDebtItem);
CREATE REL TABLE budget_charges     (FROM File TO Budget, charge_bytes INT64);
```

### Ingester pipeline

1. **Watcher** (`chokidar`) sees a change to `.agent/**/*` or repo-root `AGENTS.md` / `CLAUDE.md`.
2. **Debounce** 250ms (one ingest per quiet window — not a stalling timeout, see `no-timeout-as-fix.md`).
3. **Parser** (`remark`) builds mdast for the changed file. Extract: frontmatter, top-level `##` headings, all links (`[text](path)` and `@path` Claude-style imports), code blocks (for ref-mentions).
4. **Resolver** turns each link → target File node by path normalization. Unresolved → `is_resolved = false`.
5. **Loader** does an `UPSERT` on the File node + dependent Heading/FrontmatterKey nodes + edges, removes stale edges. All in one Kuzu transaction.
6. **Provenance** records (timestamp, file path, edges added/removed) appended to `.agent/.graph.changelog.jsonl` (gitignored, 7-day rotation).
7. **Budget recalc** for files whose size changed — updates `Budget` nodes; emits a warning event if `ratio > 0.85`.

No LLM calls. Pure AST → graph. Predictable cost: O(file size) per change.

### MCP tool surface

| Tool | Inputs | Output |
|---|---|---|
| `ak_graph_query` | `cypher` (string), optional `params` | Rows as JSON array, capped at 1000 |
| `ak_graph_orphans` | `--scope=project\|user`, `--kind=skill\|command\|...` | List of File nodes with unresolved-incoming or zero-edge state |
| `ak_graph_sizes` | `--over=N` (bytes), `--target=codex\|claude\|...` | Files exceeding the budget for a runtime |
| `ak_graph_compact` | `path` | Structured compaction proposal: duplicate `##` blocks across layers + within-file redundancy via simhash; never auto-applies |
| `ak_graph_provenance` | `path` | For a memory output section: which source file + op contributed it (reads `.merged.provenance.json` + KG) |
| `ak_graph_explore` *(optional, v0.13.0+)* | `prompt` (free-form) | Wraps graphify CLI for fuzzy "what does my repo mean" queries — opt-in, requires `pip install graphifyy[mcp]` |

All five core tools are read-only over the Kuzu DB. `ak graph build` rebuilds the DB from scratch; `ak graph watch` runs the chokidar loop.

### Audits

- `ak audit graph-refs`: fails if any `references` edge has `is_resolved = false`. CI-suitable.
- `ak audit graph-sizes`: fails if any File node charging a `Budget` exceeds threshold. Per-runtime thresholds configured in `.agent/.graph.budgets.yaml` (committed).

Example committed budget config:

```yaml
# .agent/.graph.budgets.yaml
budgets:
  codex-skill-listing:
    max_bytes: 7000      # below Codex's hard 8000 cap with 1KB headroom
    warn_ratio: 0.85
  claude-skill-description:
    max_bytes_per_skill: 800
  agents-md-section:
    max_bytes_per_section: 4096
    suggest_compact_at: 0.75
  blueprint-overview:
    max_bytes: 50000     # ~50KB per _overview.md before suggesting split
```

`ak audit graph-sizes` is the proactive replacement for the warning-after-the-fact pattern that started this whole investigation.

## Tech debt integration

`ak tech-debt new --from-graph "<cypher>"` filters KG findings into the tech-debt format. Example:

```bash
ak tech-debt new --from-graph "MATCH (f:File)-[r:references {is_resolved:false}]->() RETURN f.path, count(r)" \
  --category documentation --severity medium --cadence biweekly
```

Files `tech-debt/needs-remediation/h-NNN-resolve-broken-agent-refs.md` using the existing Zod schema (`type: tech-debt`, `status: needs-remediation`, `severity: medium`, etc.). Adds `linked_blueprints: [agent-knowledge-graph-mcp]`. Reviewer sees the structured item in their next cadence cycle.

This closes the loop: drift detected → structured work item → reviewed in lifecycle → resolved → KG verifies → tech-debt item moves to `resolved/`.

## Graphify scenarios — investigated, rejected for v0.12.0

We deeply evaluated [safishamsi/graphify](https://github.com/safishamsi/graphify) (active development, v0.7.13 tag 2026-05-09, ~25 open issues in the last 7 days). The findings:

| Scenario | Verdict | Reasoning |
|---|---|---|
| **A: Replace Kuzu+remark with graphify as the KG backend** | **Reject** | LLM-driven concept extraction is the wrong tool for invariant checking. We need "does file X exist," not "what concepts are in file X." Each `--update` costs API tokens. |
| **B: graphify as a separate MCP server alongside ours** | **Defer** | Adds Python runtime to consumer setup; LLM cost per refresh; read-only over stale JSON. Re-evaluate when graphify hits stable v1.0 with LICENSE, fewer open data-model bugs (#741, #803, #808, #811, #813–#815 currently open). |
| **C: graphify as an optional `ak graph explore` tool** | **Adopt at v0.13.0+** | For fuzzy "what does this codebase mean" questions where our deterministic Cypher queries can't help. Opt-in via `pip install graphifyy[mcp]`. Documented as advisory, not authoritative. |
| **D: Borrow graphify's confidence-tagged edge model for our schema** | **Skip** | Their `confidence_score ∈ {EXTRACTED, INFERRED, AMBIGUOUS}` is useful for LLM-derived edges; ours are AST-derived and always exact. Adding confidence would be ceremony without information. |
| **E: Use graphify's MCP tool list as a reference for our naming** | **Partial adopt** | Their `get_node`, `get_neighbors`, `graph_stats` are sensible names; we'll mirror that idiom where it makes sense (`ak_graph_query`, `ak_graph_orphans`, etc.). |

**Risk we accept by deferring graphify:** if a consumer wants semantic similarity search across their agent assets, they get nothing in v0.12.0. Mitigation: document the v0.13.0 path; for now, `ak_graph_query` Cypher covers the structural majority of needs. The compaction tool (`ak_graph_compact`) uses **simhash** (deterministic, no LLM) for near-duplicate detection — covers 80% of what fuzzy similarity would give us at zero cost.

## Technology Choices

| Decision | Choice | Reasoning |
|---|---|---|
| Graph backend | Kuzu (npm `kuzu`, MIT, embedded) | Single-file `.kz`, no daemon, Cypher query, native Node bindings. Verified ships as a pure npm package — no Python, no Docker. |
| Storage location | `.agent/.graph.kz` (gitignored) + `.agent/.graph.snapshot.json` (opt-in commit) | DB is binary + large; snapshot is human-reviewable + diffable |
| Watcher | chokidar with 250ms debounce | Not a timeout — a debounce window. Per `no-timeout-as-fix.md`: this is a measured cost, not a workaround. |
| Ingest semantics | Pure AST extraction (no LLM) | Deterministic, free, fast (<100ms per change). Embeddings deferred to v0.13.0. |
| Compaction algorithm | simhash for near-dup detection + exact-match for full-block dup | No model calls; reproducible; suggestions only — never auto-applies |
| MCP transport | stdio via existing `@modelcontextprotocol/sdk` | One server process; new tools register alongside `ak_qa` etc. |
| Tech-debt integration | Auto-file via existing `tech-debt new` CLI surface + existing Zod schema | Reuse not invent; consumers already have the review lifecycle wired |
| Graphify | Optional, advisory, v0.13.0+ | See scenarios table above |
| Backwards compat | None — net new at v0.12.0 | No legacy code path |
| KG snapshot in PR diffs | Opt-in committed `.graph.snapshot.json` (compact JSON, sorted keys) | Lets reviewers see graph deltas without binary diffs |

## Edge Cases

| ID | Severity | Case | Mitigation |
|---|---|---|---|
| G1 | HIGH | Watcher dies mid-ingest; KG and on-disk state drift | On startup `ak graph watch` runs `ak graph verify` (compares content hashes in KG vs files); diff → rebuilds affected nodes. Lock file `.agent/.graph.lock` (O_EXCL) prevents two watchers; second exits with clear message. |
| G2 | HIGH | Kuzu schema migration when v0.12.x ships a new node/edge type | Schema version stored in DB metadata; on `ak graph build`, if version differs, rebuild from scratch (fast since AST-only). No in-place migration logic. |
| G3 | MEDIUM | `.agent/.graph.kz` corrupted (power loss, disk full) | `ak graph verify` detects via Kuzu's own integrity check; rebuild from sources. Never trust the DB as source of truth — `.agent/` is canonical. |
| G4 | MEDIUM | Reference resolver maps `@AGENTS.md` to repo-root AGENTS.md, but the merged AGENTS.md is itself a compiler output | Compiler manifest tells us AGENTS.md is generated; KG flags `references` to generated files with `is_resolved = true; is_generated = true` so audits can choose whether to count them |
| G5 | MEDIUM | A skill description references "see also: tech-debt h-001" — the slug evolves to `h-001-renamed` on rotation | Tech-debt items have stable `slug` field; KG indexes by slug not filename; rename detection handled by tracking slug→file edges separately |
| G6 | LOW | Consumer has thousands of memory layer files (per-directory AGENTS.md across a large monorepo) | Initial build is O(N); incremental ingest is O(changed). Bench in CI: full ingest of 1000 memory files should complete in <5s. If not, profile (per `no-timeout-as-fix.md`). |
| G7 | LOW | KG snapshot diff in a PR is enormous (massive structural change) | `ak graph snapshot --summary` produces a counts-only diff (nodes added/removed/changed); full diff is opt-in |
| G8 | MEDIUM | Cypher query injected through a malicious skill description hitting `ak_graph_query` via MCP | All MCP-exposed queries are **parameterized only** — no string interpolation; the `ak_graph_query` tool accepts a fixed set of pre-registered query templates plus user-supplied params, not arbitrary Cypher. Free-form Cypher is gated behind `ak graph query` CLI for trusted shell use. |
| G9 | LOW | simhash near-dup detection false-positives on common boilerplate (e.g., "## Why this exists" header) | Compaction tool ignores headings + ignored-pattern list configured in `.graph.budgets.yaml`; suggestions ranked by hash distance and only those with distance ≤ 4 surfaced |
| G10 | LOW | Tech-debt auto-file creates duplicate `h-NNN` slugs if the watcher fires twice | `ak tech-debt new --from-graph` uses content-hash of the finding as idempotency key; second invocation is a no-op |

## Risks

| ID | Severity | Risk | Mitigation |
|---|---|---|---|
| GR1 | HIGH | Kuzu adoption is smaller than Neo4j; team unfamiliarity may slow PRs | Cypher is the same dialect; only one developer needs to learn Kuzu's storage particulars (in-tree docs + the kuzudb/kuzu README cover it). Adapter is thin — most code is the remark ingester. |
| GR2 | MEDIUM | Adding chokidar + remark + kuzu raises agent-kit's npm install footprint | Bench before/after. Targets: <50MB increase, <2s install delta. If exceeded, evaluate lighter alternatives (better-sqlite3 + custom adjacency list). |
| GR3 | MEDIUM | The watcher running 24/7 inside developer machines is power/CPU cost | Watcher idles at <0.5% CPU when no changes; debounce prevents bursts. `ak graph watch --once` (single ingest then exit) is available for low-power scenarios. CI uses `--once`. |
| GR4 | LOW | Compaction suggestions are advisory but users may treat them as authoritative | Tool output is clearly labeled "**suggestion**" with a "review before applying" preamble; no `--apply` flag in v0.12.0 |
| GR5 | LOW | Graphify integration in v0.13.0 may never happen (their stability hasn't improved) | Optional; if abandoned, simply drop the planned `ak_graph_explore` tool. No commitment in v0.12.0 forces it. |
| GR6 | MEDIUM | Auto-filing tech-debt items could create noise if the budget thresholds are wrong | Initial v0.12.0 ships with **measure-only** mode — emits warnings but doesn't auto-file. After two weeks of tuning the budgets against monorepo + ingest-lens, flip to auto-file in v0.12.1. |
| GR7 | LOW | The schema embeds runtime names (`'codex'`, `'claude'`, etc.) — if a new runtime is added, schema needs migration | Schema migration is "rebuild from scratch" per G2; runtime list lives in one constant; adding a runtime is a 1-line change. |

## Tasks

### Wave 0 — foundations (no dependencies between tasks; parallel)

#### [agent-kit-core] Task 1.1: Kuzu setup + schema bootstrap

**Status:** todo
**Depends:** None

Add `kuzu` to agent-kit's deps. Create `src/graph/db.ts` with a typed wrapper around the Kuzu connection — open/close, transaction, parameterized query. Create `src/graph/schema.ts` that idempotently emits the `CREATE NODE TABLE` / `CREATE REL TABLE` statements. Bench cold-open + simple insert+query to verify <10ms.

**Files:**
- Modify: `package.json` (add `kuzu` dep)
- Create: `src/graph/db.ts`, `src/graph/db.test.ts`
- Create: `src/graph/schema.ts`, `src/graph/schema.test.ts`

**Steps (TDD):**
1. Write failing test: open temp DB, run schema, insert one File node, query → returns row.
2. Run: `ak_test --file src/graph/schema.test.ts` → FAIL.
3. Implement.
4. Run: PASS. Run: `ak_lint --file <changed>`, `ak_typecheck --file <changed>`.

**Acceptance:**
- [ ] Schema is idempotent (re-running emits no-op)
- [ ] Connection wrapper exposes parameterized-only query interface (G8 mitigation)
- [ ] Cold open + 1k inserts benches <500ms

---

#### [agent-kit-core] Task 1.2: remark ingester

**Status:** todo
**Depends:** None

Add `remark`, `remark-frontmatter`, `mdast-util-to-string` deps. Create `src/graph/ingester.ts` that takes a file path + content and returns a structured `{ file, headings, frontmatter, links, mentions, codeblocks }` object. No graph writes yet — just parsing.

**Files:**
- Modify: `package.json`
- Create: `src/graph/ingester.ts`, `src/graph/ingester.test.ts`

**Steps (TDD):**
1. Fixture file: SKILL.md with frontmatter + 3 headings + 2 links → ingester returns expected structure.
2. Edge case: file with no frontmatter → empty frontmatter object, not crash.
3. Edge case: malformed YAML → parse error with file path + line.

**Acceptance:**
- [ ] Pure function; no I/O beyond reading the passed-in content
- [ ] Output schema typed with Zod for downstream loader contract

---

#### [agent-kit-core] Task 1.3: Reference resolver

**Status:** todo
**Depends:** None

Create `src/graph/resolver.ts` that takes a raw link from the ingester (`text`, `target`, `source_line`) + a workspace root, and returns a `{ resolved_path: string | null, kind: string | null, is_generated: boolean }`. Handles: relative paths, `@AGENTS.md`-style imports, anchor links, runtime-targeted paths (e.g., `.cursor/rules/foo.mdc` resolved against the compiler manifest).

**Files:**
- Create: `src/graph/resolver.ts`, `src/graph/resolver.test.ts`

**Steps (TDD):**
1. Test: `[skill foo](../skills/foo/SKILL.md)` → resolves to canonical `.agent/skills/foo/SKILL.md`.
2. Test: `@AGENTS.md` → root AGENTS.md.
3. Test: missing target → `resolved_path: null`.
4. Test: link to generated `.claude/skills/foo` → resolves with `is_generated: true`.

**Acceptance:**
- [ ] Resolver consults compiler manifest when present (G4 mitigation)
- [ ] No filesystem I/O — caller provides workspace map

---

### Wave 1 — graph loader, watcher, budgets (parallel; depend on Wave 0)

#### [agent-kit-core] Task 2.1: Graph loader (UPSERT pipeline)

**Status:** todo
**Depends:** Task 1.1, 1.2, 1.3

Create `src/graph/loader.ts`. Takes ingester output + resolver output and emits Kuzu UPSERT statements in one transaction. Removes stale edges (a link that disappeared on this revision). Writes a row to `.agent/.graph.changelog.jsonl`.

**Files:**
- Create: `src/graph/loader.ts`, `src/graph/loader.test.ts`

**Steps (TDD):**
1. Fixture: empty DB, ingest one file → File + Heading + references rows appear.
2. Same file, modified to remove one link → `references` edge removed.
3. All in one transaction — abort mid-load leaves DB unchanged.

**Acceptance:**
- [ ] Idempotent: re-loading unchanged file is a no-op
- [ ] Transactional: failure rolls back

---

#### [agent-kit-core] Task 2.2: Chokidar watcher

**Status:** todo
**Depends:** Task 2.1

`src/graph/watcher.ts`. Watches `.agent/**`, repo-root `AGENTS.md`, `CLAUDE.md`. Debounces 250ms. Per-change: ingest → resolve → load. Single-instance via `.agent/.graph.lock` (O_EXCL).

**Files:**
- Create: `src/graph/watcher.ts`, `src/graph/watcher.test.ts`
- Modify: `package.json` (add `chokidar`)

**Steps (TDD):**
1. Test (with fake timers): touch a file → after 250ms one load runs; touch twice within window → one load runs.
2. Test: second watcher invocation sees lock, exits with code 2 + message.
3. Test: watcher crash → lock released on next process start.

**Acceptance:**
- [ ] Lock is automatic on startup, released on exit/crash
- [ ] No timer races

---

#### [agent-kit-core] Task 2.3: Budget calculator

**Status:** todo
**Depends:** Task 1.1, Task 2.1

`src/graph/budgets.ts`. Reads `.agent/.graph.budgets.yaml` (with defaults if missing). After each load, recomputes `Budget` nodes for affected runtimes. Emits warning events when `ratio > warn_ratio`.

**Files:**
- Create: `src/graph/budgets.ts`, `src/graph/budgets.test.ts`
- Create: `catalog/agent/.graph.budgets.yaml` (template emitted by `ak setup`)

**Steps (TDD):**
1. Fixture skill at 700 bytes against 800-byte cap → ratio 0.875, warning emitted.
2. Skill removed → budget recalculated without that file's bytes.

**Acceptance:**
- [ ] Defaults work without consumer config
- [ ] Override via committed `.agent/.graph.budgets.yaml`

---

#### [agent-kit-core] Task 2.4: simhash compactor

**Status:** todo
**Depends:** Task 2.1

`src/graph/compactor.ts`. Compares all `Heading` nodes pairwise via simhash; ranks pairs with distance ≤ 4 as "near-duplicate"; produces structured compaction proposals (no auto-apply). Filters out boilerplate (`## Why this exists`, etc.) via configurable ignored list.

**Files:**
- Create: `src/graph/compactor.ts`, `src/graph/compactor.test.ts`
- Create: `src/graph/_simhash.ts`, `src/graph/_simhash.test.ts`

**Steps (TDD):**
1. Fixture: two `## Build` sections with 80% overlap → flagged.
2. Two boilerplate headings → ignored (G9).
3. Output proposal is structured JSON (heading slugs, source files, dist score, suggested op).

**Acceptance:**
- [ ] simhash is pure (no LLM)
- [ ] Output is human-readable + machine-parseable

---

### Wave 2 — MCP server tools, audits, CLI verbs (depend on Wave 1)

#### [agent-kit-core] Task 3.1: MCP tool registrations

**Status:** todo
**Depends:** Task 2.1, 2.2, 2.3, 2.4

Add five new MCP tools to the existing `@modelcontextprotocol/sdk` server: `ak_graph_query`, `ak_graph_orphans`, `ak_graph_sizes`, `ak_graph_compact`, `ak_graph_provenance`. Each is a thin handler over the Kuzu DB. All MCP-exposed queries are **parameterized** against a pre-registered template set (G8 mitigation).

**Files:**
- Modify: `src/mcp/server.ts` (or wherever the existing MCP server lives)
- Create: `src/mcp/graph-tools.ts`, `src/mcp/graph-tools.test.ts`
- Create: `src/mcp/_query-templates.ts` (pre-registered Cypher templates with parameter slots)

**Steps (TDD):**
1. Test: each tool registers, accepts the documented input schema, returns the documented output.
2. Test: `ak_graph_query` with arbitrary user-supplied Cypher → rejected; with template-id + params → executed.
3. Test: result row count capped at 1000.

**Acceptance:**
- [ ] All five tools wired
- [ ] No raw-Cypher path through MCP
- [ ] Output JSON-serializable

---

#### [agent-kit-core] Task 3.2: `ak graph` CLI command family

**Status:** todo
**Depends:** Task 2.1, 2.2

`ak graph build` (rebuild from scratch), `ak graph query <template-id> [--params ...]`, `ak graph watch` (foreground watcher), `ak graph watch --once` (single ingest), `ak graph mcp` (stdio MCP server entrypoint), `ak graph verify` (KG consistency check + auto-rebuild if drift), `ak graph snapshot` (export to .graph.snapshot.json).

**Files:**
- Create: `src/cli/commands/graph/{build,query,watch,mcp,verify,snapshot}.ts`
- Create: `src/cli/commands/graph/*.test.ts` (one per file)

**Steps (TDD):**
1. Test each subcommand in isolation with a temp `.agent/` fixture.
2. Test: `ak graph watch --once` exits 0 after one ingest cycle.

**Acceptance:**
- [ ] Each subcommand documented in `ak graph --help`
- [ ] `--once` and `--scope` flags consistent across subcommands

---

#### [agent-kit-core] Task 3.3: Audits — graph-refs + graph-sizes

**Status:** todo
**Depends:** Task 2.1, 2.3

`ak audit graph-refs`: fails if any unresolved `references` edge. `ak audit graph-sizes`: fails if any budget exceeded. Both wired into the existing `ak audit` composite. CI-suitable exit codes; `--json` for machine parsing.

**Files:**
- Create: `src/cli/commands/audit/graph-refs.ts`, `src/cli/commands/audit/graph-refs.test.ts`
- Create: `src/cli/commands/audit/graph-sizes.ts`, `src/cli/commands/audit/graph-sizes.test.ts`
- Modify: existing `ak audit` composite registry

**Steps (TDD):**
1. Fixture with one broken ref → audit exits 1 with structured output.
2. Fixture with budget exceeded → audit exits 1.
3. Clean fixture → audit exits 0 silently.

**Acceptance:**
- [ ] Both audits emit `tier`, `failures`, `bytes`, `tokensSaved` to match existing `ak_qa`-style summary contract per `cmd-execution.md`
- [ ] Registered in `ak audit --help` output

---

#### [agent-kit-core] Task 3.4: Tech-debt integration

**Status:** todo
**Depends:** Task 3.2

`ak tech-debt new --from-graph "<template-id>" --params ...` reads KG results and auto-files an `h-NNN-slug.md` item using the existing Zod schema. Idempotency key = SHA256 of (template-id + params + result-row-set).

**Files:**
- Modify: `src/cli/commands/tech-debt/new.ts` (extend existing CLI)
- Create: `src/blueprint/tech-debt/from-graph.ts`, `src/blueprint/tech-debt/from-graph.test.ts`

**Steps (TDD):**
1. Test: `--from-graph orphans` files `h-NNN-resolve-broken-agent-refs.md` with correct frontmatter.
2. Re-running with same finding → no new file (idempotent).
3. Test: finding resolved (no rows) → no file created.

**Acceptance:**
- [ ] Filed item validates against existing Zod schema
- [ ] Idempotency works across multiple runs
- [ ] Filed item's `linked_blueprints` includes `agent-knowledge-graph-mcp`

---

#### [agent-kit-templates] Task 3.5: Gitignore additions

**Status:** todo
**Depends:** None (can ship early)

Extend the `ak setup --with base-kit` gitignore template to include `.agent/.graph.kz`, `.agent/.graph.lock`, `.agent/.graph.changelog.jsonl`. `.graph.snapshot.json` is **not** ignored by default (opt-in commit for review).

**Files:**
- Modify: `src/setup/templates/base-kit/.gitignore`
- Modify: `src/cli/commands/audit/gitignore-agent-surfaces.ts` (extend the agent-surfaces block check)

**Acceptance:**
- [ ] `ak audit gitignore-agent-surfaces` accepts the extended block
- [ ] Snapshot remains committable

---

### Wave 3 — release

#### [release] Task 4.1: Cut agent-kit v0.12.0

**Status:** todo
**Depends:** All Wave 2 + compiler blueprint shipped (v0.11.0 in `agent-asset-compiler-multi-runtime`)

Bump to 0.12.0. CHANGELOG section calls out: new `ak_graph_*` MCP tools, new `ak graph` CLI family, two new audits, tech-debt auto-file via graph queries, Kuzu + remark + chokidar deps added.

**Files:** `package.json`, `CHANGELOG.md`

**Steps:** Full QA (`ak_qa`), bump version, write changelog, commit (Lore-Commit-Protocol), tag, push.

**Acceptance:**
- [ ] CHANGELOG mentions compiler v0.11.0 as prerequisite
- [ ] Optional graphify integration documented as v0.13.0+ scope

---

### Wave 4 — consumer rollouts (parallel)

#### [consumer-monorepo] Task 5.1: monorepo opt-in to graph + watcher

**Status:** todo
**Depends:** Task 4.1, plus compiler v0.11.0 already consumed

Bump agent-kit dep to 0.12.0 in monorepo. Run `ak graph build`. Commit `.agent/.graph.budgets.yaml` (project-tuned). Add `ak graph mcp` to the `mcp_servers` registry the team uses (`.codex/config.toml`, `.opencode/opencode.json`). Run `ak audit graph-refs && ak audit graph-sizes` — confirm pass or surface findings.

**Files:**
- Modify: `webpresso/monorepo/.agent/.graph.budgets.yaml` (NEW)
- Modify: `webpresso/monorepo/.codex/config.toml`, `webpresso/monorepo/.opencode/opencode.json` (add MCP server entry)
- Modify: `webpresso/monorepo/.gitignore` (extend agent-surfaces block)

**Steps:**
1. Bump dep.
2. `ak graph build`.
3. Audits.
4. If audits surface real findings: `ak tech-debt new --from-graph` to file them.
5. Commit with lore message.

**Acceptance:**
- [ ] Audits pass OR tech-debt items filed for every finding
- [ ] MCP server registered in all consumer-agent configs
- [ ] No drift on `ak graph verify`

---

#### [consumer-ingest-lens] Task 5.2: ingest-lens opt-in to graph + watcher

**Status:** todo
**Depends:** Task 4.1

Same as 5.1 but for `ozby/ingest-lens`. Pin to v0.12.0 SHA.

**Files:** `ozby/ingest-lens/.agent/.graph.budgets.yaml`, `.codex/config.toml`, `.opencode/opencode.json`, `.gitignore`.

**Acceptance:** as 5.1.

---

#### [docs] Task 5.3: docs + KG cookbook

**Status:** todo
**Depends:** Task 4.1

agent-kit README: new section on the KG + MCP watcher. Add `docs/kg-cookbook.md` with 6–8 worked Cypher queries that consumers will copy-paste:

- "Show me every skill exceeding Codex's 800-char budget"
- "Find all unresolved `@AGENTS.md` imports in CLAUDE.md files"
- "List sections in AGENTS.md that haven't been touched in 90 days"
- "Find near-duplicate `## Conventions` sections across memory layers"
- "Which blueprints reference tech-debt items currently in `needs-remediation`?"
- "Compaction candidates for the merged AGENTS.md"

Also: write the "Graphify: considered and deferred" Appendix C of this blueprint into a public-facing note for consumers who ask "why don't we use graphify?"

**Files:**
- Modify: `webpresso/agent-kit/README.md`
- Create: `webpresso/agent-kit/docs/kg-cookbook.md`
- Create: `webpresso/agent-kit/docs/graphify-evaluation.md`

**Acceptance:**
- [ ] Cookbook queries all parse against the v0.12.0 schema
- [ ] Graphify eval doc cites versions + dates + open-issue counts for reproducibility

---

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
|---|---|---|---|---|
| **Wave 0** | 1.1, 1.2, 1.3, 3.5 | None | 4 agents | S |
| **Wave 1** | 2.1, 2.2, 2.3, 2.4 | Wave 0 | 4 agents (2.1 first, 2.2-2.4 after) | M |
| **Wave 2** | 3.1, 3.2, 3.3, 3.4 | Wave 1 | 4 agents | M |
| **Wave 3** | 4.1 | Wave 2 + compiler v0.11.0 | 1 agent | S |
| **Wave 4** | 5.1, 5.2, 5.3 | Wave 3 | 3 agents | M |
| **Critical path** | 1.1 → 2.1 → 2.2 → 3.1 → 4.1 → 5.1 | — | 6 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula | Target | Actual |
|---|---|---|---|
| RW0 | Ready Wave 0 tasks | ≥ 3 | **4** ✓ |
| RW1 | Ready Wave 1 tasks | ≥ 4 | **4** ✓ |
| CPR | total / critical | ≥ 2.5 | 15 / 6 = **2.5** ✓ (at floor) |
| DD | edges / tasks | ≤ 2.0 | ~22 / 15 ≈ **1.47** ✓ |
| CP | same-file overlaps | 0 | **0** ✓ |

### Parallelization Score: **A**

---

## Appendix B — Why Kuzu (not Neo4j / not SQLite / not graphify)

| Option | Pro | Con | Verdict |
|---|---|---|---|
| **Kuzu** (chosen) | Embedded, single-file `.kz`, Cypher, MIT, npm-installable, vector + FTS built-in | Smaller community than Neo4j; younger | **Adopt** — fits the "ships inside a consumer's repo, zero daemon" requirement |
| Neo4j | Mature, huge ecosystem, official MCP server exists | Requires server process, Docker, JVM | Reject — too heavy for a per-repo embedded use case |
| SQLite + adjacency list | Smallest possible footprint | Cypher-less; we'd write our own query layer | Reject for v0.12.0; reconsider if Kuzu install bench fails GR2 |
| **graphify** | LLM-driven concept extraction, MCP-native | Python sidecar, LLM cost per refresh, missing LICENSE, unstable | Optional v0.13.0+ (see scenarios table above) |
| Cognee / mem0 / Letta | Rich memory layers | Massive overhead; designed for agent memory not file-graph | Reject — wrong use case |
| Graphiti | Temporal KG, episode model | Needs Neo4j/FalkorDB; temporal not our concern | Reject |

## Appendix C — Graphify integration scenarios (full)

(Already captured inline in "Graphify scenarios — investigated, rejected for v0.12.0" above. This appendix is for downstream public-facing docs; not duplicated here.)

## Refinement Summary

| Metric | Value |
|---|---|
| Findings total | 17 (10 edge cases + 7 risks) |
| Critical | 0 |
| High | 3 |
| Medium | 9 |
| Low | 5 |
| Cross-blueprint deps | 1 (`agent-asset-compiler-multi-runtime` must ship first) |
| Total tasks | 15 |
| Critical path | 6 waves |
| Parallelization score | **A** |

---

## Open questions before promoting to `planned/`

1. **Snapshot commit default:** should `.agent/.graph.snapshot.json` be committed by default (so reviewers see graph deltas in PRs) or gitignored by default (less noise)? Recommendation: gitignored by default, opt-in via `.gitignore` override for repos that want it.
2. **Budget tuning window:** GR6 proposes shipping `measure-only` for two weeks before flipping to auto-file. Acceptable, or do we want auto-file at v0.12.0 with consumer-tunable thresholds out of the gate?
3. **Graphify v0.13.0 commitment:** keep the optional integration on the roadmap, or drop it entirely until graphify reaches stable v1.0? Recommendation: keep on roadmap, mark as "evaluating" not "planned."
4. **MCP exposed Cypher templates list:** which pre-registered templates ship at v0.12.0? Sketched in the docs cookbook (~6–8 queries). Lock that list in, or keep open?
5. **Embedded vector store:** Kuzu supports vectors. Do we ship any embedding-based feature at v0.12.0 (e.g., "find skills semantically similar to this one") or strictly AST-only? Recommendation: strictly AST-only at v0.12.0; embeddings deferred — gives us a 6-month window to see if simhash compaction is sufficient.
