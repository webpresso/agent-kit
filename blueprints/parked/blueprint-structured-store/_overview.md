---
type: blueprint
title: Blueprint structured store — custom MCP over SQLite + cross-repo correlation (permission-aware)
status: parked
parked-reason: "No task breakdown; parked until a concrete product-wedge is identified."
complexity: L
owner: ozby
created: 2026-05-11
last_updated: 2026-05-11
promoted_to_planned: 2026-05-11
tags:
  - agent-kit
  - blueprints
  - sqlite
  - mcp
  - cross-repo
  - permission-model
related_research:
  - docs/research/2026-05-11-agent-asset-infrastructure-landscape.md
  - docs/research/2026-05-11-agent-asset-trilogy-ceo-plan.md
depends_on:
  - agent-asset-compiler-multi-runtime
  - agent-knowledge-graph-mcp
reviews:
  - ceo: 2026-05-11
  - eng: 2026-05-11
  - dx: 2026-05-11
  - codex_outside_voice: 2026-05-11
  - plan_refine: 2026-05-11
lifecycle:
  state: parked
---

# Blueprint structured store (revised post-CEO-review 2026-05-11)

## Product wedge anchor

- **Stage outcome:** VISION.md ("One command, fully wired") + Elegance Pass 2026 stage outcome. Markdown blueprints/tech-debt is the canonical state but agents currently regex-parse 50KB of markdown to answer "what should I work on next?" — expensive context burn on every question. This blueprint adds a **derived SQLite projection** queried via a **custom MCP server (~300 LOC)** honoring the summary-first contract. Decisions 4 + 5 from CEO review banked: custom MCP (mcp-server-sqlite is archived + would violate summary-first + bypass markdown-canonical mutations); skip state export/import (Routines clone the repo fresh and rebuild from markdown). Adds D5 (Datasette `ak blueprint browse`) for free human dev UX win and D8 (cross-repo correlation with permission/org-aware model) — load-bearing constraints documented below.
- **Consuming surface:** Six custom MCP tools (`ak_blueprint_query`, `task_next`, `task_advance`, `promote`, `finalize`, `depgraph`), four CLI verbs (`ak blueprint db build|query|verify|browse`), three audits (`blueprint-db-consistency`, `blueprint-lifecycle` rewritten, `tech-debt-cadence`, `cross-repo-correlation`).
- **New user-visible capability:** Agent asks "what's next?" via MCP → gets back a 200-byte summary (task id, lane, files, blockers) instead of reading 50KB of markdown. Humans run `ak blueprint browse` → browser Datasette UI over the same SQLite store. Cross-repo dependencies (`webpresso/agent-kit` v0.11.0 blocks `webpresso/monorepo` Task 5.1) resolve with permission-aware boundaries — private slugs never leak into public repos.

## Why this exists

The CLAUDE.md workspace doc establishes blueprints as the unit of planned work. Today:

- **13 completed + 3 draft blueprints** under `webpresso/agent-kit/blueprints/`, each as `_overview.md` with YAML frontmatter + section-based body
- **Tech-debt items** at `tech-debt/{accepted,...}/h-NNN-*.md` with full Zod schema (`src/blueprint/tech-debt/schema.ts`)
- **No relational projection** — every agent question requires reading entire markdown files
- **Cross-repo dependencies tracked in prose** — blueprint #1's Task 5.1 (monorepo) + 5.2 (ingest-lens) both depend on v0.11.0 shipped; nothing structurally tracks that

The trilogy's other two blueprints address compilation (v0.11.0) and drift detection (v0.12.0). This blueprint closes the third loop: structured queryable blueprint state for both agents and humans, with cross-repo permission-aware correlation for the webpresso workspace pattern.

## Non-goals

- **Not making SQLite canonical.** Markdown stays the source of truth. SQLite is derived projection, rebuildable from markdown.
- **Not splitting blueprints into multi-file layouts.** One `_overview.md` per blueprint; we write a robust parser.
- **Not introducing a UI for editing.** Mutations happen via CLI/MCP verbs that edit markdown.
- **Not preserving regex-based `ak blueprint audit`.** Hard cutover at v0.13.0; old linter deleted.
- **Not shipping state export/import verbs.** Routines clone the repo fresh; cold-start rebuild from markdown is the documented pattern. No Claude-Routines-specific surface in a multi-runtime kit.
- **Not using `mcp-server-sqlite`.** Archived; violates summary-first contract; bypasses markdown-mutation invariant.
- **Zero backwards compat.**

## Architecture

### Stack

| Component | Choice | Reasoning |
|---|---|---|
| Embedded SQL DB | **`better-sqlite3`** (npm, MIT, 6.1k stars) | Synchronous, prepared-statement caching, single-file `.db`, mature prebuilt binaries |
| MCP server | **Custom (~300 LOC)** in single TS file | mcp-server-sqlite is **archived**; raw rows violate summary-first contract; mutations bypass markdown-canonical (decision 4) |
| Blueprint AST parser | **`remark` + `remark-frontmatter` + `remark-gfm`** (shared with blueprint #1) | Section-keyed extraction; deterministic; handles tables |
| Schema migrations | **Hand-rolled `.sql` files** in `src/blueprint/db/migrations/` indexed by version | No ORM; full control; replayable on every consumer rebuild |
| Enum source | TS file `src/blueprint/db/enums.ts` generates SQL CHECK constraints + Zod schemas | One file owns valid values for `status`, `severity`, `category`, etc. |
| Cold-start rebuild | **Lazy on first `ak blueprint *` command if `.blueprints.db` missing** | Replaces state-export/import (decision 5); Routines + cloud agents rebuild from canonical markdown |
| Human browser UI | **`datasette` (Python, Apache-2.0)** wrapped as `ak blueprint browse` | D5 cherry-pick; free UX win; `pip install datasette` is universal; non-blocking optional dep |
| Cross-repo correlation | **Org/visibility-aware tables + audit gate** (D8) | Load-bearing permission model below |
| Backwards compat | **None** | Hard cutover at v0.13.0; old `ak blueprint audit` regex code deleted |

### Storage layout

```
.agent/
├── .blueprints.db                    ← better-sqlite3 file (gitignored)
├── .blueprints.snapshot.sql          ← deterministic dump (gitignored by default; opt-in commit for PR review)
├── .blueprints.lock                  ← O_EXCL lock
└── correlate.allow.yaml              ← committed; cross-org allowlist (D8)

~/.agent/                             ← user-global
└── workspace.yaml                    ← gitignored; declares local repos comprising the workspace (D8)

blueprints/                           ← canonical markdown (committed, unchanged)
tech-debt/                            ← canonical markdown (committed, unchanged)
```

`.blueprints.db` rebuilds from `blueprints/**/*.md` + `tech-debt/**/*.md` on cold start. Never trusted as source of truth.

### Schema (v0.13.0 seed migration)

```sql
-- Schema version tracking ----------------------------------------------
CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT);

-- Core blueprint table -------------------------------------------------
CREATE TABLE blueprints (
  slug                TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('draft','planned','in-progress','completed','parked','archived')),
  complexity          TEXT CHECK (complexity IN ('XS','S','M','L','XL')),
  owner               TEXT,
  created             TEXT,
  last_updated        TEXT,
  completed_at        TEXT,
  progress_pct        INTEGER,
  progress_text       TEXT,
  file_path           TEXT NOT NULL UNIQUE,
  byte_size           INTEGER NOT NULL,
  content_hash        TEXT NOT NULL,
  ingested_at         INTEGER NOT NULL,
  -- D8 permission fields (load-bearing)
  organization        TEXT NOT NULL,                -- auto-detected via `gh repo view` at first ingest
  visibility          TEXT NOT NULL CHECK (visibility IN ('public','private'))
);
CREATE INDEX idx_blueprints_status     ON blueprints(status);
CREATE INDEX idx_blueprints_org_vis    ON blueprints(organization, visibility);

CREATE TABLE tags (slug TEXT PRIMARY KEY);
CREATE TABLE blueprint_tags (
  blueprint_slug TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  tag_slug       TEXT NOT NULL REFERENCES tags(slug),
  PRIMARY KEY (blueprint_slug, tag_slug)
);

CREATE TABLE blueprint_dependencies (
  blueprint_slug   TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  depends_on_slug  TEXT NOT NULL,
  is_resolved      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (blueprint_slug, depends_on_slug)
);

CREATE TABLE tasks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_slug   TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  task_id          TEXT NOT NULL,
  lane             TEXT,
  title            TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('todo','in-progress','blocked','done','dropped')),
  wave             TEXT,
  description      TEXT,
  steps_tdd        TEXT,
  acceptance_json  TEXT,
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

CREATE TABLE risks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_slug  TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  risk_id         TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  description     TEXT NOT NULL,
  mitigation      TEXT NOT NULL,
  UNIQUE (blueprint_slug, risk_id)
);

CREATE TABLE edge_cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  blueprint_slug  TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  edge_id         TEXT NOT NULL,
  severity        TEXT NOT NULL,
  description     TEXT NOT NULL,
  mitigation      TEXT NOT NULL,
  UNIQUE (blueprint_slug, edge_id)
);

CREATE TABLE tech_debt_items (
  slug                  TEXT PRIMARY KEY,
  status                TEXT NOT NULL CHECK (status IN ('accepted','needs-remediation','monitoring','resolved')),
  severity              TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  category              TEXT NOT NULL,
  review_cadence        TEXT NOT NULL CHECK (review_cadence IN ('weekly','biweekly','monthly','quarterly')),
  last_reviewed         TEXT,
  created               TEXT,
  next_review           TEXT,
  base_priority         INTEGER,
  file_path             TEXT NOT NULL UNIQUE,
  byte_size             INTEGER,
  content_hash          TEXT,
  organization          TEXT NOT NULL,                -- D8: tech-debt items also permission-aware
  visibility            TEXT NOT NULL CHECK (visibility IN ('public','private'))
);
CREATE INDEX idx_techdebt_next_review ON tech_debt_items(next_review);

CREATE TABLE tech_debt_linked_blueprints (
  techdebt_slug    TEXT NOT NULL REFERENCES tech_debt_items(slug) ON DELETE CASCADE,
  blueprint_slug   TEXT NOT NULL,
  PRIMARY KEY (techdebt_slug, blueprint_slug)
);

-- D8 cross-repo correlation tables -------------------------------------
CREATE TABLE workspace_repos (
  repo_path        TEXT PRIMARY KEY,                -- local filesystem path or git URL
  organization     TEXT NOT NULL,
  repo_name        TEXT NOT NULL,
  visibility       TEXT NOT NULL CHECK (visibility IN ('public','private')),
  last_synced      INTEGER
);

CREATE TABLE cross_repo_dependencies (
  blueprint_slug              TEXT NOT NULL REFERENCES blueprints(slug) ON DELETE CASCADE,
  target_repo                 TEXT NOT NULL,        -- e.g., 'webpresso/monorepo'
  target_slug                 TEXT,                 -- NULL when target is private and consumer is public (redacted)
  target_slug_hash            TEXT,                 -- sha256 hash; populated when target_slug is redacted
  resolved_status             TEXT,                 -- target blueprint's status, lazy-fetched
  resolved_at                 INTEGER,
  is_cross_org                INTEGER NOT NULL DEFAULT 0,
  is_redacted                 INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (blueprint_slug, target_repo, target_slug)
);

CREATE TABLE correlate_allowlist (
  source_org        TEXT NOT NULL,                  -- this repo's org
  permitted_org     TEXT NOT NULL,
  PRIMARY KEY (source_org, permitted_org)
);
```

CHECK constraints enforce the same enum sets as existing Zod schemas — single source of truth in `src/blueprint/db/enums.ts`.

### Custom MCP tools (decision 4)

**Eight** tools: seven primary + one quality-gate validator (`ak_blueprint_validate` added post-codex concern #3). ~450 LOC single TS file with `better-sqlite3` + `@modelcontextprotocol/sdk`. All mutation tools call existing `ak blueprint` CLI handlers (markdown-edit + re-ingest). All output honors summary-first contract per `cmd-execution.md`.

**Tail-hint rate limiting (codex critique #18 — anti-noise):** every tail-hint tracks a last-shown timestamp per `(repo_path, hint_id)` in `.agent/.tail-hint-history.jsonl` (gitignored cache). Hint suppressed if shown in last **7 days** for the same repo. Caps repeated nudges from feeling like ad copy. Override via `--no-hints` flag on individual tool invocations for scripted/CI use.

| Tool | Inputs | Output (summary-first envelope) |
|---|---|---|
| `ak_blueprint_query` | `template_id`, `params` (pre-registered SQL templates only) | `{summary, rows_capped:N, failures, bytes, tokensSaved}` |
| `ak_blueprint_new` (NEW) | `title`, `complexity`, `goal_prompt`, optional `examples_count` | LLM-generation scaffolding bundle: slug, target path, blueprint template, blueprint-scoping rules, N similar completed blueprints as examples. Caller (Claude/Codex) does the LLM call + writes the file. **Two-phase contract:** the bundle includes a `validation_required: true` flag; after the caller writes the file, they MUST call `ak_blueprint_validate <path>` (8th MCP tool, see below) before any `ak_blueprint_promote` will accept the slug. |
| `ak_blueprint_validate` (NEW, post-codex concern #3) | `<path>` | Runs Zod schema + structural validation on a draft blueprint. Returns `{ valid: bool, gaps: [...] }`. Required quality gate before `promote`. Prevents garbage-in-garbage-out from `ak_blueprint_new` drafting bundle. |
| `ak_blueprint_task_next` | `--blueprint <slug>` (optional) | Single task object: id, lane, files, deps satisfied. **Tail-hint:** if Wave 0 has ≥3 ready tasks, append "Consider /pll for parallel execution." |
| `ak_blueprint_task_advance` | `--task-id <id>`, `--to <status>` | Confirmation; edits markdown + re-ingests. **Tail-hint:** when advancing to `done`, append "Run /verify to confirm done-ness before finalizing." |
| `ak_blueprint_promote` | `<slug>`, `<to-state>` | Moves dir, updates frontmatter, re-ingests. **Tail-hint:** on `draft→planned`, append "Run /plan-refine to harden this blueprint." |
| `ak_blueprint_finalize` | `<slug>` | Validates all tasks done, moves draft→completed, writes `completed_at`. **Tail-hint:** if any audit ran with findings in last 7 days, append "Run /verify or `ak audit --fix` before finalizing." |
| `ak_blueprint_depgraph` | `--from <slug>` | DAG (in-repo + permission-aware cross-repo); private targets redacted to hash |

### Pre-registered SQL templates (starter cookbook in `docs/blueprint-db-cookbook.md`)

- `next-ready-task` — what should an agent work on next?
- `blocked-blueprints` — which in-progress blueprints can't proceed?
- `tech-debt-due-soon` — items with `next_review` within 14 days
- `blueprint-risk-profile` — HIGH/CRITICAL risks in active blueprints
- `cross-repo-blocked-on` — what cross-repo deps are unresolved (permission-filtered)
- `cross-org-correlations` — what correlations cross org boundaries (audit support)

### Cold-start rebuild path (decision 5)

`ak blueprint *` commands check for `.agent/.blueprints.db` on first invocation. If missing, lazy-rebuild from `blueprints/**/*.md` + `tech-debt/**/*.md`. Reports `Rebuilt in Xms (N blueprints, M tech-debt items)`. No state-export/import surface. Documented in `docs/cloud-agents.md`:

> Cloud agents (Claude Code Routines, Codex web, etc.) get canonical state for free — `blueprints/` and `tech-debt/` markdown is committed. To use `ak` in a Routine: setup script `pnpm i && npx ak setup`. Any `ak blueprint *` command lazy-rebuilds SQLite from markdown on first call. Never write SQLite back from a Routine — commit the markdown change and open a PR; the next session rebuilds locally from merged markdown.

## D8 — cross-repo correlation with permission/org-aware model (load-bearing)

**Cannot ship cross-repo correlation without all 7 requirements below.** Adding the permission model later is breaking — frontmatter shape changes + any deployed correlation that leaked private slugs would need retroactive redaction.

### The 7 requirements

1. **Org tagging.** Blueprint frontmatter declares `organization: <org>` and `visibility: public|private`. Auto-detected at first ingest via:
   ```bash
   gh repo view --json owner,visibility --jq '{org: .owner.login, vis: .visibility}'
   ```
   Cached on the `blueprints` row. Reconciled on each re-ingest.

2. **Default-deny cross-org.** A correlation from repo A → repo B resolves only if both share an org. `webpresso/agent-kit` → `webpresso/monorepo` works (both `webpresso`). `webpresso/agent-kit` → `acme-corp/product` does not (different orgs).

3. **Explicit cross-org allowlist.** `.agent/correlate.allow.yaml` at consuming repo root:
   ```yaml
   # Both sides must allowlist for correlation to resolve
   permits:
     - acme-corp                    # we permit acme-corp targets
     - other-org
   ```
   Ingester reads this and populates `correlate_allowlist` table. **Both sides must allowlist** — A permits B AND B permits A.

4. **Visibility-aware resolution.** A public repo correlating to a private repo's blueprint:
   - Resolves to redacted reference `private/<sha256-hash-of-slug>`.
   - **Never serializes the private slug into committed markdown.**
   - The depgraph MCP tool returns `target_slug: null, target_slug_hash: <hash>, is_redacted: true` for these.
   - Private→private (both private) works normally — they're in the same trust domain.

5. **Workspace scoping.** `~/.agent/workspace.yaml` (user-global, gitignored — local-only) declares local repos for correlation lookups:
   ```yaml
   repos:
     - path: ~/repos/webpresso/agent-kit
     - path: ~/repos/webpresso/monorepo
     - path: ~/repos/ozby/ingest-lens
   ```
   Cloud agents (Routines) without this file fall back to git-clonable URLs declared per-blueprint in frontmatter.

6. **Audit gate.** `ak audit cross-repo-correlation` (CI-suitable):
   - Verifies no public blueprint's committed markdown references a private slug.
   - Verifies no correlation declared without allowlist when cross-org.
   - **FAILS LOUD on leak detection — does NOT auto-mutate.** Per codex critique #17 (security): security audits should reject, not silently rewrite. Mutation belongs in an explicit operator-invoked `ak fix cross-repo-leak <slug>` verb that requires reading the proposed change before applying. The audit's job is to detect; remediation is a separate command requiring intent.

7. **3rd-party fit.** Public-extraction requirement: model works for any adopter. acme-corp configures their own multi-repo workspace; webpresso is one instance.

### Cross-repo dependency declaration syntax

Blueprint frontmatter gains a `cross_repo_depends_on` field:

```yaml
cross_repo_depends_on:
  - repo: webpresso/agent-kit
    slug: agent-asset-compiler-multi-runtime
    require_status: completed
  - repo: webpresso/monorepo
    slug: <slug>                  # leaks if monorepo is private and current repo is public
```

Audit rewrites the second entry to `slug: private/<hash>` if leak detected. Author must intervene — either move the source repo to private, allowlist explicitly, or use the hash form directly.

## Edge cases

| ID | Severity | Case | Mitigation |
|---|---|---|---|
| B1 | HIGH | Two agents call `ak_blueprint_task_advance` concurrently for same task | better-sqlite3 transactions serializable; markdown write atomic via tmp+rename; second sees post-state, no-ops or fails with stale-state error |
| B2 | HIGH | Markdown blueprint has parse error (malformed YAML, wrong table syntax) | Ingester logs error with file path + line; skips file; existing row flagged in `parse_errors` table; downstream queries filter on parse status |
| B3 | HIGH | **D8 leak attempt** — public repo's committed markdown references a private slug | `ak audit cross-repo-correlation` flags + rewrites to redacted hash; CI fails until human intervention |
| B4 | MEDIUM | Blueprint moves dir on disk (draft→planned) outside `ak blueprint promote` | Watcher / cold-start re-ingest sees the move; status recomputed from directory; no data lost |
| B5 | MEDIUM | Consumer runs v0.13.0 ingester on 200+ blueprints | Cold rebuild target <2s for 500 blueprints; if exceeded, profile per `no-timeout-as-fix.md` |
| B6 | MEDIUM | D8 allowlist exists locally but not committed; cloud agent doesn't see it | `correlate.allow.yaml` is committed by design; gitignore audit verifies it's tracked |
| B7 | MEDIUM | `gh repo view` fails (offline, not authed, repo deleted) for visibility auto-detect | Fall back to `visibility: private` (most-conservative default); warn user; document in README |
| B8 | LOW | Schema version mismatch when consumer is on v0.13.1 (added a column) | `schema_version` table; if older, migrations run forward; never backward |
| B9 | LOW | Pre-registered SQL template returns >1000 rows | Cap at 1000 in tool; `--more` token for paging (deferred to v0.13.x if demand surfaces) |
| B10 | LOW | Datasette not installed when `ak blueprint browse` invoked | Clear error message: "install via `pip install datasette`"; non-blocking — the SQL store works without it |

## Risks

| ID | Severity | Risk | Mitigation |
|---|---|---|---|
| BR1 | HIGH | Replacing regex `ak blueprint audit` adds regression risk | Alpha gate: ship v0.13.0-alpha behind `AK_USE_SQL_AUDITS=1` env; both audits must agree on test corpus before flipping; full delete at v0.13.0 GA |
| BR2 | HIGH | D8 permission model is novel; consumer misconfiguration could still leak | Three layers of defense: default-deny + explicit allowlist + audit-gate-in-CI. Plus documented worked examples in `docs/cross-repo-correlation.md`. Plus dry-run mode for `ak audit cross-repo-correlation`. |
| BR3 | MEDIUM | better-sqlite3 prebuilt binaries occasionally miss platforms (Alpine musl, M3 transitions) | node-gyp fallback; CI tests macOS Intel+ARM + Ubuntu |
| BR4 | MEDIUM | Blueprint markdown parser is bespoke — fragile to format drift | Extensive fixture corpus (every existing completed blueprint as regression); breaking template changes require explicit blueprint template version bump |
| BR5 | MEDIUM | Direct SQL via `ak blueprint db query --raw` (shell-only escape hatch) lets agents fingerprint schema | Schema versioning exposed via `ak_blueprint_query template=schema-version`; cookbook queries versioned alongside |
| BR6 | LOW | Datasette adds optional Python dep | Non-blocking; documented as optional; agent-kit core works without it |

## Tasks (~10 tasks)

### Wave 0 — schema + parser foundations (parallel)

#### Task 1.1: SQLite setup + schema migrations + D8 tables
**Status:** todo. **Depends:** None.

Create `src/blueprint/db/{connection,migrations/run,migrations/0001_seed.sql,enums}.ts`. Schema as specified above including D8 tables. Connection wrapper exposes parameterized-only query interface.

**Acceptance:** Migrations idempotent; 1000 inserts under 200ms bench.

#### Task 1.2: Blueprint markdown parser + tech-debt parser + gstack-vocabulary tolerance
**Status:** todo. **Depends:** None.

`src/blueprint/parser/{blueprint,tech-debt,conventions.md,fixtures/}.ts`. Reuses Zod from `tech-debt/schema.ts`. Auto-detects `organization` + `visibility` via `gh repo view` cached lookup. All 13 completed blueprints + 3 drafts parse cleanly (regression).

**Plus:** acceptance-criteria checkbox lines that reference gstack skills (e.g., `- [ ] /qa passes for the new route`, `- [ ] /design-review approves`) are parsed without warning. Recognized gstack skill names treated as text — no validation, no link resolution, no coupling. Pure markdown.

**Acceptance:** Snapshot tests cover regression; computed `next_review` matches existing tech-debt computed values; acceptance criteria mentioning `/qa`, `/design-review`, `/investigate`, `/review`, `/ship` parse cleanly with no warnings emitted.

#### Task 1.3: Gitignore + workspace.yaml + correlate.allow.yaml templates
**Status:** todo. **Depends:** None.

Extend `ak setup --with base-kit`. Gitignore adds `.agent/.blueprints.db`, `.agent/.blueprints.lock`. **Commits** `.agent/correlate.allow.yaml` (template empty `permits: []`). Auto-creates `~/.agent/workspace.yaml` (gitignored).

**Acceptance:** `ak audit gitignore-agent-surfaces` accepts the new block.

### Wave 1 — ingester + custom MCP server

#### Task 2.1: SQL ingester + cold-start rebuild
**Status:** todo. **Depends:** Tasks 1.1, 1.2.

`src/blueprint/db/ingester.ts`. UPSERT-with-content-hash gate. `src/blueprint/db/cold-start.ts` — lazy rebuild from markdown when `.blueprints.db` missing. Reports `Rebuilt in Xms (N blueprints, M tech-debt items)`.

**Acceptance:** Transactional; idempotent; cold-rebuild target <2s for 500 blueprints.

#### Task 2.2: Custom MCP server (~300 LOC) + 7th tool `ak_blueprint_new` + skill-chain tail-hints
**Status:** todo. **Depends:** Task 2.1.

Single TS file `src/mcp/blueprint-server.ts`. **Seven** tools per the table above (was six; added `ak_blueprint_new` per user directive for LLM-based blueprint creation). Mutations call existing `ak blueprint` CLI handlers (markdown-edit-then-reingest invariant). All output summary-first JSON envelope (`failures`, `tier`, `bytes`, `tokensSaved`). Pre-registered template set in `_query-templates.ts`.

**`ak_blueprint_new` + `ak_blueprint_validate` design (LLM-generation scaffolding + post-codex quality gate):**

The MCP tool does NOT call an LLM directly. Agent-kit stays credential-free. Instead, the tool returns a structured "drafting bundle" that the calling agent (Claude/Codex/Cursor) uses to generate the blueprint content itself, then writes the file via its own Write tool. **After write, the caller MUST invoke `ak_blueprint_validate <path>` before `ak_blueprint_promote` will accept the slug** — this closes the post-codex concern #3 quality-gate gap. Validation runs the same Zod schemas + structural checks the parser does, surfacing specific gaps (missing frontmatter, no tasks, missing acceptance criteria, malformed dependency refs) so the caller can iterate. Bundle includes:

- `target_path`: `blueprints/draft/<slugified-title>/_overview.md`
- `template`: the canonical blueprint template (frontmatter + section skeleton)
- `rules_context`: contents of `.agent/rules/blueprint-scoping.md` (product-wedge anchor requirements)
- `examples`: N similar completed blueprints (default 3) from `blueprints/completed/`, selected by tag/complexity match to the user's `goal_prompt`
- `lifecycle_advice`: one-line reminders of the typical workflow — "After creating: `/plan-refine` to harden; `/plan-eng-review` to validate architecture; `ak_blueprint_promote draft→planned` when ready; `/pll` for parallel execution; `/verify` before finalize"

**Tail-hints (per user directive on skill chaining):** Each of the 7 tools appends ONE advisory line to its summary output when a related skill would help. Static text, no skill invocation, no MCP coupling. Hints documented in `src/mcp/_tail-hints.ts` constants.

**Files:**
- Modify: `src/mcp/blueprint-server.ts`
- Create: `src/mcp/_tail-hints.ts` (skill-chain advisory text constants)
- Create: `src/mcp/_drafting-bundle.ts` (assembles the `ak_blueprint_new` response)

**Acceptance:**
- [ ] ≤450 LOC including imports for the 8-tool server (7 primary + `ak_blueprint_validate` quality gate)
- [ ] Integration test confirms tool output stays under N tokens including tail-hints
- [ ] Mutation paths edit markdown not SQL
- [ ] `ak_blueprint_new` returns a deterministic bundle (same `goal_prompt` → same examples picked + same template)
- [ ] **`ak_blueprint_promote` REFUSES** any slug whose `_overview.md` hasn't passed `ak_blueprint_validate` since last write. Closes post-codex concern #3 quality gate.
- [ ] `ak_blueprint_validate` returns structured gaps (missing frontmatter fields, no tasks, malformed dependency refs, missing acceptance criteria) so caller can iterate
- [ ] No LLM credentials required by agent-kit itself
- [ ] All 4 skill-chain tail-hints fire only when the relevant condition holds (Wave 0 ≥3 ready; advancing to done; promoting draft→planned; audit findings in last 7d)
- [ ] Tail-hint rate-limit honored: 7-day suppression per `(repo, hint_id)` per `.agent/.tail-hint-history.jsonl`

#### Task 2.3: Pre-registered SQL templates + cookbook
**Status:** todo. **Depends:** Task 2.1.

`src/blueprint/db/templates.ts` + `docs/blueprint-db-cookbook.md`. 6+ templates including the D8 cross-repo ones.

**Acceptance:** Each template parameter-validated; output schema enforced.

### Wave 2 — CLI verbs + audits + D8

#### Task 3.1: `ak blueprint db` CLI verbs
**Status:** todo. **Depends:** Task 2.1.

`build|query|verify|browse`. `browse` wraps `datasette serve .agent/.blueprints.db --metadata <generated>` (D5 cherry-pick). Clear error if Datasette absent.

**Acceptance:** All four subcommands documented; `browse` works on machines with Datasette installed.

---

#### Task 3.1b: `ak blueprint export --format spec-kit` (DRY KISS SOLID emitter)
**Status:** todo. **Depends:** Task 1.2 (blueprint parser), Task 2.1 (ingester for cross-blueprint refs).

One-way export only. Reads canonical blueprint markdown via the parser (no re-read, no duplication), transforms to github/spec-kit's 4-file structure (`spec.md`, `plan.md`, `tasks.md`, `constitution.md`), writes to a chosen output directory. **No fields added to blueprint frontmatter format.** The export is a derived view.

**Design constraints (per `DRY KISS SOLID`):**

- **DRY:** Single transformation pipeline. `blueprintToSpecKit(parsed: ParsedBlueprint): SpecKitBundle`. Blueprint content is the single source — every field in the spec-kit output traces back to a blueprint field through one mapping table in `src/blueprint/export/spec-kit/_field-map.ts`. No string duplication, no manual re-typing of blueprint sections in the export.
- **KISS:** No roundtrip (spec-kit → blueprint is out of scope; reverse import only goes through `ak blueprint import` which already exists for legacy formats). No fields added to blueprint format. No watch mode — explicit invocation only.
- **SOLID:** Single-responsibility per file emitter. Four pure functions:
  - `emitSpec(parsed) → spec.md` — Feature Specification (User Scenarios, Requirements, Review checklist)
  - `emitPlan(parsed) → plan.md` — Implementation Plan referencing spec.md
  - `emitTasks(parsed) → tasks.md` — TDD-ordered `- [ ] T001` checklist with `[P]` parallel markers (from blueprint's existing Wave structure)
  - `emitConstitution(parsed) → constitution.md` — repo-level principles (sourced from VISION.md + workspace CLAUDE.md per a deterministic template)
- Each emitter is independently testable; the orchestrator (`blueprintToSpecKit`) composes them but doesn't re-derive their internals.

**Why this matters:** spec-kit ships as Agent Skill to Claude Code / Codex CLI / Cursor CLI / Gemini CLI / OpenCode + 25 others (95k stars, MIT, GitHub-owned, verified 2026-05-11). A 3rd-party adopter consuming our public blueprints via spec-kit can then run `/speckit.implement` natively. Cross-tool interop at zero blueprint-format cost.

**Files:**
- Create: `src/blueprint/export/spec-kit/{index,_field-map,spec,plan,tasks,constitution}.ts`
- Create: `src/blueprint/export/spec-kit/*.test.ts` (one per emitter — SOLID)
- Create: `src/blueprint/export/spec-kit/__fixtures__/{input,expected}/` (golden-file tests)

**Steps (TDD):**
1. Pick one completed blueprint (`elegance-pass-2026/_overview.md`) as the fixture input.
2. Hand-derive the expected spec-kit 4-file output. Commit as `__fixtures__/expected/elegance-pass-2026/`.
3. Implement `emitSpec` → matches expected `spec.md`.
4. Implement `emitPlan` → matches expected `plan.md`.
5. Implement `emitTasks` → matches expected `tasks.md`. Use blueprint's Wave structure for `[P]` parallel markers.
6. Implement `emitConstitution` → reads VISION.md + CLAUDE.md template, deterministic.
7. Implement `blueprintToSpecKit` orchestrator. Composition is the only logic.

**Acceptance:**
- [ ] Four pure functions, each <40 LOC (KISS)
- [ ] Golden-file tests for all 13 completed blueprints + 3 drafts pass byte-identical
- [ ] No string literals duplicated across emitters (DRY) — shared headers/templates in `_field-map.ts`
- [ ] Each emitter testable in isolation (SOLID)
- [ ] Output validates against spec-kit's templates at `github/spec-kit@main/.specify/templates/`
- [ ] Round-trip via 3rd-party spec-kit-aware tool (e.g., Cursor with spec-kit installed) reads our export and recognizes the 4 files as valid spec-kit input

#### Task 3.2: SQL-backed audits (alpha gate via env var)
**Status:** todo. **Depends:** Task 2.1.

Rewrite `ak blueprint audit` to query SQL. Three new audit subcommands:
- `blueprint-db-consistency`
- `blueprint-lifecycle` (rewrite of existing)
- `tech-debt-cadence`

Alpha gate per BR1: `AK_USE_SQL_AUDITS=1` env flips between old regex + new SQL until parity confirmed.

**Acceptance:** All existing completed blueprints pass new audits (verifying no false positives); regression test against test corpus.

#### Task 3.3: Mutation verbs
**Status:** todo. **Depends:** Task 2.1.

`ak blueprint task advance <id> --to <status>`, `ak blueprint promote <slug> <to-state>`, `ak blueprint finalize <slug>`. Each: parses canonical markdown, computes target, writes `.tmp`, atomic rename, triggers re-ingest.

**Acceptance:** Round-trip cleanly; atomic write semantics; idempotent re-runs.

#### Task 3.4: D8 — cross-repo correlation + permission model + audit
**Status:** todo. **Depends:** Tasks 2.1, 2.2, 3.2.

Implement all 7 D8 requirements. Files:
- `src/blueprint/cross-repo/resolver.ts` — joins SQL with workspace.yaml; redacts cross-visibility
- `src/blueprint/cross-repo/allowlist.ts` — reads correlate.allow.yaml; both-sides check
- `src/cli/commands/audit/cross-repo-correlation.ts` — CI-suitable audit + autofix to hash form
- Schema extensions to blueprint parser (parse new `organization`, `visibility`, `cross_repo_depends_on` fields)
- `docs/cross-repo-correlation.md` — worked examples + leak failure modes

**Acceptance:** Fixture with public→private leak triggers audit failure; allowlist works both-sides; redacted hash form resolves to "exists" without leaking slug; tested across 4 fixture orgs.

### Wave 3 — release

#### Task 4.1: Cut agent-kit v0.13.0
**Status:** todo. **Depends:** All Wave 2 + v0.12.0 shipped.

Bump version. CHANGELOG breaking-change callout: new SQL store, custom MCP, rewritten `ak blueprint audit`, deleted regex code, D8 cross-repo correlation.

**Acceptance:** CHANGELOG names compiler v0.11.0 + audit-slice v0.12.0 as prerequisites; no regex audit code remains in `src/`.

### Wave 4 — consumer rollouts (parallel)

#### Task 5.1: monorepo + ingest-lens adopt v0.13.0
**Status:** todo. **Depends:** Task 4.1.

Bump dep. `ak blueprint db build`. Run new audits. If `cross-repo-correlation` flags leaks, fix and re-run. Verify `ak blueprint browse` works (Datasette installed). Commit with lore-protocol message.

**Acceptance:** All audits pass; cross-repo correlation resolves webpresso workspace (agent-kit ↔ monorepo ↔ ingest-lens) without leaks.

#### Task 5.2: Docs + agent-runtime guidance
**Status:** todo. **Depends:** Task 4.1.

agent-kit README new section "Blueprint structured store — SQL for agents". Cookbook with 6+ templates. `docs/cross-repo-correlation.md` with worked examples + leak failure modes. `docs/cloud-agents.md` with rebuild-from-markdown pattern.

**Acceptance:** Cookbook covers ≥6 templates; cross-repo docs cover all 7 D8 requirements with examples; cloud-agents docs explain Routines flow.

## Quick Reference

| Wave | Tasks | Parallel agents | Effort (CC) |
|---|---|---|---|
| Wave 0 | 1.1, 1.2, 1.3 | 3 | ~half day |
| Wave 1 | 2.1, 2.2, 2.3 | 3 (2.1 first) | ~1-1.5 days |
| Wave 2 | 3.1, 3.1b, 3.2, 3.3, 3.4 | 5 (3.4 is the biggest) | ~2.5 days |
| Wave 3 | 4.1 | 1 | ~2 hours |
| Wave 4 | 5.1, 5.2 | 2 | ~half day |
| **Total** | **12 tasks** | | **~5-6 days CC / ~4 weeks human** (revised per codex DX critique #14) |

Parallelization score: A. Added Task 3.1b (spec-kit export, DRY KISS SOLID). **Timeline revised upward** per DX-review D11 + codex critique #14: cross-repo correlation (D8 with 7 permission requirements), SQLite migrations, markdown mutation, custom MCP w/ 7 tools, audits, and docs are realistically ~4 human-weeks not ~2. CC parallel-execution time also bumped to ~5-6 days from 3.5-4.5.

## Resolution log

1. ✅ **Custom MCP vs `mcp-server-sqlite`** — custom (~300 LOC); mcp-server-sqlite is archived + violates summary-first contract
2. ✅ **State export/import for Routines** — skipped; document rebuild-from-markdown (cold-start path)
3. ✅ **Datasette `ak blueprint browse` (D5)** — yes; lowest-effort cherry-pick
4. ✅ **Cross-repo correlation (D8)** — yes, with all 7 permission/org-aware requirements as hard acceptance criteria

Blueprint ready to promote `draft/` → `planned/`.

## Cross-blueprint vision alignment

| Layer | Blueprint | Stores | Operates on | Idiom |
|---|---|---|---|---|
| Distribution (v0.11.0) | `agent-asset-compiler-multi-runtime` | Filesystem | Skills, commands, agents, memory | Markdown + rulesync + plugin manifests |
| Detection (v0.12.0) | `agent-knowledge-graph-mcp` (minimal slice) | Audit logs only | Drift, broken refs, size budgets | CLI audits + tech-debt lifecycle |
| State (v0.13.0) | `blueprint-structured-store` | SQLite + permission-aware cross-repo | Blueprints, tasks, risks, tech-debt, correlations | SQL templates via custom MCP |

All three: markdown is canonical, embedded DBs are derived, MCP tools answer agent questions in the right idiom for the question shape. Cross-repo coordination respects org/project/visibility boundaries by default.
