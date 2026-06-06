<!--
  AGENTS.md template.

  Current-state agent-kit scaffolding (`wp setup`) renders this file with:
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

  Managed sections in this file are refreshed by agent-kit. Sync uses `wp sync`.
  Repo-specific edits belong only inside `user-owned` blocks; agent-kit preserves
  those blocks verbatim when it rewrites managed content.
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
Agent-kit owns the generated agent surfaces in this file; the Webpresso CLI host owns the end-user command surface.
To customize skills, commands, or workflows, edit them in agent-kit's catalog
and publish — not in individual repos. The default `omx` preset refreshes
Vite+ through `vp upgrade`, chains `omx setup --yes --scope user`, and installs
missing OMX through `vp install -g oh-my-codex`. The default `omc` preset ensures OMC through
Claude Code's plugin marketplace in user scope when `claude` is on `PATH`.
`wp setup` also repairs the managed `.gitignore` block for regenerated agent
surfaces so repo-local `.codex/`,
`.omx/`, `.agent/`, and generated IDE projection outputs stay out of Git.
Tracked vs ignored rule of thumb:

- **Track** deliberate repo-owned instruction surfaces (for example
  `AGENTS.md`, committed `.claude/commands/*.md` symlinks when the repo uses
  them, and canonical sources such as `agent-rules/` / `agent-skills/`).
- **Ignore** regenerated or local-only surfaces (for example `.agent/`,
  `.agents/`, generated `.claude/rules/`, `.claude/skills/`,
  `.claude/worktrees/`, editor-local state, and other runtime projections).

Current-state bootstrap commands remain `wp setup` / `wp sync`; future unified CLI replacements are `webpresso agent setup` / `webpresso agent sync`.

## Plan

Use blueprints for non-trivial work. Blueprint specs live in
[`blueprints/`](./blueprints/) with lifecycle directories such
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

Never use hardcoded relative filesystem paths in executable code or config.
Derive absolute paths from an explicit absolute anchor instead (for example a
repo-root helper, package-root helper, or runtime-provided absolute base
path).

## Verify

Before claiming completion, run the narrowest checks that prove the changed
behavior and any broader checks this repo requires. Typical gates are:

- agent-kit MCP tools first when available; otherwise the repo-owned wrapper
  command
- typecheck
- lint / format check
- affected tests
- repo policy checks such as `verify:paths` / `verify:secrets` when setup
  scaffolded them
- docs or blueprint validation when docs/plans changed
- `wp sync --check` after `wp setup` to verify surfaces are in sync today; treat `webpresso agent setup` / `webpresso agent sync` as the future cutover replacements

If a gate fails, fix the root cause or record the blocker with evidence.

## Communicate

Commit messages, PR descriptions, and decision records should explain why the
change exists, what tradeoffs were made, and what was verified. Record durable
architecture decisions in this repo's ADR or planning location if one exists.
<!-- <<< managed by webpresso (operating-contract) -->

<!-- >>> user-owned (repo-customizations) -->
## Repo-specific customizations

- Global Codex hook commands must be **path-stable**: do not rely on bare
  `context-mode`, `node`, or other PATH-resolved binaries in generated hook
  runtime surfaces. Repair this in setup/scaffolders, not by hand-editing
  `~/.codex/hooks.json`.
- Blueprint/MCP discovery paths must be **bounded and degradable**: roots
  fetches, git probes, and project discovery should return partial results +
  warnings when slow, never hang the transport.
- Discovery-specific timeout policy for MCP/blueprint tools is non-negotiable:
  partial results + warning fields are preferred to raising global tool
  timeouts or adding retry/backoff loops.
- Timeout failures are diagnostics, not fixes. Do not raise timeouts to make
  hook or MCP hangs disappear; follow `.agent/rules/no-timeout-as-fix.md`.
- Keep these repo-local expectations aligned with `.agent/rules/agent-guide.md`
  and the active blueprint tasks before changing hook or MCP runtime behavior.
<!-- <<< user-owned (repo-customizations) -->

<!-- >>> managed by webpresso (planning-and-release) -->
## Safety boundaries

- Do not commit secrets or credentials.
- Do not create or persist secret-bearing files like `.env`, `.env.local`, `.env.*.local`,
  `.dev.vars`, or `.dev.vars.example` in the repository.
- Route secret-scoped commands through the repo contract (`wp config secrets` +
  `with-secrets -- <cmd>`); do not hardwire provider-specific wrappers in repo
  scripts/docs.
- Keep secret/path checks on shared audit surfaces when available: pre-commit
  and repo scripts should route through `wp audit absolute-path-policy`,
  local secret policy verification, and `audit-secret-provider-quarantine`.
- Do not commit agent surfaces (`.agent/`, `.agents/`, `.gemini/`, `.cursor/`,
  `.windsurf/`, `.omx/`, `.omc/`, `.codex/`, `.opencode/`) — they are gitignored and
  regenerated by `wp setup` / `omx setup`.
- Do not hand-edit generated or derived surfaces; edit the catalog in agent-kit.
- Do not bypass hooks or verification gates to force a change through.
- Do not use hardcoded relative filesystem paths in executable code or config;
  derive absolute paths from an explicit anchor.
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
  `blueprints/` (`planned/`, `in-progress/`, `completed/`).
- PRDs, test specs, and other blueprint-owned planning artifacts should live
  under the configured blueprint root (`blueprints/`), colocated with
  the blueprint they refine, rather than under the durable planning root.
- Generated on demand (not created by setup): boundary contracts at
  `.agent/planning/contracts/`, lifecycle state at
  `.agent/planning/state/`, session notes at
  `.agent/planning/notepad.md`, and project memory at
  `.agent/planning/project-memory.json`.

If work changes workspace ownership, build boundaries, or cross-package
consumption mode, update the relevant boundary contract before claiming the plan
is ready.

## Releases

All packages in the webpresso public umbrella use **Changesets**. Never push
`v*` tags or manually bump `package.json#version`.

To ship a change:
1. `vp run changeset` — describe the change and select the bump type.
2. Commit the generated `.changeset/<name>.md` alongside your code.
3. Merge to `main`. The release workflow opens or updates a **Version Packages**
   PR.
4. Merge the **Version Packages** PR. The workflow then publishes the package
   to the public npm registry.

```bash
vp run changeset:status   # see pending changesets
```

Full protocol: `.agent/rules/changeset-release.md`

## Package conventions

- No `../` parent-relative imports — use workspace deps + subpath exports.
- No `.mjs` source files — write `.ts` (with Bun/Node shebang if needed).
- Use `vp` as the command facade (`vp install`, `vp run <script>`) so Vite+ selects the repo-declared package-manager substrate. Do not call `npm`, `npx`, or raw package-manager globals for repo workflows unless a deeper repo instruction explicitly requires it.
- All packages: `"type": "module"`, `publishConfig` → public npm registry.
- Auth: use npm trusted publishing where available, or scope `NPM_TOKEN` to
  publish-only flows. Never hardcode tokens.

Full details: `.agent/rules/package-conventions.md`

## Repository map

- `@webpresso/agent-kit` — `.`

## Tech stack

- TypeScript
- Vitest
- Zod
<!-- <<< managed by webpresso (planning-and-release) -->

<!-- >>> user-owned (escalation-map) -->
## Escalation map

{{TODO: populate escalation map — who to ping for which subsystem.}}
<!-- <<< user-owned (escalation-map) -->
