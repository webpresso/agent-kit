<!--
  AGENTS.md template.

  Current-state agent-kit scaffolding (`wp setup`) renders this file with:
  - Repository map: bulleted list of workspace packages inferred from
    pnpm-workspace.yaml / package.json workspaces.
  Managed sections refresh via `wp sync`; repo-specific edits belong in
  `user-owned` blocks and are preserved verbatim.
-->

<!-- >>> managed by webpresso (operating-contract) -->
# Operating Contract

Prefer repo-local instructions when they are more specific than this template.
Keep changes small, reviewable, and verified.

## Setup after clone

```bash
vp install && vp run setup:agent  # setup:agent runs wp setup, which scaffolds .agent/, AGENTS.md, hooks, and runs wp sync
```

agent-kit's catalog is the single source of truth for generated agent surfaces.
Agent-kit owns the generated agent surfaces in this file; the Webpresso CLI host owns the end-user command surface.

Defaults worth preserving:
- External tools such as `omx` and `omc` are self-installed and updated with their native installers when you choose to use them; Webpresso workflow/browser skills are package defaults.
- `wp setup` repairs the managed `.gitignore` block for regenerated surfaces.
- Consumer repos use the global `wp` install and keep only `@webpresso/agent-config` locally; do not add a consumer-local `@webpresso/agent-kit` dependency.
- Track repo-owned instruction sources (`AGENTS.md`, `agent-rules/`, `agent-skills/`).
- Ignore generated/runtime surfaces (`.agent/`, `.agents/`, `.omx/`, `.codex/`, `.claude/skills/`, etc.).

Current-state bootstrap commands remain `wp setup` / `wp sync`; future unified CLI replacements are `webpresso agent setup` / `webpresso agent sync`.

Prompt budget contract:
- Keep the generated default `AGENTS.md` under 8 KB.
- Move handbook prose to docs; keep only durable rules and command contracts here.

Codex routing instruction surface:
{{CODEX_ROUTING_INSTRUCTION_SURFACE}}

## Plan

Use blueprints for non-trivial work. Specs live in
[`{{BLUEPRINTS_DIR}}/`](./{{BLUEPRINTS_DIR}}/) with lifecycle directories such as
`planned/`, `in-progress/`, and `completed/`. Keep tasks, dependencies,
verification commands, and acceptance criteria current before execution.

For any non-trivial change, run the gate **before the first edit**, in order:
**worktree → blueprint → draft PR** — create a git worktree on a fresh branch
and switch into it, create the blueprint on that branch, then open a draft PR
early and push implementation commits to it. Never implement on `main`.
PRs with any non-`*.md` changes must include a changed blueprint, unless a
commit carries `Blueprint-exempt: <reason>` for a genuinely trivial exception.
Full rule: `.agent/rules/pre-implementation.md` § Blueprint gate.

Catalog-owned surfaces:
- `.agent/commands/` — slash-command sources
- `.agent/skills/` — generated/projected skills; edit the catalog, not generated copies

## Implement

- Prefer repo scripts/wrappers over ad-hoc commands.
- Reuse nearby utilities and patterns before adding new abstractions.
- Apply DRY, SOLID, YAGNI, and KISS.
- No hardcoded relative paths in executable code or config; derive from an explicit absolute anchor.

## Verify

Before claiming completion, run the narrowest checks that prove the change:
- agent-kit MCP tools first when available; otherwise the repo wrapper
- typecheck
- lint / format check
- affected tests
- repo policy checks such as `verify:paths` / `verify:secrets`
- docs or blueprint validation when docs/plans changed
- `wp sync --check` after template/catalog changes

If a gate fails, fix the root cause or record the blocker with evidence.

## Communicate

Explain why the change exists, what tradeoffs were made, and what was verified.
Record durable architecture decisions in the repo's ADR/planning surface if one exists.
<!-- <<< managed by webpresso (operating-contract) -->

<!-- >>> user-owned (repo-customizations) -->
## Repo-specific customizations

Add repo-local instructions, preferences, and exceptions here. Content inside
this block is preserved verbatim across `wp sync` runs.
<!-- <<< user-owned (repo-customizations) -->

<!-- >>> managed by webpresso (planning-and-release) -->
## Safety boundaries

- Do not commit secrets or credentials.
- Do not create or persist secret-bearing files like `.env`, `.env.local`, `.env.*.local`, `.dev.vars`, or `.dev.vars.example`.
- Route secret-scoped commands through the repo contract (`wp secrets doctor --profile <profile> --json` + `wp secrets run --sink <sink> --profile <profile> -- <cmd>`).
- Keep secret/path checks on shared audit surfaces when available.
- Do not commit agent surfaces (`.agent/`, `.agents/`, `.cursor/`, `.omx/`, `.omc/`, `.codex/`, `.opencode/`).
- Do not hand-edit generated or derived surfaces; edit the catalog in agent-kit.
- Do not push directly to `main`; use PRs and keep CI green.
- Do not bypass hooks or verification gates.
- Treat publishable tarballs as public disclosure surfaces.
- Surface conflicts between this file and deeper repo instructions instead of silently ignoring either.

## Durable planning surface

- Materialized by setup: blueprint lifecycle directories under `{{BLUEPRINTS_DIR}}/`.
- Put blueprint-owned PRDs and test specs under `{{BLUEPRINTS_DIR}}/`, next to the blueprint they refine.
- Generated on demand (not created by setup): boundary contracts at `{{DURABLE_PLANNING_ROOT}}contracts/`, lifecycle state at `{{DURABLE_PLANNING_ROOT}}state/`, session notes at `{{DURABLE_PLANNING_ROOT}}notepad.md`, and project memory at `{{DURABLE_PLANNING_ROOT}}project-memory.json`.

If work changes workspace ownership, build boundaries, or cross-package consumption mode, update the relevant boundary contract before claiming the plan is ready.

## Releases

All webpresso public packages use **Changesets**. Never push `v*` tags or manually bump `package.json#version`.

Release flow:
1. `vp run changeset`
2. Commit the generated `.changeset/*.md`
3. Merge to `main` to update the **Version Packages** PR
4. Merge that PR to publish

```bash
vp run changeset:status
```

Full protocol: `.agent/rules/changeset-release.md`

## Package conventions

- No `../` parent-relative imports — use workspace deps + subpath exports.
- No `.mjs` source files — write `.ts`.
- Use `vp` as the command facade (`vp install`, `vp run <script>`).
- All packages: `"type": "module"`, public npm `publishConfig`.
- Auth: use npm trusted publishing/OIDC only; do not use `NPM_TOKEN` / `NODE_AUTH_TOKEN` publish fallbacks.

Full details: `.agent/rules/package-conventions.md`

## Repository map

{{REPOSITORY_MAP}}

## Tech stack

{{TECH_STACK}}
<!-- <<< managed by webpresso (planning-and-release) -->

<!-- >>> user-owned (escalation-map) -->
## Escalation map

{{ESCALATION_MAP}}
<!-- <<< user-owned (escalation-map) -->
