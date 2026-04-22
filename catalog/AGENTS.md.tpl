<!--
  AGENTS.md template.

  `ak init` renders this file with:
  - {{REPOSITORY_MAP}}: bulleted list of workspace packages inferred from
    pnpm-workspace.yaml / package.json workspaces.
  - {{TECH_STACK}}: short description generated from package.json + detected
    frameworks (React, Hono, Drizzle, etc.).
  - {{ESCALATION_MAP}}: user-edited section. Left as a TODO placeholder if
    not specified.
  - {{DURABLE_PLANNING_ROOT}}: defaults to `.agent/planning/`. Override via
    .agent-kitrc.json.

  After rendering, the AGENTS.md is the consumer's to own — agent-kit doesn't
  rewrite it on re-runs unless `ak init --overwrite` is used.
-->

<!-- PRINCIPAL:START -->

# Operating Contract

This is the authoritative reference for every contributor — human or agent — working in this repo.
Read it before you touch a file. The rules are not guidelines.

## Plan first

Every non-trivial change starts as a blueprint. Blueprint specs live in
[`blueprints/`](./blueprints/) (`planned/` → `in-progress/` → `completed/`) with lifecycle tracked in
[`blueprints/README.md`](./blueprints/README.md).

Use the skills in [`.agent/skills/`](./.agent/skills/):

- `$plan` — draft a blueprint spec
- `$plan-refine` — iterate the spec before execution
- `$pll <slug>` — launch parallel lanes, one worktree per slug on `pll/<slug>`

Parallel lanes commit **once**, after `/verify` is green. No incremental WIP commits on `pll/` branches.

## Implement

Use your repo's task-runner recipes rather than invoking tools directly. Run
dependency install, scoped workspace commands, and secret-bearing commands
through the repo's wrapped surface so environment and secret injection are
applied consistently.

Scripts are `.ts` executed via `bun` when available. Never `.mjs`. Never raw
`node` or `npx`.

## Verify

All verification gates must pass before committing:

- Type check (repo-wide)
- Lint
- Tests
- Catalog / version drift check
- Formatting gate

Never skip a gate. If a gate is broken by your change, fix it in the same PR.

## Communicate

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(api-server): add HMAC-signed delivery receipts
fix(db): scope idempotency key to tenant
docs(adrs): record auth strategy decision
```

The `commit-msg` hook enforces format. Record architectural decisions in
[`docs/adrs/`](./docs/adrs/).

## Non-negotiables (hard stops)

- **Never `--no-verify`** on any git command. If a hook fails, fix the root cause.
- **No secrets in code.** Secrets flow through the repo's secret manager only. No `.env` files anywhere.
- **No `dotenv` package.** Remove it if you see it.
- **No `.mjs` scripts.** Use `.ts` + `bun`.
- **No backwards-compat shims.** Delete legacy in the same PR as the replacement.
- **No feature flags** for migrations. Hard-cut, then verify.

## Do-not patterns

- Do not add `any` types — the linter enforces this; a suppression comment is not an escape hatch.
- Do not pin dependency versions per-workspace when a catalog entry exists — use `catalog:`.
- Do not create new packages without a product-wedge blueprint — sprawl compounds fast.
- Do not re-derive policy from memory when a rule file exists — load the file.
- Do not commit generated artifacts by hand — CI regenerates them; manual edits get clobbered.
- Do not run package-manager install inside a workspace — always run from the monorepo root.
- Do not silently bypass a rule because it conflicts with a task — surface the conflict and fix the rule.

## Durable planning surface

- PRDs: `{{DURABLE_PLANNING_ROOT}}/plans/prd-<slug>.md`
- Test specs: `{{DURABLE_PLANNING_ROOT}}/plans/test-spec-<slug>.md`
- Boundary contracts: `{{DURABLE_PLANNING_ROOT}}/contracts/*.md`
- Lifecycle state: `{{DURABLE_PLANNING_ROOT}}/state/lifecycle/<slug>.json`
- Session notes: `{{DURABLE_PLANNING_ROOT}}/notepad.md`
- Project memory: `{{DURABLE_PLANNING_ROOT}}/project-memory.json`

If work changes workspace ownership, build boundaries, or cross-package
consumption mode, update the workspace-boundary contract under
`{{DURABLE_PLANNING_ROOT}}/contracts/` before claiming the plan is ready.

<!-- PRINCIPAL:END -->

## Repository map

{{REPOSITORY_MAP}}

## Tech stack

{{TECH_STACK}}

## Escalation map

{{ESCALATION_MAP}}
