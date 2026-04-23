# Migrating from webpresso's internal blueprint package

Webpresso is adopter zero of agent-kit. Before agent-kit existed, the
repo hosted the Blueprint runtime, symlinker, `blueprint-plan`
validator, and `audit-tph` scripts as separate internal concerns:

| Internal path | Moved into agent-kit at | Import change |
|---|---|---|
| `packages/cli/blueprint/src/*` | `packages/cli/agent-kit/src/blueprint/*` | `@webpresso/blueprint` → `@webpresso/agent-kit/blueprint` |
| `packages/cli/blueprint/src/local.ts` | `packages/cli/agent-kit/src/blueprint/local.ts` | `@webpresso/blueprint/local` → `@webpresso/agent-kit/blueprint/local` |
| `packages/foundation/docs-linter/src/validators/blueprint-plan.ts` | `packages/cli/agent-kit/src/docs-linter/blueprint-plan.ts` | Import from `@webpresso/agent-kit/docs-linter` |
| `apps/scripts/src/audit/audit-tph.ts` | `packages/cli/agent-kit/src/audit/audit-tph.ts` | Invoke via `ak audit tph` CLI |
| `apps/scripts/src/audit/audit-tph-e2e.ts` | `packages/cli/agent-kit/src/audit/audit-tph-e2e.ts` | Invoke via `ak audit tph-e2e` |
| `apps/scripts/src/maintenance/symlinker.ts` | `packages/cli/agent-kit/src/symlinker/` | Invoke via `ak symlink sync`/`check` |

## The migration plan

For webpresso, the full migration is tracked as a blueprint at
`webpresso/blueprints/planned/adopt-webpresso-agent-kit/_overview.md`.
It's split into four phases:

1. **Codemod imports + add workspace dep** — every `@webpresso/blueprint*`
   import becomes `@webpresso/agent-kit/blueprint*`, agent-kit is added
   as a workspace dep alongside the old blueprint package to keep the
   tree green during transition. ~20 files.
2. **Cut pre-commit hooks + `just` recipes** — rewire the Husky pre-commit
   that invoked `apps/scripts/src/maintenance/symlinker.ts` to use
   `ak symlink check` instead. Same for the `just audit-tph` recipe.
3. **Delete the internal originals** — `packages/cli/blueprint/`,
   `blueprint-plan.ts`, `audit-tph*.ts`, `symlinker.ts` + its test.
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
to a pure delegation to `ak blueprint`. That's a future optimization,
not a user-visible change.

## For other repos migrating to agent-kit

Most repos aren't coming from webpresso's internal blueprint — they're
fresh installs. Use `ak init` and follow `getting-started.md`.

If you happen to have forked or vendored webpresso's blueprint code:

1. `pnpm add -D @webpresso/agent-kit`.
2. `npx ak init` (or `ak init --dry-run` to preview).
3. Codemod: find/replace your vendored imports with
   `@webpresso/agent-kit/blueprint`.
4. Delete the vendored code.
5. Run `ak symlink sync` and commit the resulting `.claude/`, `.cursor/`,
   `.windsurf/`, `.opencode/`, `.agents/skills/`, and `.gemini/` files.

## Invariants preserved during webpresso's migration

- **`wp blueprint list` / `audit --strict` output is byte-identical.**
- **Every blueprint file in `webpresso/blueprints/` passes
  `ak blueprint audit --strict`.** (Agentkit's validator is the same
  code as the old `blueprint-plan.ts`, just repackaged — so this should
  pass by construction.)
- **No test regressions.** Agentkit's 1200+ lifted tests continue to
  pass, and webpresso's consumers' tests stay green post-codemod.
- **Pre-commit guardrails still trigger** on agent-surface drift and
  blueprint-format violations — they go through `ak` now.
