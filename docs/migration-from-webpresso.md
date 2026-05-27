---
type: migration
last_updated: '2026-05-09'
---

# Migrating from webpresso's internal blueprint package

Webpresso is adopter zero of agent-kit. Before agent-kit existed, the
repo hosted the Blueprint runtime, symlinker, `blueprint-plan`
validator, and `audit-tph` scripts as separate internal concerns:

| Historical concern | Now lives in agent-kit at | Import change |
|---|---|---|
| legacy blueprint package source | `src/blueprint/*` | `@webpresso/blueprint` → `@webpresso/agent-kit/blueprint` |
| legacy blueprint local entrypoint | `src/blueprint/local.ts` | `@webpresso/blueprint/local` → `@webpresso/agent-kit/blueprint/local` |
| legacy blueprint-plan validator | `src/docs-linter/blueprint-plan.ts` | Import from `@webpresso/agent-kit/docs-linter` |
| legacy TPH audit script | `src/audit/audit-tph.ts` | Invoke via `wp audit tph` CLI |
| legacy TPH E2E audit script | `src/audit/audit-tph-e2e.ts` | Invoke via `wp audit tph-e2e` |
| legacy symlinker maintenance surface | `src/symlinker/` | Invoke via `wp sync` (use `wp sync --check` for drift) |

## The migration plan

For webpresso, the historical migration was split into four phases:

1. **Codemod imports + add workspace dep** — every `@webpresso/blueprint*`
   import becomes `@webpresso/agent-kit/blueprint*`, agent-kit is added
   as a workspace dep alongside the old blueprint package to keep the
   tree green during transition. ~20 files.
2. **Cut pre-commit hooks + `just` recipes** — rewire the Husky pre-commit
   that invoked the old symlinker maintenance entrypoint to use
   `wp sync --check` instead. Same for the `just audit-tph` recipe.
3. **Delete the internal originals** — the legacy blueprint package,
   `blueprint-plan.ts`, `audit-tph*.ts`, and the old symlinker maintenance
   entrypoint.
4. **Validation** — `wp blueprint list` + `wp blueprint audit --strict`
   must produce byte-identical output pre- and post-migration.
   Full `just e2e blueprint-creation` runs green.

## Why `wp blueprint` stays

`apps/cli-wp` is webpresso's customer-facing CLI. Its `wp blueprint`
subcommand group is muscle memory for every webpresso contributor and
every downstream webpresso user. The migration preserves the `wp blueprint`
surface; internally, `cli-wp` now imports from `@webpresso/agent-kit/blueprint`
instead of `@webpresso/blueprint`.

There's a follow-up (out of scope for v1) to thin `wp blueprint` down
to a pure delegation to `wp blueprint`. That's a future optimization,
not a user-visible change.

## For other repos migrating to agent-kit

Most repos aren't coming from webpresso's internal blueprint — they're
fresh installs. Use `wp setup` and follow `getting-started.md`.

If you happen to have forked or vendored webpresso's blueprint code:

1. `vp install -D @webpresso/agent-kit`.
2. `vp exec wp setup` (or `wp setup --dry-run` to preview).
3. Codemod: find/replace your vendored imports with
   `@webpresso/agent-kit/blueprint`.
4. Delete the vendored code.
5. Run `wp sync` and commit the resulting `.claude/`, `.cursor/`,
   `.windsurf/`, `.opencode/`, `.agents/skills/`, and `.gemini/` files.

## Invariants preserved during webpresso's migration

- **`wp blueprint list` / `audit --strict` output is byte-identical.**
- **Every blueprint file in the historical webpresso migration set passes
  `wp blueprint audit --strict`.** (Agentkit's validator is the same
  code as the old `blueprint-plan.ts`, just repackaged — so this should
  pass by construction.)
- **No test regressions.** Agentkit's 1200+ lifted tests continue to
  pass, and webpresso's consumers' tests stay green post-codemod.
- **Pre-commit guardrails still trigger** on agent-surface drift and
  blueprint-format violations — they go through `wp` now.
