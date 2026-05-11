---
type: research
title: Agent-asset infrastructure landscape — May 2026 research synthesis
date: 2026-05-11
last_updated: 2026-05-11
related_blueprints:
  - agent-asset-compiler-multi-runtime
  - agent-knowledge-graph-mcp
  - blueprint-structured-store
status: research-complete
recommendation: revise-all-three-blueprints
---

# Agent-asset infrastructure landscape — May 2026

Five parallel research agents canvassed the multi-IDE agent ecosystem on 2026-05-11. The substrate consolidated dramatically since Dec 2025; the integration layer (blueprint lifecycle, audits, KG-over-agent-assets) is still fragmented. This note captures the findings and the recommended revisions to each of the three drafted blueprints.

## TL;DR

| Blueprint | Original verdict | New verdict | Why |
|---|---|---|---|
| `agent-asset-compiler-multi-runtime` | Build (custom 6-runtime compiler) | **Revise — ~70% scope reduction** | `dyoshikawa/rulesync` (175k weekly npm dl, MIT, daily commits) covers ~95% of the per-runtime emission. Agent Skills standard (Anthropic, Dec 2025) means same `SKILL.md` runs in 26+ runtimes natively. Cursor reads `.claude/skills/` and `.codex/skills/` directly. |
| `agent-knowledge-graph-mcp` | Build (Kuzu + remark + chokidar) | **Revise — partial-replace + 60-day watch** | Kuzu + remark + chokidar core stays. **Replace** DIY ref-resolver with `remark-validate-links`. **Vendor simhash** (npm packages stale + unlicensed). **Shelve graph-watcher 60 days** to see if GitNexus's pattern (same architecture, source-code focus) extends to agent assets. |
| `blueprint-structured-store` | Build (better-sqlite3 + custom MCP) | **Revise — drop custom MCP** | Replace `better-sqlite3` + custom MCP tools with Anthropic's reference `mcp-server-sqlite` (generic SQLite-over-MCP). Adds free Datasette UI. Adds `state export/import` commands for Routines (cloud-hosted Claude Code, Apr 2026). `claude-task-master` is **not** a serious replacement — wrong shape. |

## Five most consequential 60-day findings

### 1. Agent Skills became an open standard (Anthropic, Dec 18 2025)

- **Spec:** [agentskills.io](https://agentskills.io) + [github.com/agentskills/agentskills](https://github.com/agentskills/agentskills) + [github.com/anthropics/skills](https://github.com/anthropics/skills)
- **Adoption:** Claude Code, Codex CLI, Gemini CLI, Cursor, VS Code/Copilot (VS 2026 18.5, Apr 2026 — [MS Learn](https://learn.microsoft.com/en-us/visualstudio/ide/copilot-agent-skills)), JetBrains Junie, Block Goose, OpenCode (per [opencode.ai/docs/skills](https://opencode.ai/docs/skills)), Google released 13 official skills under Apache 2.0 at Cloud Next ([April 28 2026](https://medium.com/@meshuggah22/google-just-shipped-13-agent-skills-i-plugged-them-into-gemini-cli-and-watched-code-quality-jump-988e54aacdbe)).
- **Impact:** Same `SKILL.md` with `name` + `description` frontmatter runs unchanged across the entire matrix. Cursor 3.0+ explicitly reads `.claude/skills/`, `.codex/skills/`, `.cursor/skills/`, and `.agents/skills/` ([cursor.com/docs/skills.md](https://cursor.com/docs/skills.md)).
- **Net:** Compiler's per-runtime SKILL.md transforms are largely **unnecessary** — drop them.

### 2. `dyoshikawa/rulesync` is the upstream multi-runtime asset compiler

- **URL/state:** [github.com/dyoshikawa/rulesync](https://github.com/dyoshikawa/rulesync), npm `rulesync@8.15.1`, **175,542 weekly downloads** (week of 2026-05-04), MIT, last commit `ba590fd` **2026-05-11T08:49Z** (today, multiple external contributors).
- **Coverage:** All six runtimes we target (Claude Code, Codex, Cursor, Windsurf, Gemini, OpenCode) plus 11 others (Copilot, Cline, Kilo, Junie, AugmentCode, Warp, Replit, Zed, Goose, Factory Droid, Pi, deepagents). Project + global modes. Per-target generators in `src/features/{rules,commands,skills}/` use `smol-toml`, `gray-matter`, `js-yaml`, `jsonc-parser`. Includes `rulesync import`, `rulesync convert`, `rulesync fetch`, dry-run, programmatic API, embedded MCP server (`fastmcp@3.34.0`).
- **Risks:** Single-maintainer truck factor (~70% commits by dyoshikawa), 15+ minor releases in recent weeks (velocity ≠ stability). Mitigated by MIT + small surface + active external contributors.
- **Net:** **Take `rulesync` as a runtime dep.** Wrap it as `ak compile` → `rulesync generate --targets <list>`. Pin to `^8.15`. Keep agent-kit's value-add layered on top (lifecycle dirs, audits, AGENTS.md merger).

### 3. GitNexus validates KG-over-repo architecture (April 24 2026)

- **URL:** [github.com/abhigyanpatwari/GitNexus](https://github.com/abhigyanpatwari/GitNexus) — MCP-native KG engine, Kuzu/LadybugDB, MCP server + Claude Code skills + PreToolUse/PostToolUse reindex hooks. ISC/MIT, single named maintainer, multiple community forks.
- **Domain:** Indexes **source code**, not `.agent/` assets — not a drop-in for blueprint #2.
- **Impact:** Confirms Kuzu + MCP + commit-hooks architecture is the right shape. Reasonable strategy: **shelve blueprint #2 for 60 days**; either extend GitNexus with an asset-graph mode, or ship our own with the validated pattern.

### 4. Plugin marketplaces are the new distribution layer

- **Claude Code:** plugin marketplace GA Feb 2026, **4,200+ skills + 770+ MCP servers indexed**. `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` ([docs.claude.com/en/docs/claude-code/plugins](https://docs.claude.com/en/docs/claude-code/plugins), [claudemarketplaces.com](https://claudemarketplaces.com/)).
- **Codex CLI:** `.codex-plugin/plugin.json` with skills/MCP/apps/hooks; git-subdir/ref/sha sourcing; `$plugin-creator` scaffolder ([developers.openai.com/codex/plugins](https://developers.openai.com/codex/plugins)).
- **Cursor:** Official Marketplace + community `cursor.directory` + Team Marketplaces (SCIM, Enterprise) with `.cursor-plugin/plugin.json` ([cursor.com/docs/plugins.md](https://cursor.com/docs/plugins.md)).
- **Gemini CLI:** Extensions v0.4.0 GA, `gemini-extension.json` ([google-gemini.github.io/gemini-cli/docs/extensions/](https://google-gemini.github.io/gemini-cli/docs/extensions/)), gallery at [geminicli.com/extensions](https://geminicli.com/extensions/browse/).
- **Windsurf, OpenCode:** No plugin marketplace for rules/skills. Windsurf has MCP marketplace only. OpenCode plugins are npm hooks (not asset distribution).
- **Net:** For 4 of 6 IDEs, the **plugin marketplace replaces file-writing entirely**. Pivot the compiler blueprint to "publish 4 plugins + 1 MCP server + filesystem fallback for Windsurf/OpenCode."

### 5. Claude Code Routines (April 14 2026) introduces cloud-state-sync requirement

- **What:** Cloud-hosted recurring Claude Code agent runs. Not file-system-local.
- **Impact on blueprint #3:** Local SQLite at `.agent/.blueprints.db` won't sync to cloud-run agents. Need `ak blueprint state export <path>` and `ak blueprint state import <path>` so cloud sessions can rehydrate.

## Secondary findings worth one line each

- **lychee** (rust, Apache-2.0, active) and **remark-validate-links** (node, MIT, quieter) — either can replace blueprint #2's DIY ref-resolver. Recommend **remark-validate-links** for Node-native simplicity.
- **simhash npm packages** (`simhash@0.1.0`, `node-simhash@0.1.0`) — both **`license: null` and stale since 2022-06**. Don't use. Vendor ~80 lines of simhash, or swap for `tree-sitter-markdown` AST diff.
- **mcp-server-sqlite** ([github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)) — generic SQLite-over-MCP. Replaces blueprint #3's custom MCP tool surface. Pairs with `datasette` for free read-only browser UI (`ak blueprint browse`).
- **Cognee, Graphiti, Neo4j MCP** — all rejected (LLM-driven, server-required, wrong domain).
- **Cursor Plugins extension API** — `vscode.cursor.plugins.registerPath()` lets an extension register plugin dirs dynamically (cursor.com/docs).
- **claude-task-master** v0.43.1 — wrong shape (single tasks.json, AI-PRD-driven, no lifecycle dirs, no tech-debt, MIT-with-Commons-Clause). Not a replacement.
- **dendronhq/dendron** — effectively dormant in 2026; schema engine never extracted as a library.
- **SurrealDB, Memgraph, FalkorDB** — all BSL or BSL-ish; not appropriate for OSS bundling.
- **GitHub Issues / Linear / Notion MCP** — vendor lock-in, network dep, no offline; non-starter for offline-first agent-kit.
- **`trick77/agents-md-sync`** — composes AGENTS.md from partials. Closest analog to our memory-merger but tiny + single contributor. Borrow patterns, don't take a dep.
- **No AGENTS.md spec working group exists.** [agents.md](https://agents.md/) is a description site, not a spec.

## Decision matrix per blueprint

### Blueprint #1 — `agent-asset-compiler-multi-runtime`

**Revise. Reduce scope ~70%.**

Keep:
- Canonical `.agent/{skills,commands,agents,memory}/` layout (still ours to define).
- **AGENTS.md section-keyed merger + `memory.merge.yaml` directives + provenance JSON** (genuinely novel; no upstream).
- Lifecycle integration with blueprints + tech-debt.
- Gitignore best-practices template.
- Migration story (`ak skills migrate-legacy` deletes legacy artifacts).

Delete:
- Custom per-runtime emitters (Claude, Codex, OpenCode, Cursor, Windsurf, Gemini adapter files). Replace with thin `rulesync` invocation.
- Bespoke MDC, TOML, MD-passthrough writers — `rulesync` ships all of these.
- The "no backwards compat" symlink → copy logic is mostly moot; rulesync owns the write semantics.

New:
- **Three plugin-manifest emitters** for Claude/Codex/Cursor (plus one Gemini extension manifest). Each emits a small JSON pointing at the shared `skills/` tree. The plugin marketplace path makes consumers install via `/plugin install` instead of `ak setup` running file writes.
- **Filesystem fallback** path only for Windsurf (no plugin support) + OpenCode agents (markdown-only). Use `rulesync` here.
- **`state export/import`** for cloud-Routines support (Finding #5).

Open: do we ship as `@webpresso/agent-kit` (one repo, multiple manifests) or `@webpresso/agent-kit-{claude,codex,cursor}-plugin` (separate npm packages)? Plugin marketplaces want git URLs more than npm names, so multi-repo may not be necessary.

### Blueprint #2 — `agent-knowledge-graph-mcp`

**Revise + shelve 60 days.**

Keep (when un-shelved):
- Kuzu + remark + chokidar core.
- Schema for cross-asset edges (Skill → Rule → Blueprint → TechDebtItem).
- Codex 8000-char budget enforcement.
- Tech-debt auto-filing from KG findings.

Delete:
- DIY ref-resolver — use **`remark-validate-links`** instead.
- DIY simhash from npm — **vendor ~80 lines** in-tree. Stale-and-unlicensed npm packages are a no-go.

New:
- **60-day watch on GitNexus.** Re-evaluate 2026-07-11: if GitNexus is alive + stable, fork/extend it for `.agent/` domain. If dormant, ship blueprint as-drafted but with simplified ref-resolver.

### Blueprint #3 — `blueprint-structured-store`

**Revise. Drop custom MCP. Add state-sync.**

Keep:
- Schema (blueprints, tasks, risks, edge_cases, tech_debt_items, junctions).
- Markdown-canonical / SQL-derived contract.
- AST-based blueprint parser (remark + gfm).
- Replace regex-based `ak blueprint audit` with SQL-backed audits.

Delete:
- **Custom MCP tools** (`ak_blueprint_query`, `task_next`, `task_advance`, etc.). Use Anthropic's reference `mcp-server-sqlite` pointed at the projection file.
- **`better-sqlite3` as the only client.** Still emit SQLite, but consumer wires the generic MCP server.

New:
- **`ak blueprint state export <path>` + `import <path>`** for Routines cloud-state-sync (Finding #5).
- **`ak blueprint browse`** spawning `datasette` for a free read-only browser UI.
- Pre-registered SQL templates ship as a `templates/*.sql` directory consumers can copy-paste into their queries.

## Risks of revision

| Risk | Severity | Mitigation |
|---|---|---|
| Take `rulesync` as a hard dep → upstream breakage stalls our releases | HIGH | Pin to `^8.15`; CI smoke roundtrips known fixtures; small fork-cost if abandoned (MIT, single file) |
| Plugin marketplace path requires consumer behavior change (`/plugin install` instead of `ak setup`) | MEDIUM | Document migration; keep `ak setup` as the wrapper that runs the right install command per IDE |
| GitNexus shelf-time blocks blueprint #2's value-add (drift detection, tech-debt auto-filing) for 60 days | MEDIUM | Ship a minimal v0.12.0-alpha with `remark-validate-links` only (no graph); revisit graph after 60 days |
| Replacing custom MCP with generic mcp-server-sqlite means agents need to know SQL templates instead of named tools | LOW | Document the templates in `docs/blueprint-db-cookbook.md`; agents discover via MCP resources |
| Cloud Routines state-sync introduces a new failure mode (drift between cloud and local DB) | MEDIUM | Sync is one-shot, manual, explicit (export/import verbs). No background sync. |

## Net effect on scope

Original blueprint task counts: 25 + 15 + 14 = 54 tasks.

Revised estimates:
- #1 (rulesync wrap + plugin manifests + AGENTS.md merger + filesystem fallback): ~10 tasks (was 25; cut ~60%).
- #2 (Kuzu + remark + remark-validate-links + chokidar + MCP server; shelved 60 days): ~9 tasks (was 15; cut ~40%).
- #3 (SQLite emitter + AST parser + mcp-server-sqlite wiring + audits + state sync): ~10 tasks (was 14; cut ~30%).

**Revised total: ~29 tasks across 3 blueprints** (was 54 → ~46% reduction). Two of the three blueprints can ship in v0.11.0 + v0.13.0 (smaller, faster); blueprint #2 ships at v0.12.0 or shelves to v0.13.0.

## Next actions (proposed)

1. **Promote a decision** on the rulesync adoption (kills the biggest chunk of bespoke code).
2. **Promote a decision** on the 60-day shelf for blueprint #2 (GitNexus watch).
3. **Promote a decision** on plugin-marketplace pivot vs file-compile-and-write (or hybrid for Windsurf/OpenCode).
4. **Rewrite all three `_overview.md` files** to incorporate these decisions before promoting `draft/` → `planned/`.
5. **File this research note** at `docs/research/2026-05-11-agent-asset-infrastructure-landscape.md` (this file) and link from each blueprint's `_overview.md`.

## Sources

All sources consulted by the research team are cited inline. Key roots:

- [github.com/dyoshikawa/rulesync](https://github.com/dyoshikawa/rulesync) — multi-runtime compiler
- [agentskills.io](https://agentskills.io/) + [github.com/anthropics/skills](https://github.com/anthropics/skills) — Agent Skills standard
- [github.com/abhigyanpatwari/GitNexus](https://github.com/abhigyanpatwari/GitNexus) — MCP-native code KG (validates blueprint #2 architecture)
- [docs.claude.com/en/docs/claude-code/plugins](https://docs.claude.com/en/docs/claude-code/plugins), [developers.openai.com/codex/plugins](https://developers.openai.com/codex/plugins), [cursor.com/docs/plugins.md](https://cursor.com/docs/plugins.md), [opencode.ai/docs/plugins](https://opencode.ai/docs/plugins), [google-gemini.github.io/gemini-cli/docs/extensions/](https://google-gemini.github.io/gemini-cli/docs/extensions/) — IDE plugin systems
- [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) — MCP reference servers (incl. mcp-server-sqlite)
- [github.com/lycheeverse/lychee](https://github.com/lycheeverse/lychee), [github.com/remarkjs/remark-validate-links](https://github.com/remarkjs/remark-validate-links) — ref resolvers
- [github.com/eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master) — investigated, rejected as replacement
- [github.com/safishamsi/graphify](https://github.com/safishamsi/graphify) — earlier evaluation, status unchanged
