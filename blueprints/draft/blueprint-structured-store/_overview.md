---
type: blueprint
title: Blueprint structured store (SQLite-backed, agent-native operation)
status: draft
complexity: L
owner: ozby
created: 2026-05-11
depends_on:
  - agent-asset-compiler-multi-runtime
  - agent-knowledge-graph-mcp
tags:
  - agent-kit
  - blueprints
  - sqlite
  - mcp
  - structured-state
lifecycle:
  state: draft
---

# Blueprint structured store

## Product wedge anchor

- **Stage outcome:** VISION.md's north star ("One command, fully wired") plus the development philosophy that every non-trivial change goes through a blueprint (`blueprint-scoping.md`, `ak blueprint new`) means **the blueprint lifecycle is the unit of planned work** in any agent-kit-consuming repo. Today that lifecycle lives entirely in markdown files that agents have to regex-parse on every read. This blueprint replaces the regex pipeline with a structured SQLite store + a small AST-based ingester, so every agent runtime — Claude Code, Codex CLI, OpenCode, Cursor, Windsurf, Gemini — can answer "what's blocking me?", "which blueprint owns this task?", "what's the next ready Wave 0 task across all in-progress blueprints?" via parameterized SQL instead of token-heavy markdown round-trips. Builds directly on the compiler blueprint (canonical `.agent/` layout, six-runtime MCP surface) and the KG blueprint (shared chokidar watcher, shared ingester scaffold).
- **Consuming surface:** New MCP tools `mcp__plugin_webpresso-agent-kit_agent-kit__ak_blueprint_{query,task_next,task_advance,promote,finalize,depgraph}`, extended `ak blueprint` CLI verbs (`ak blueprint db {build,query,watch,verify}`, `ak blueprint task next|advance|block`, `ak blueprint promote <slug> <to-state>`), and a new audit `ak audit blueprint-db-consistency` that fails when the DB has drifted from the on-disk markdown source.
- **New user-visible capability:** A developer (or an agent acting on their behalf) can ask "what task should I work on next?" and get a structured answer — `Task 2.4 [adapter] OpenCode agents adapter` (slug, wave, lane, depends-on, blockers, files-to-touch) — instead of having to read three 50KB markdown files. Mutation verbs like `ak blueprint task advance 2.4` update the canonical markdown AND the SQL projection in a single transaction. Cross-blueprint dependency queries ("which blueprints in `in-progress` are blocked on the `agent-asset-compiler-multi-runtime` release?") are one parameterized query, not a manual file walk.

## Why this exists

The CLAUDE.md workspace doc states plainly: *"Blueprints are the unit of planned work in agent-kit-driven repos. New non-trivial work goes through `ak blueprint new` and lives under `blueprints/{draft,planned,in-progress,completed}/`."* Today's state of that lifecycle:

- **13 completed + 1 draft blueprints** in `webpresso/agent-kit/blueprints/` (verified 2026-05-11). All structured as `_overview.md` with YAML frontmatter + section-based body. Existing schema fields per the elegance-pass-2026 blueprint: `type`, `status`, `complexity`, `created`, `last_updated`, `progress`, `depends_on`, `tags`, `completed_at`.
- **Tech-debt items** at `webpresso/agent-kit/tech-debt/{accepted,...}/h-NNN-*.md` already have a full Zod schema in `src/blueprint/tech-debt/schema.ts` — but the validation is one-file-at-a-time, not relational. There's no way to ask "which tech-debt items in `needs-remediation` link to a blueprint that's currently `in-progress`?" without a custom script.
- **`ak blueprint audit`** today is a regex-and-glob linter — checks lifecycle directory placement, frontmatter shape, presence of required sections. It cannot answer relational questions ("are all my Wave 0 tasks complete before I move to Wave 1?") because the data is unstructured to it.
- **Agent runtime cost**: every "show me the next in-progress blueprint" interaction requires reading multiple 30–50KB markdown files into the context window. With three drafted blueprints already approaching 50KB each, that's >150KB of context burn for a question SQL could answer in 200 bytes.
- **Cross-blueprint refs are invisible**: when the KG blueprint references the compiler blueprint as a prerequisite, that fact lives in the frontmatter's `depends_on` field — but nothing today builds a DAG over those edges. So you can't ask "release order for v0.11.0/v0.12.0/v0.13.0" — you have to assemble it by reading.

The KG blueprint (`agent-knowledge-graph-mcp`) already proposes Kuzu for the file-reference graph. That's the **right** primitive for "which file mentions which" but the **wrong** primitive for "select all blueprints where status='in-progress' join tasks on blueprint_slug" — that's a textbook relational join, and SQL is the universal idiom for it. Using Cypher to answer relational questions adds friction without adding power.

So we add a complementary store: **better-sqlite3** for blueprint state (relational), **Kuzu** for cross-asset references (graph). Same chokidar watcher feeds both. Both gitignored. Both rebuildable from canonical `.agent/` and `blueprints/`. Agents query either via the existing `ak_*` MCP surface, idiom-matched to the question.

## Non-goals

- Not making SQLite the **canonical** source. Markdown stays the source of truth (git-tracked, human-reviewable, IDE-editable). SQLite is a **derived, queryable projection** — same model as the KG.
- Not splitting blueprints into multi-file layouts (separate `tasks.yaml`, `risks.yaml`, etc.). One `_overview.md` per blueprint stays the rule; we write a robust parser instead.
- Not introducing a UI. Mutations happen via CLI/MCP verbs that edit markdown; SQLite reflects.
- Not preserving `ak blueprint audit`'s regex pipeline. **Hard cutover at v0.13.0** — old linter deleted, audits re-implemented on top of the SQL projection. No backwards-compat shim layer.
- Not handling repos without blueprint structure. This applies only to repos that already use `ak blueprint new` — others see no change.

## Architecture

### Stack (fact-checked 2026-05-11)

| Component | Choice | Why |
|---|---|---|
| Embedded SQL DB | **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** (npm, MIT, 6.1k stars, active 2026) | Synchronous API (matches agent-kit's sync ergonomics), prepared-statement caching, single-file `.db`, mature native bindings via prebuilt binaries (no compile step on common platforms) |
| Blueprint AST parser | **`remark` + `remark-frontmatter` + `remark-gfm`** (shared with KG blueprint) | Already in tree if KG blueprint lands first; deterministic; handles tables (for Risks/Edge Cases extraction) via gfm extension |
| Schema migration | **Hand-rolled SQL files in `src/blueprint/db/migrations/`** indexed by version | better-sqlite3 has no opinion; we own the migration order. v0.13.0 is the seed migration; future schema changes use `0002_*.sql` etc. |
| Watcher | **Shared chokidar** instance from KG blueprint (`src/graph/watcher.ts`) | One watcher, two writers. Saves one chokidar process per consumer. |
| MCP transport | stdio via existing `@modelcontextprotocol/sdk` server | Same as KG: new tools register alongside `ak_qa`, `ak_graph_*`, etc. |

### Storage layout

```
.agent/
├── .blueprints.db                ← better-sqlite3 file (gitignored)
├── .blueprints.snapshot.sql      ← optional schema + data dump for review (gitignored by default)
├── .blueprints.lock              ← O_EXCL lock
├── .graph.kz                     ← from KG blueprint
└── ...
blueprints/                       ← canonical markdown (committed, unchanged)
├── draft/
├── planned/
├── in-progress/
├── completed/
├── parked/
└── archived/
tech-debt/                        ← canonical markdown for tech-debt items (committed, unchanged)
├── accepted/
├── needs-remediation/
├── monitoring/
└── resolved/
```

`.blueprints.db` rebuilds from `blueprints/**/*.md` + `tech-debt/**/*.md` on demand. Never trusted as source of truth.

### Schema (v0.13.0 seed migration)

```sql
-- Core blueprint table -----------------------------------------------
CREATE TABLE blueprints (
  slug                TEXT PRIMARY KEY,            -- e.g. 'agent-asset-compiler-multi-runtime'
  title               TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('draft','planned','in-progress','completed','parked','archived')),
  complexity          TEXT CHECK (complexity IN ('XS','S','M','L','XL')),
  owner               TEXT,
  created             TEXT,                        -- ISO date
  last_updated        TEXT,
  completed_at        TEXT,
  progress_pct        INTEGER,                     -- parsed from "progress: 87% (..." string
  progress_text       TEXT,                        -- original progress string
  file_path           TEXT NOT NULL UNIQUE,        -- e.g. 'blueprints/draft/foo/_overview.md'
  byte_size           INTEGER NOT NULL,
  content_hash        TEXT NOT NULL,
  ingested_at         INTEGER NOT NULL             -- epoch ms
);
CREATE INDEX idx_blueprints_status ON blueprints(status);
CREATE INDEX idx_blueprints_owner  ON blueprints(owner);

-- Tags as a many-to-many ---------------------------------------------
CREATE TABLE tags (slug TEXT PRIMARY KEY);
CREATE TABLE blueprint_tags (
  blueprint_slug TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  tag_slug       TEXT NOT NULL REFERENCES tags(slug),
  PRIMARY KEY (blueprint_slug, tag_slug)
);

-- depends_on edges ---------------------------------------------------
CREATE TABLE blueprint_dependencies (
  blueprint_slug   TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  depends_on_slug  TEXT NOT NULL,                  -- may reference a slug that doesn't exist yet
  is_resolved      INTEGER NOT NULL DEFAULT 0,     -- 1 if depends_on_slug exists in blueprints
  PRIMARY KEY (blueprint_slug, depends_on_slug)
);

-- Tasks --------------------------------------------------------------
CREATE TABLE tasks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_slug   TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  task_id          TEXT NOT NULL,                  -- e.g. '2.4'
  lane             TEXT,                           -- e.g. 'adapter'
  title            TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('todo','in-progress','blocked','done','dropped')),
  wave             TEXT,                           -- '0','1a','1b',...
  depends_on       TEXT,                           -- raw string "Task 1.1, Task 1.2"; parsed to task_dependencies
  description      TEXT,
  steps_tdd        TEXT,
  acceptance_json  TEXT,                           -- JSON array of acceptance items
  byte_size        INTEGER,
  UNIQUE (blueprint_slug, task_id)
);
CREATE INDEX idx_tasks_blueprint_status ON tasks(blueprint_slug, status);

CREATE TABLE task_dependencies (
  task_id              INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id   INTEGER NOT NULL REFERENCES tasks(id),
  PRIMARY KEY (task_id, depends_on_task_id)
);

CREATE TABLE task_files (
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  op          TEXT NOT NULL CHECK (op IN ('create','modify','delete'))
);

-- Risks / Edge Cases tables (extracted from blueprint body) ---------
CREATE TABLE risks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_slug  TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  risk_id         TEXT NOT NULL,                   -- e.g. 'R2','GR1'
  severity        TEXT NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  description     TEXT NOT NULL,
  mitigation      TEXT NOT NULL,
  UNIQUE (blueprint_slug, risk_id)
);
CREATE TABLE edge_cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_slug  TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  edge_id         TEXT NOT NULL,                   -- 'E8','G7'
  severity        TEXT NOT NULL,
  description     TEXT NOT NULL,
  mitigation      TEXT NOT NULL,
  UNIQUE (blueprint_slug, edge_id)
);

-- Tech-debt items (mirrors Zod schema in src/blueprint/tech-debt/schema.ts) --
CREATE TABLE tech_debt_items (
  slug                  TEXT PRIMARY KEY,          -- 'h-001-track-codex-cli-plugin-marketplace-maturity'
  status                TEXT NOT NULL CHECK (status IN ('accepted','needs-remediation','monitoring','resolved')),
  severity              TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  category              TEXT NOT NULL CHECK (category IN ('complexity','testing','mutation','duplication','dependency','security','documentation')),
  review_cadence        TEXT NOT NULL CHECK (review_cadence IN ('weekly','biweekly','monthly','quarterly')),
  last_reviewed         TEXT,
  created               TEXT,
  next_review           TEXT,                      -- computed
  base_priority         INTEGER,                   -- computed 10-40
  file_path             TEXT NOT NULL UNIQUE,
  byte_size             INTEGER,
  content_hash          TEXT
);
CREATE INDEX idx_techdebt_next_review ON tech_debt_items(next_review);
CREATE INDEX idx_techdebt_status      ON tech_debt_items(status);

CREATE TABLE tech_debt_linked_blueprints (
  techdebt_slug    TEXT NOT NULL REFERENCES tech_debt_items(slug) ON DELETE CASCADE,
  blueprint_slug   TEXT NOT NULL,
  PRIMARY KEY (techdebt_slug, blueprint_slug)
);
CREATE TABLE tech_debt_affected_modules (
  techdebt_slug    TEXT NOT NULL REFERENCES tech_debt_items(slug) ON DELETE CASCADE,
  module           TEXT NOT NULL,
  PRIMARY KEY (techdebt_slug, module)
);

-- Cross-store join helpers -------------------------------------------
-- Bridges into the Kuzu KG via the file_path column (KG keys by path too).
CREATE VIEW v_blueprint_files AS
  SELECT slug, file_path, content_hash, byte_size FROM blueprints
  UNION ALL
  SELECT slug, file_path, content_hash, byte_size FROM tech_debt_items;
```

CHECK constraints enforce the same enum sets as the existing Zod schemas — single source of truth for valid values lives in `src/blueprint/db/enums.ts` and is read both by the SQL migration generator and the parsers.

### Ingester pipeline (extends KG blueprint's pipeline)

1. **Same chokidar watcher** as KG blueprint sees a change in `blueprints/**/*.md` or `tech-debt/**/*.md`.
2. **Debounce 250ms** (shared with KG).
3. **Dual ingest**: parser output fans out to (a) Kuzu writer (graph nodes for KG queries) and (b) better-sqlite3 writer (relational rows).
4. **Blueprint AST parser** walks the markdown via remark + remark-gfm:
   - Frontmatter → `blueprints` row.
   - First `## ` heading marking `## Tasks` → walks the next `#### ` siblings, each is one task. Within each task block: `**Depends:**` → `task_dependencies`; `**Files:**` → `task_files`; `**Steps (TDD):**` → `steps_tdd`; `**Acceptance:**` → `acceptance_json` (parses checkbox list to JSON array).
   - `## Risks` table → `risks` rows.
   - `## Edge Cases` table → `edge_cases` rows.
5. **Idempotent UPSERT** per row, with content-hash gating: if the parsed blueprint's hash matches the stored hash, skip the writes.
6. **Cross-store consistency**: after each transaction, write a row to `.agent/.blueprints.changelog.jsonl` (gitignored). The KG `File` nodes have the same content_hash field — a divergence indicates one watcher is stale and triggers a verify run.

### MCP tool surface

| Tool | Inputs | Output |
|---|---|---|
| `ak_blueprint_query` | `template_id`, `params` (pre-registered SQL templates only — G8-style injection mitigation, same model as KG) | Rows as JSON array, capped at 1000 |
| `ak_blueprint_task_next` | `--blueprint <slug>` (optional; defaults to all in-progress) | Single task object: id, lane, files, depends-on satisfied? |
| `ak_blueprint_task_advance` | `--task-id <id>`, `--to <status>` | Confirmation; writes markdown + re-ingests |
| `ak_blueprint_promote` | `<slug>`, `<to-state>` | Moves directory, updates frontmatter, re-ingests |
| `ak_blueprint_finalize` | `<slug>` | Validates all tasks done, moves draft→completed, writes `completed_at` |
| `ak_blueprint_depgraph` | `--from <slug>` | DAG of blueprint dependencies + tech-debt linkage (joins SQL and KG) |

All five mutation-capable tools (`task_advance`, `promote`, `finalize`) operate by **editing the canonical markdown file**; the SQLite row updates from re-ingest, not from the tool. This preserves "markdown is canonical." `ak_blueprint_query` is read-only.

### Pre-registered SQL templates (v0.13.0 starter cookbook)

```sql
-- 'next-ready-task' — what should an agent work on next?
SELECT t.task_id, t.lane, t.title, t.wave, t.blueprint_slug
FROM tasks t
WHERE t.status = 'todo'
  AND NOT EXISTS (
    SELECT 1 FROM task_dependencies td
    JOIN tasks t2 ON td.depends_on_task_id = t2.id
    WHERE td.task_id = t.id AND t2.status != 'done'
  )
  AND t.blueprint_slug IN (
    SELECT slug FROM blueprints WHERE status = 'in-progress'
  )
ORDER BY t.wave ASC, t.byte_size ASC
LIMIT 10;

-- 'blocked-blueprints' — which in-progress blueprints can't proceed?
SELECT b.slug, b.title, GROUP_CONCAT(dep.depends_on_slug) AS blockers
FROM blueprints b
JOIN blueprint_dependencies dep ON b.slug = dep.blueprint_slug
WHERE b.status = 'in-progress'
  AND dep.depends_on_slug IN (
    SELECT slug FROM blueprints WHERE status NOT IN ('completed')
  )
GROUP BY b.slug;

-- 'tech-debt-due-soon' — items with next_review within 14 days
SELECT slug, severity, category, next_review
FROM tech_debt_items
WHERE next_review <= date('now', '+14 days')
  AND status != 'resolved'
ORDER BY base_priority DESC, next_review ASC;

-- 'blueprint-risk-profile' — high-severity risks in active blueprints
SELECT b.slug, r.risk_id, r.severity, r.description
FROM blueprints b JOIN risks r ON b.slug = r.blueprint_slug
WHERE b.status IN ('in-progress','planned')
  AND r.severity IN ('CRITICAL','HIGH');
```

### Audits

- `ak audit blueprint-db-consistency`: rebuilds DB in a temp file, diffs against the live `.blueprints.db`. Fails on drift. CI-suitable.
- `ak audit blueprint-lifecycle` (existing audit, **rewritten**): now reads from SQL instead of regex over files. Same surface; new implementation. Old code deleted.
- `ak audit tech-debt-cadence`: fails when any `tech_debt_items.next_review` is in the past.

### Replaces existing `ak blueprint audit`

The current `ak blueprint audit --all --strict` runs regex over files. **Deleted at v0.13.0.** Replaced by the SQL-backed audits above, which produce the same exit-code contract but with structured findings (per `cmd-execution.md`'s summary-first JSON shape).

## Technology Choices

| Decision | Choice | Reasoning |
|---|---|---|
| DB engine | better-sqlite3 | Synchronous API, mature, prebuilt binaries on macOS/Linux/Windows, MIT, no daemon |
| Source of truth | Markdown files in `blueprints/` and `tech-debt/` | Git-tracked, human-reviewable, IDE-friendly; SQLite is derived |
| Schema migration | Hand-rolled `.sql` files in `src/blueprint/db/migrations/` | No ORM; full control; replayable on every consumer rebuild |
| Enum source | TS file `src/blueprint/db/enums.ts` generates SQL CHECK constraints + Zod schemas | One file owns valid values for `status`, `severity`, `category`, etc. |
| Cross-store consistency | Shared `content_hash` column in both stores; divergence triggers verify | No two-phase commit (we don't need it — both stores are derived); detected drift triggers rebuild |
| Backwards compat | None — old regex `ak blueprint audit` deleted at v0.13.0 | Consistent with project-wide "0 backwards compat for any integration" rule |
| Snapshot for PRs | `.blueprints.snapshot.sql` (data + schema dump, sorted, deterministic) — gitignored by default; opt-in commit | Same model as KG snapshot |
| Mutation flow | All mutations go through CLI/MCP verbs that edit markdown, never direct SQL writes | Preserves "markdown is canonical"; one code path; auditable |

## Edge Cases

| ID | Severity | Case | Mitigation |
|---|---|---|---|
| B1 | HIGH | Two agents call `ak_blueprint_task_advance` concurrently for the same task | better-sqlite3 transactions are serializable; the markdown write is atomic via tmp+rename; second caller sees post-state on re-ingest and either no-ops (already advanced) or fails with a clear "stale state" error |
| B2 | HIGH | Markdown blueprint has a parse error (malformed YAML, wrong table syntax) | Ingester logs the parse error, skips the file, marks any existing row for that slug as `parse_error_at` (NEW column? — actually keep the row but flag via a `parse_errors` table). Downstream queries can filter on parse status. |
| B3 | MEDIUM | A blueprint moves from `draft/` to `planned/` directly on disk (without `ak blueprint promote`) | Watcher sees the move; `file_path` updates; status enum recomputed from directory name. No data lost. |
| B4 | MEDIUM | A consumer runs the v0.13.0 ingester on a repo with 200+ blueprints | Initial cold build: parse all → batch UPSERT in one transaction. Bench target <2s for 500 blueprints. If exceeded, profile per `no-timeout-as-fix.md`. |
| B5 | MEDIUM | The blueprint parser sees a section it doesn't recognize | Recoverable: unknown `## ` sections are ignored, logged. Tasks/Risks/Edge Cases parsing is best-effort per-row; unparseable rows logged and skipped. |
| B6 | MEDIUM | Tech-debt item's `next_review` is computed from `last_reviewed + cadence` — but `cadence` formula lives in `src/blueprint/tech-debt/schema.ts` (Zod) | Single computation function `computeNextReview(last_reviewed, cadence)` used by both the Zod side and the SQL ingest; documented in `src/blueprint/db/computed-columns.md` |
| B7 | LOW | Pre-registered SQL templates can't cover every consumer's question | `ak blueprint db query --raw "SELECT ..."` exists as a shell-only escape hatch; not exposed via MCP (G8-style mitigation) |
| B8 | LOW | Schema version mismatch when a consumer is on agent-kit v0.13.1 (added a column) and re-ingests | On startup, ingester checks DB's `schema_version` row; if older, runs migrations forward; never backward (G2 from KG blueprint) |
| B9 | LOW | Blueprints with massive task counts (>100) bloat the DB | `tasks` rows are small (<2KB each); even 500 tasks is 1MB. Acceptable. |
| B10 | MEDIUM | The Wave/lane parsing relies on conventions (`[lane] Task X.Y: Title`) — consumers writing irregular headers break the parser | Parser is permissive: defaults `lane` and `wave` to `null` if not parseable; logs `parse_warnings` table entries; doesn't fail |

## Risks

| ID | Severity | Risk | Mitigation |
|---|---|---|---|
| BR1 | HIGH | The current `ak blueprint audit` regex pipeline is well-tested and stable; replacing it adds regression risk | Migration path: ship the new SQL audits **alongside** the regex ones for one minor version (v0.13.0-alpha behind `AK_USE_SQL_AUDITS=1` env), then delete regex code at v0.13.0 GA. Both audits must agree on the test corpus before flipping. |
| BR2 | MEDIUM | better-sqlite3 prebuilt binaries occasionally miss for niche platforms (Alpine musl, M1/M3 transitions) | Ship a build fallback that compiles via node-gyp; document the dep in README; tested on macOS Intel + ARM + Ubuntu in CI |
| BR3 | MEDIUM | The blueprint markdown parser is bespoke — section-keyed parsing is fragile to format drift | Parser has an extensive fixture corpus (every existing blueprint in `blueprints/completed/` is a regression test); breaking changes to the markdown format require explicit version-bump to the blueprint template |
| BR4 | MEDIUM | Watcher fanout to two stores (Kuzu + SQLite) doubles I/O on every change | Both writes happen in parallel via `Promise.all`; bench shows the writes complete in <100ms for typical blueprint sizes; the user's 250ms debounce window dwarfs the write time |
| BR5 | LOW | If KG blueprint doesn't ship first, this blueprint has to bring its own watcher | Hard dependency declared in frontmatter; sequencing enforced in roadmap. If we want to ship this without KG, dup the watcher (small cost — chokidar setup is ~30 lines). |
| BR6 | LOW | Agents writing direct SQL through `ak_blueprint_query` could fingerprint the schema and write fragile queries | Schema versioning is exposed via `ak_blueprint_query template=schema-version`; cookbook queries are versioned alongside |
| BR7 | MEDIUM | Tech-debt items today are managed entirely by markdown — moving structured data to SQL may cause confusion about "where does state live?" | Document clearly: markdown is canonical, SQL is derived; mutations always go through `ak tech-debt` CLI verbs (extends existing surface); never edit SQL directly |

## Migration

No backwards compat. The migration sequence:

1. Land agent-kit v0.13.0 with new blueprint DB + watcher fan-out + new SQL audits.
2. **Delete** the old regex-based `ak blueprint audit` code in the same commit.
3. Cut release.
4. Per consumer:
   1. Bump agent-kit pin.
   2. Run `ak blueprint db build` (cold ingest of existing markdown).
   3. Run `ak audit blueprint-db-consistency` — pass.
   4. Update `.gitignore` (extend with `.agent/.blueprints.db`, `.agent/.blueprints.lock`, `.agent/.blueprints.changelog.jsonl`).
   5. Register `ak blueprint db mcp` (if separate process) — actually it's part of the existing `ak_*` MCP server, so no new registration needed; just ensure the consumer is on v0.13.0.
   6. Commit with lore message.

## Tasks

### Wave 0 — schema + parser foundations (parallel)

#### [agent-kit-core] Task 1.1: SQLite setup + schema migrations

**Status:** todo
**Depends:** None

Add `better-sqlite3` to deps. Create `src/blueprint/db/connection.ts` with typed wrapper (open, prepared statements, transactions, `O_EXCL` lock). Create seed migration `src/blueprint/db/migrations/0001_seed.sql` matching the schema spec above. Generate the SQL from `src/blueprint/db/enums.ts` (single-source enum file).

**Files:**
- Modify: `package.json` (add `better-sqlite3`)
- Create: `src/blueprint/db/connection.ts`, `src/blueprint/db/connection.test.ts`
- Create: `src/blueprint/db/migrations/0001_seed.sql`
- Create: `src/blueprint/db/migrations/run.ts`, `run.test.ts`
- Create: `src/blueprint/db/enums.ts`, `enums.test.ts`

**Steps (TDD):**
1. Failing test: open temp DB, run migrations, insert one blueprint row, query → row returned.
2. Implement migration runner.
3. Implement connection wrapper with prepared-statement caching.

**Acceptance:**
- [ ] Migrations idempotent on re-run
- [ ] Connection wrapper exposes parameterized-only public surface (no string interpolation in MCP-callable paths)
- [ ] Bench: 1000 inserts under 200ms

---

#### [agent-kit-core] Task 1.2: Blueprint markdown parser

**Status:** todo
**Depends:** None (uses remark already in tree if KG blueprint lands first; otherwise adds it)

Create `src/blueprint/parser/blueprint.ts`. Takes a markdown string + file path; emits a typed `ParsedBlueprint` object (frontmatter + tasks[] + risks[] + edge_cases[]). remark + remark-frontmatter + remark-gfm. Section-keyed extraction follows the conventions in the existing blueprints (header patterns documented in `src/blueprint/parser/conventions.md`).

**Files:**
- Create: `src/blueprint/parser/blueprint.ts`, `blueprint.test.ts`
- Create: `src/blueprint/parser/conventions.md`
- Create: `src/blueprint/parser/__fixtures__/` (each existing completed blueprint as a regression fixture)

**Steps (TDD):**
1. For each blueprint in `blueprints/completed/`, snapshot the parser output; commit snapshots.
2. Implement parser; verify snapshots match.
3. Add: malformed frontmatter → error with line number + file path.

**Acceptance:**
- [ ] All 13 completed blueprints parse cleanly
- [ ] Both new drafts (compiler + KG) parse cleanly
- [ ] Snapshot tests cover regression

---

#### [agent-kit-core] Task 1.3: Tech-debt parser (extends existing schema)

**Status:** todo
**Depends:** None

Create `src/blueprint/parser/tech-debt.ts`. Reuses the Zod schema from `src/blueprint/tech-debt/schema.ts` (already in tree). Adds the `computeNextReview` and `computeBasePriority` derived fields.

**Files:**
- Create: `src/blueprint/parser/tech-debt.ts`, `tech-debt.test.ts`
- Modify: `src/blueprint/tech-debt/schema.ts` (export `computeNextReview`, `computeBasePriority` as standalone functions if not already)

**Steps (TDD):**
1. For each h-NNN-*.md in `tech-debt/`, parse → verify Zod validation passes.
2. Verify `next_review` matches the existing computed value (regression).

**Acceptance:**
- [ ] All existing tech-debt items parse
- [ ] Computed columns match existing values

---

### Wave 1 — ingester, watcher fan-out, MCP tools

#### [agent-kit-core] Task 2.1: SQL ingester

**Status:** todo
**Depends:** Task 1.1, 1.2, 1.3

`src/blueprint/db/ingester.ts`. Takes ParsedBlueprint or ParsedTechDebt + file metadata; emits UPSERT statements in a single transaction. Handles slug rename (file moved between lifecycle dirs).

**Files:**
- Create: `src/blueprint/db/ingester.ts`, `ingester.test.ts`

**Steps (TDD):**
1. Fixture parsed blueprint → ingester writes blueprint row + tasks + risks + edge_cases + tags + dependencies.
2. Re-ingest unchanged → no-op (content-hash gate).
3. Re-ingest with task removed → row removed.
4. Move blueprint from `draft/` to `planned/` → status updated, file_path updated, no data lost.

**Acceptance:**
- [ ] Transactional all-or-nothing
- [ ] Content-hash gates avoid unnecessary writes
- [ ] Slug rename + dir move handled

---

#### [agent-kit-core] Task 2.2: Watcher fan-out

**Status:** todo
**Depends:** Task 2.1, plus KG blueprint Task 2.2 (watcher)

Extends the KG blueprint's chokidar watcher to also drive SQL ingestion. Same debounce window. Same lock. Both writes happen in parallel; either failing rolls back via per-store transactions.

**Files:**
- Modify: `src/graph/watcher.ts` (add SQL writer wiring)
- Create: `src/blueprint/db/watcher-adapter.ts`, `watcher-adapter.test.ts`

**Steps (TDD):**
1. Touch `blueprints/draft/foo/_overview.md` → both Kuzu and SQLite rows written.
2. Kuzu write fails (force) → SQL still proceeds; mismatch detected by `ak audit blueprint-db-consistency`.

**Acceptance:**
- [ ] Single watcher process, two writers
- [ ] Independent transaction boundaries per writer (one failing doesn't abort the other)
- [ ] Cross-store divergence detection works

---

#### [agent-kit-core] Task 2.3: Pre-registered SQL templates

**Status:** todo
**Depends:** Task 2.1

`src/blueprint/db/templates.ts` exposes the v0.13.0 cookbook queries (next-ready-task, blocked-blueprints, tech-debt-due-soon, blueprint-risk-profile, plus 4–6 more). Each template has: id, description, parameter slots, output schema (Zod).

**Files:**
- Create: `src/blueprint/db/templates.ts`, `templates.test.ts`
- Create: `docs/blueprint-db-cookbook.md` (consumer-facing docs)

**Steps (TDD):**
1. For each template, golden-file the expected output against a fixture DB.

**Acceptance:**
- [ ] Each template parameter-validated
- [ ] Output schema enforced

---

#### [agent-kit-core] Task 2.4: MCP tool registrations

**Status:** todo
**Depends:** Task 2.1, 2.3

Register `ak_blueprint_query`, `ak_blueprint_task_next`, `ak_blueprint_task_advance`, `ak_blueprint_promote`, `ak_blueprint_finalize`, `ak_blueprint_depgraph` on the existing MCP server. All five mutation tools edit markdown (NEVER direct SQL writes); the SQL row updates on re-ingest.

**Files:**
- Modify: `src/mcp/server.ts`
- Create: `src/mcp/blueprint-tools.ts`, `blueprint-tools.test.ts`

**Steps (TDD):**
1. Each tool registers with documented input schema; rejects bad input.
2. `task_advance` writes markdown, re-ingests, returns confirmation.
3. `query` accepts only pre-registered template_id; raw SQL → rejected.

**Acceptance:**
- [ ] All six tools wired
- [ ] No direct SQL write path through MCP
- [ ] Mutation tools edit canonical markdown

---

### Wave 2 — CLI verbs, audits, integration

#### [agent-kit-core] Task 3.1: `ak blueprint db` CLI verbs

**Status:** todo
**Depends:** Task 2.1, 2.2

`ak blueprint db build|query|watch|verify|snapshot`. Each thin wrapper over the underlying modules.

**Files:**
- Create: `src/cli/commands/blueprint/db/{build,query,watch,verify,snapshot}.ts`
- Create: `*.test.ts` per file

**Acceptance:**
- [ ] All five subcommands documented in `ak blueprint db --help`

---

#### [agent-kit-core] Task 3.2: SQL-backed `ak blueprint audit`

**Status:** todo
**Depends:** Task 2.1, plus KG blueprint Task 3.3 (audit pattern)

Rewrite `ak blueprint audit` to query SQL instead of regex. Same flag surface (`--all`, `--strict`). Three new audit subcommands: `blueprint-db-consistency`, `blueprint-lifecycle` (rewritten), `tech-debt-cadence`.

**Files:**
- Modify: `src/cli/commands/blueprint/audit.ts` (rewrite)
- Create: `src/cli/commands/audit/blueprint-db-consistency.ts`, `*.test.ts`
- Create: `src/cli/commands/audit/blueprint-lifecycle.ts` (replacement; old file deleted)
- Create: `src/cli/commands/audit/tech-debt-cadence.ts`, `*.test.ts`
- Delete: existing regex-based audit code (per "no backwards compat")

**Steps (TDD):**
1. Each new audit: fixture DB with violation → exits 1 with structured output.
2. Clean fixture → exits 0.
3. Regression: every existing blueprint in `blueprints/completed/` passes the new audits (verifying no false positives).

**Acceptance:**
- [ ] New audits emit `tier`, `failures`, `bytes`, `tokensSaved` per `cmd-execution.md` contract
- [ ] Old regex code fully deleted (grep returns nothing under `src/`)
- [ ] Existing completed blueprints all pass

---

#### [agent-kit-core] Task 3.3: Blueprint mutation verbs (`task advance`, `promote`, `finalize`)

**Status:** todo
**Depends:** Task 2.1

`ak blueprint task advance <task-id> --to <status>`, `ak blueprint promote <slug> <to-state>`, `ak blueprint finalize <slug>`. Each verb: (1) parses the canonical markdown, (2) computes the target markdown content, (3) writes to a `.tmp` file, (4) atomically renames, (5) triggers re-ingest (or relies on watcher).

**Files:**
- Create: `src/cli/commands/blueprint/task.ts`, `task.test.ts`
- Modify: existing `src/cli/commands/blueprint/promote.ts` if it exists, else create
- Create: `src/cli/commands/blueprint/finalize.ts`, `finalize.test.ts`

**Steps (TDD):**
1. `task advance 2.4 --to in-progress` → markdown's "Status: todo" becomes "Status: in-progress"; SQL row reflects on next ingest.
2. `promote agent-asset-compiler-multi-runtime planned` → moves dir, updates status frontmatter.
3. `finalize` rejects if any task not done.

**Acceptance:**
- [ ] All three verbs round-trip cleanly
- [ ] Atomic write semantics (no partial files)
- [ ] Idempotent re-runs

---

#### [agent-kit-core] Task 3.4: Cross-store join via depgraph

**Status:** todo
**Depends:** Task 2.4, plus KG blueprint Task 3.1

`ak_blueprint_depgraph` joins SQL (blueprint metadata + tasks) with Kuzu (file-level references) via `file_path` foreign key. Returns a unified DAG node-list + edge-list.

**Files:**
- Create: `src/mcp/depgraph-join.ts`, `depgraph-join.test.ts`

**Steps (TDD):**
1. Fixture: 2 blueprints with cross-refs; depgraph returns 2 nodes + 1 edge.
2. Include tech-debt items linked via `tech_debt_linked_blueprints`.

**Acceptance:**
- [ ] Single query unifies both stores
- [ ] Performance: <50ms for 20 blueprints + 50 tech-debt items

---

#### [agent-kit-templates] Task 3.5: Gitignore + setup additions

**Status:** todo
**Depends:** None (parallel)

Extend `ak setup --with base-kit` to add `.agent/.blueprints.db`, `.agent/.blueprints.lock`, `.agent/.blueprints.changelog.jsonl` to gitignore. `.agent/.blueprints.snapshot.sql` gitignored by default. Extend `ak audit gitignore-agent-surfaces` to accept the new block.

**Files:**
- Modify: `src/setup/templates/base-kit/.gitignore`
- Modify: `src/cli/commands/audit/gitignore-agent-surfaces.ts`

**Acceptance:**
- [ ] Audit accepts the new block
- [ ] Setup re-run is idempotent

---

### Wave 3 — release

#### [release] Task 4.1: Cut agent-kit v0.13.0

**Status:** todo
**Depends:** All Wave 2 + KG blueprint shipped (v0.12.0)

Bump version. CHANGELOG calls out: new SQL store, new MCP tools, rewritten `ak blueprint audit`, deleted regex code.

**Files:** `package.json`, `CHANGELOG.md`

**Acceptance:**
- [ ] CHANGELOG names compiler v0.11.0 and KG v0.12.0 as prerequisites
- [ ] No regex audit code remains in `src/`

---

### Wave 4 — consumer rollouts

#### [consumer-monorepo] Task 5.1: monorepo adopts v0.13.0

**Status:** todo
**Depends:** Task 4.1

Bump agent-kit. `ak blueprint db build`. Verify all audits pass.

**Acceptance:**
- [ ] `ak audit blueprint-db-consistency` passes
- [ ] `ak audit blueprint-lifecycle` (SQL-backed) passes on all monorepo blueprints
- [ ] `ak audit tech-debt-cadence` passes (or files tech-debt items for stale reviews)

---

#### [consumer-ingest-lens] Task 5.2: ingest-lens adopts v0.13.0

**Status:** todo
**Depends:** Task 4.1

Same as 5.1 but for ingest-lens.

---

#### [docs] Task 5.3: Cookbook + agent-runtime guidance

**Status:** todo
**Depends:** Task 4.1

agent-kit README: new section "Blueprint structured store — SQL for agents." Cookbook documenting the v0.13.0 templates with worked examples. Workspace `repos/CLAUDE.md` updated to mention that agents should prefer `ak_blueprint_query template=next-ready-task` over reading multiple markdown files.

**Files:**
- Modify: `webpresso/agent-kit/README.md`
- Create: `webpresso/agent-kit/docs/blueprint-db-cookbook.md`
- Modify: `webpresso/CLAUDE.md`, `repos/CLAUDE.md`

**Acceptance:**
- [ ] Cookbook covers ≥6 templates
- [ ] Workspace CLAUDE.md mentions the SQL-first agent pattern

---

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
|---|---|---|---|---|
| **Wave 0** | 1.1, 1.2, 1.3, 3.5 | None | 4 agents | S-M |
| **Wave 1** | 2.1, 2.2, 2.3, 2.4 | Wave 0 (1.1–1.3) + KG watcher | 4 agents | M |
| **Wave 2** | 3.1, 3.2, 3.3, 3.4 | Wave 1 | 4 agents | M |
| **Wave 3** | 4.1 | Wave 2 + KG v0.12.0 | 1 agent | S |
| **Wave 4** | 5.1, 5.2, 5.3 | Wave 3 | 3 agents | M |
| **Critical path** | 1.1 → 2.1 → 2.4 → 3.2 → 4.1 → 5.1 | — | 6 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula | Target | Actual |
|---|---|---|---|
| RW0 | Wave 0 ready tasks | ≥ 3 | **4** ✓ |
| RW1 | Wave 1 ready tasks | ≥ 4 | **4** ✓ |
| CPR | total / critical | ≥ 2.5 | 14 / 6 ≈ **2.33** ⚠️ slightly below floor |
| DD | edges / tasks | ≤ 2.0 | ~22 / 14 ≈ **1.57** ✓ |
| CP | same-file overlaps | 0 | **0** ✓ |

### Parallelization Score: **B**

CPR is 2.33 — slightly under the 2.5 floor. Action: consider splitting Task 2.4 (MCP tools) into two tasks (read tools + mutation tools) to bring CPR ≥ 2.5. Defer this micro-split to first refinement pass; not a blocker for `draft/` → `planned/` promotion.

---

## Cross-blueprint vision alignment

This blueprint completes the three-step arc that the compiler + KG blueprints opened:

| Layer | Blueprint | Stores | Operates on | Idiom |
|---|---|---|---|---|
| Distribution | `agent-asset-compiler-multi-runtime` | Filesystem (`.agent/` → 6 runtimes) | Skills, commands, agents, memory | Markdown + YAML |
| Reference graph | `agent-knowledge-graph-mcp` | Kuzu (`.graph.kz`) | Files, headings, links, mentions | Cypher (read-only via MCP templates) |
| Blueprint state | **this blueprint** | SQLite (`.blueprints.db`) | Blueprints, tasks, risks, tech-debt | SQL (read-only via MCP templates; mutations via CLI verbs that edit markdown) |

All three: markdown is canonical, embedded DBs are derived, watchers keep them fresh, MCP tools answer agent questions in the right idiom for the question shape.

---

## Open questions before promoting to `planned/`

1. **CPR slightly below target (2.33 < 2.5)** — split Task 2.4 into `read-tools` + `mutation-tools` to lift to ≥ 2.5? Or accept B and move on?
2. **SQL escape hatch via shell-only `ak blueprint db query --raw`** — necessary? Or should the pre-registered template set be exhaustive enough?
3. **Bidirectional sync** — should the CLI mutation verbs (`task advance`, etc.) also accept a `--via-db` mode that updates SQL first, then markdown? (Current spec: markdown-first always.) Recommendation: stick with markdown-first; revisit only if a real workflow demands it.
4. **Snapshot.sql commit default** — same question as KG blueprint: commit by default or opt-in? Recommendation: opt-in (less PR noise).
5. **Migration to v0.13.0 alongside the alpha gate (BR1)** — flip on `AK_USE_SQL_AUDITS=1` first via v0.13.0-alpha, observe parity for one minor version, then delete regex code at v0.13.0 GA. Acceptable, or do we go straight to delete? The "zero backwards compat" rule argues for straight delete; the audit risk argues for gated transition. Pick one.
