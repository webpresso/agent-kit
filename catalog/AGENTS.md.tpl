<!--
  AGENTS.md template.

  Current-state agent-kit scaffolding (`wp setup`; public replacement: `webpresso agent setup`) renders this file with:
  - Repository map: bulleted list of workspace packages inferred from
    pnpm-workspace.yaml / package.json workspaces.
  - Tech stack: short description generated from package.json + detected
    frameworks (React, Hono, Drizzle, etc.).
  - Escalation map: user-edited section. Left as a TODO placeholder if
    not specified.
  - Durable planning root: defaults to `.agent/planning/`. Override via
    .webpressorc.json.
  - Blueprints directory: defaults to `blueprints`. Override via
    .webpressorc.json#blueprintsDir.

  Managed sections in this file are refreshed by agent-kit. Current-state sync uses
  `wp sync`; public replacement: `webpresso agent sync`. Repo-specific edits belong
  only inside `user-owned` blocks; agent-kit preserves those blocks verbatim when it
  rewrites managed content.
-->

<!-- >>> managed by webpresso (operating-contract) -->
# Operating Contract

This is the shared working agreement for contributors and coding agents in this
repo. Prefer repo-local instructions when they are more specific than this
starter template, and keep changes small, reviewable, and verified.

## Setup after clone

No agent surfaces are tracked in git — everything is regenerated. After cloning:

```bash
vp install && vp run setup:agent  # setup:agent runs wp setup, which scaffolds .agent/, AGENTS.md, hooks, and runs wp sync
```

agent-kit's catalog is the single source of truth for generated agent surfaces.
Webpresso CLI owns the public command surface (`webpresso agent ...`). To
customize skills, commands, or workflows, edit them in agent-kit's catalog and
publish — not in individual repos. The default `omx` preset chains
`omx setup --yes --scope user` and installs missing OMX through
`vp install -g oh-my-codex`. The default `omc` preset ensures OMC through
Claude Code's plugin marketplace in user scope when `claude` is on `PATH`.
`wp setup --project` is current-state migration wording; public replacement:
`webpresso agent setup --project`. `wp setup` also repairs the managed
`.gitignore` block for regenerated agent surfaces so repo-local `.codex/`,
`.omx/`, `.agent/`, and IDE projection outputs stay out of Git. `wp setup` /
`wp sync` remain current-state bootstrap commands; public replacements are
`webpresso agent setup` / `webpresso agent sync`.

## Plan

Use blueprints for non-trivial work. Blueprint specs live in
[`{{BLUEPRINTS_DIR}}/`](./{{BLUEPRINTS_DIR}}/) with lifecycle directories such
as `planned/`, `in-progress/`, and `completed/`. Keep each blueprint's tasks,
dependencies, verification commands, and acceptance criteria current before
execution.

Slash-commands and skills are loaded from agent-kit's catalog at setup time:

- `.agent/commands/` — slash-command sources (from catalog).
- `.agent/skills/` — skills (from catalog); edit in agent-kit, not here.

## Implement

Use this repo's task runner or package scripts instead of guessing commands from
memory. If a wrapped command exists, prefer it over direct tool invocation so the
repo can apply its environment, caching, and policy consistently.

Before large edits, inspect nearby patterns and reuse existing utilities. Apply
DRY, SOLID, YAGNI, and KISS as design filters; avoid new abstractions or
dependencies unless the task explicitly requires them. Full details:
`.agent/rules/engineering-principles.md`.

## Verify

Before claiming completion, run the narrowest checks that prove the changed
behavior and any broader checks this repo requires. Typical gates are:

- typecheck
- lint / format check
- affected tests
- docs or blueprint validation when docs/plans changed
- current-state `wp sync --check` after `wp setup` to verify surfaces are in sync;
  public replacement: `webpresso agent sync --check` after `webpresso agent setup`

If a gate fails, fix the root cause or record the blocker with evidence.

## Communicate

Commit messages, PR descriptions, and decision records should explain why the
change exists, what tradeoffs were made, and what was verified. Record durable
architecture decisions in this repo's ADR or planning location if one exists.
<!-- <<< managed by webpresso (operating-contract) -->

<!-- >>> user-owned (repo-customizations) -->
## Repo-specific customizations

Add repo-local instructions, preferences, and exceptions here. Content inside
this block is preserved verbatim across `wp sync` runs.
<!-- <<< user-owned (repo-customizations) -->

<!-- >>> managed by webpresso (planning-and-release) -->
## Safety boundaries

- Do not commit secrets or credentials.
- Do not create or persist secret-bearing files like `.env`, `.env.local`, `.env.*.local`,
  `.dev.vars`, or `.dev.vars.example` in the repository.
- Keep the secret check TypeScript-only: pre-commit and `verify:secrets` must execute
  `bun scripts/check-no-dev-vars.ts`.
- Do not commit agent surfaces (`.agent/`, `.agents/`, `.gemini/`, `.cursor/`,
  `.windsurf/`, `.omx/`, `.omc/`, `.codex/`, `.opencode/`) — they are gitignored and
  regenerated by `wp setup` / `omx setup`.
- Do not hand-edit generated or derived surfaces; edit the catalog in agent-kit.
- Do not bypass hooks or verification gates to force a change through.
- Treat publishable package tarballs as public disclosure surfaces even when a
  registry is currently restricted; verify packed contents before changing
  `files`, `bin`, `exports`, release workflows, or catalog assets. Full
  details: `.agent/rules/public-package-safety.md`.
- Do not assume Webpresso-specific paths, tools, or runtimes exist unless this
  repo documents them.
- Surface conflicts between this file and deeper repo instructions instead of
  silently ignoring either.

## Durable planning surface

- Materialized by setup: blueprint lifecycle directories under
  `{{BLUEPRINTS_DIR}}/` (`planned/`, `in-progress/`, `completed/`) and durable
  plan files under `{{DURABLE_PLANNING_ROOT}}plans/` when PRDs or test specs
  are generated.
- Generated on demand (not created by setup): boundary contracts at
  `{{DURABLE_PLANNING_ROOT}}contracts/`, lifecycle state at
  `{{DURABLE_PLANNING_ROOT}}state/`, session notes at
  `{{DURABLE_PLANNING_ROOT}}notepad.md`, and project memory at
  `{{DURABLE_PLANNING_ROOT}}project-memory.json`.

If work changes workspace ownership, build boundaries, or cross-package
consumption mode, update the relevant boundary contract before claiming the plan
is ready.

## Releases

All packages in the webpresso public umbrella use **Changesets**. Never push
`v*` tags or manually bump `package.json#version`.

To ship a change:
1. `vp run changeset` — describe the change and select the bump type.
2. Commit the generated `.changeset/<name>.md` alongside your code.
3. Merge to `main`. CI opens a **"Version Packages"** PR automatically.
4. Merge that PR — CI publishes to GitHub Packages.

```bash
vp run changeset:status   # see pending changesets
```

Full protocol: `.agent/rules/changeset-release.md`

## Package conventions

- No `../` parent-relative imports — use workspace deps + subpath exports.
- No `.mjs` source files — write `.ts` (with Bun/Node shebang if needed).
- Use `vp` as the command facade (`vp install`, `vp run <script>`) so Vite+ selects the repo-declared package-manager substrate. Do not call `npm`, `npx`, or raw package-manager globals for repo workflows unless a deeper repo instruction explicitly requires it.
- All packages: `"type": "module"`, `publishConfig` → GitHub Packages registry.
- Auth: `GH_PACKAGES_TOKEN` env var consumed by `.npmrc`. Never hardcode tokens.

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
