---
"@webpresso/agent-kit": minor
---

Consumer-rule + consumer-skill primitives, unified `ak sync` command, and removal of legacy sync commands.

**New primitives**

- `ak rule new|list|show|deprecate <slug>` — consumer-owned rules at `<repo>/agent-rules/<slug>.md`. Slug-only filenames; frontmatter validated by Zod (`type`, `slug`, `title`, `status`, `scope`, `applies_to`, `related`, `created`, `last_reviewed`, optional `deprecation_date`).
- `ak skill new|list|show|deprecate <slug>` — consumer-owned skills at `<repo>/agent-skills/<slug>/SKILL.md` (dirs bundle SKILL.md + arbitrary assets).
- `ak audit rules` and `ak audit skills` — schema validation, slug-collision detection (consumer + catalog hard-fail), broken-`related` ref detection, stale-review warnings (>180 days). Wired into `REPO_AUDIT_REGISTRY`.
- Shared `src/content/{schema,loader,audit,dispatch}.ts` module — single source of truth for both kinds; per-kind difference is parameterized (file vs dir).

**Unified sync replaces copy-on-install**

- New `ak sync [--kind rules|skills] [--check]` command. `--check` exits 1 on drift (CI-friendly); regular run prints "restart your IDE" when files were written.
- Per-IDE distribution: symlink for `.agent/{rules,skills}/`, `.codex/agents/`, `.claude/skills/`; copy for `.cursor/rules/`, `.windsurf/skills/`; TOML transform for `.gemini/commands/`.
- `ak setup` no longer copies catalog rules/skills into `.agent/` — instead invokes `ak sync` post-scaffold. Result: zero `.new` sidecars on `pnpm install`, fully idempotent re-runs, no drift surface.
- pnpm `.pnpm/<version>/` instability absorbed via `realpathSync` on catalog dir.

**Breaking changes (pre-1.0 minor)**

- `ak symlink sync` removed. Use `ak sync`.
- `ak cursor-windsurf-sync` removed. Use `ak sync`.
- `ak skills` (plural) renamed to `ak skill` (singular) — matches `ak blueprint` / `ak tech-debt` convention. The `install`/`uninstall` actions survive but with new semantics: registry-only edit to `.agent-kitrc.json#installed.tier3Skills` (no copy). Running `ak skills` now errors with a redirect message.
- `ak setup --overwrite` no longer touches `.agent/rules/` or `.agent/skills/` — they are derived from sync. Existing `--overwrite` semantics for `AGENTS.md`, `.claude/settings.json`, `.codex/hooks.json`, `docs/templates/` are unchanged.

**Catalog promotions**

- Three universal rules promoted into `catalog/agent/rules/`: `no-timeout-as-fix.md`, `pre-implementation.md`, `ts-coding-conventions.md`.

**Migration notes for consumers**

- After upgrading, run `pnpm install` once. `agent-rules/` and `agent-skills/` are scaffolded with `.gitkeep` + README. Add repo-specific rules via `ak rule new <slug>` rather than editing canonical files.
- Slug collisions between consumer rules/skills and catalog content are hard audit failures — pick a different slug or upstream the change.
- Add `ak audit rules` and `ak audit skills` to your CI checklist.
