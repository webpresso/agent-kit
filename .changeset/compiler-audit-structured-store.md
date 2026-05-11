---
"@webpresso/agent-kit": minor
---

# v0.15.0 — Agent-asset compiler, audit slice, blueprint structured store

## New features

### Agent-asset compiler (multi-runtime)

- `ak compile` — thin wrapper over `rulesync generate --targets <list>` with O_EXCL lock, content-hash idempotency, and SHA-256 source hash manifest (`.agent/.compile-manifest.json`)
- Four plugin manifest emitters: Claude Code (`.claude-plugin/plugin.json`), Codex (`.codex-plugin/`), Cursor (`.cursor-plugin/`), Gemini (`gemini-extension.json`)
- AGENTS.md section-keyed merger with `memory.merge.yaml` directives (replace/append/prepend/delete/rotate); provenance JSON; rotation safeguards (opt-in, shallow-clone detection, dry-run)
- `ak setup --with example-skill` — scaffolds `hello-webpresso/SKILL.md` and runs `ak compile` as final step
- `ak skills orphans --fix` — removes generated skills with no canonical source in `.agent/skills/`
- Three new audits: `ak audit gitignore-agent-surfaces`, `ak audit memory-unified`, `ak audit compile-drift`
- `ak_qa` advisory tail-hint when passing QA with UI file changes
- Anonymous opt-in TTHW telemetry (`AK_TELEMETRY=1 ak setup`; off by default)
- OSS positioning docs: `docs/positioning-vs-rulesync.md`, `docs/wedge-experience/demo.sh`

### Minimal audit slice

- `ak audit skill-sizes` — checks skills against configurable budgets in `.agent/.audit-budgets.yaml`
- `ak audit broken-refs` — walks `.agent/**/*.md` for unresolved relative links and `@AGENTS.md` imports; supports `--staged` mode for pre-commit
- `ak audit memory-rotation` — surfaces AGENTS.md rotation events from `.agent/.rotation-log.jsonl`
- `ak tech-debt new --from-audit <name>` — auto-files audit findings as `h-NNN-*.md` with content-hash idempotency
- `ak setup --with husky` extended with pre-commit hooks for staged-mode audits

### Blueprint structured store (SQLite)

- `better-sqlite3` SQLite projection of all blueprint markdown; cold-start rebuild from canonical markdown
- Custom MCP server with 8 tools: `ak_blueprint_query`, `_new`, `_validate`, `_task_next`, `_task_advance`, `_promote`, `_finalize`, `_depgraph`
- 9 pre-registered SQL query templates; `docs/blueprint-db-cookbook.md`
- `ak blueprint db build|query|verify|browse` CLI verbs; Datasette integration for human browsing
- `ak blueprint export --format spec-kit` — exports blueprints to spec-kit 4-file format (DRY KISS SOLID)
- `ak blueprint task advance`, `promote`, `finalize` mutation verbs (atomic write + re-ingest)
- Three SQL-backed audits (alpha-gated via `AK_USE_SQL_AUDITS=1`): `blueprint-db-consistency`, `blueprint-lifecycle-sql`, `tech-debt-cadence`

## Breaking changes

- `ak cursor-windsurf-sync` is removed. Use `ak compile` instead.
- `.agent/` symlink-era outputs replaced by rulesync-emitted files. Run `ak setup --with base-kit --with example-skill && ak compile` on fresh install.
- Internal consumers (monorepo, ingest-lens) require a one-time cleanup: delete legacy `.windsurfrules`, `.cursorrules`, and old symlinks before bumping to v0.15.0. See `docs/positioning-vs-rulesync.md` for the rollout guide.

## Dependencies added

- `rulesync@8.15.1` (exact pin)
- `remark@15.0.1`, `remark-validate-links@13.1.0`, `remark-frontmatter@5.0.0`
- `better-sqlite3@^12.9.0` + `@types/better-sqlite3`
