<!--
  AGENTS.md template.

  `ak setup` renders this file with:
  - {{REPOSITORY_MAP}}: bulleted list of workspace packages inferred from
    pnpm-workspace.yaml / package.json workspaces.
  - {{TECH_STACK}}: short description generated from package.json + detected
    frameworks (React, Hono, Drizzle, etc.).
  - {{ESCALATION_MAP}}: user-edited section. Left as a TODO placeholder if
    not specified.
  - {{DURABLE_PLANNING_ROOT}}: defaults to `.agent/planning/`. Override via
    .agent-kitrc.json.

  After rendering, this file belongs to the consumer repo. Agent Kit does not
  rewrite it on re-runs unless `ak setup --overwrite` is used.
-->

# Operating Contract

This is the shared working agreement for contributors and coding agents in this
repo. Prefer repo-local instructions when they are more specific than this
starter template, and keep changes small, reviewable, and verified.

## Setup after clone

The `.codex/` and `.opencode/` directories are gitignored — they contain
machine-local, regenerable agent surfaces. After cloning, bootstrap them:

```bash
ak setup                          # scaffolds .agent/, AGENTS.md, hooks
omx setup --scope project         # installs OMX agents/prompts/skills to .codex/
ak symlink sync                   # regenerates .agents/skills/ + .gemini/commands/
```

Agent-kit owns `.agent/` (canonical source — commit this), `.agents/skills/`
(per-skill symlinks), `.gemini/commands/` (TOML transforms), and hook configs
(`.claude/settings.json`, `.codex/hooks.json`). OMX owns `.codex/{agents,prompts,
skills,commands,workflows}/`. The `--with omx` preset chains `omx setup --yes`
during `ak setup`.

## Plan

Use blueprints for non-trivial work. Blueprint specs live in
[`blueprints/`](./blueprints/) with lifecycle directories such as `planned/`,
`in-progress/`, and `completed/`. Keep each blueprint's tasks, dependencies,
verification commands, and acceptance criteria current before execution.

Useful installed surfaces:

- `.agent/commands/` — repo-owned slash-command sources.
- `.agent/skills/` — repo-owned skills; edit these, then run `ak symlink sync`.
- `.agent/workflows/` and `.agent/rules/` — local process guidance.

## Implement

Use this repo's task runner or package scripts instead of guessing commands from
memory. If a wrapped command exists, prefer it over direct tool invocation so the
repo can apply its environment, caching, and policy consistently.

Before large edits, inspect nearby patterns and reuse existing utilities. Avoid
new dependencies unless the task explicitly requires them.

## Verify

Before claiming completion, run the narrowest checks that prove the changed
behavior and any broader checks this repo requires. Typical gates are:

- typecheck
- lint / format check
- affected tests
- docs or blueprint validation when docs/plans changed
- `ak symlink check` when `.agent/` content changed

If a gate fails, fix the root cause or record the blocker with evidence.

## Communicate

Commit messages, PR descriptions, and decision records should explain why the
change exists, what tradeoffs were made, and what was verified. Record durable
architecture decisions in this repo's ADR or planning location if one exists.

## Safety boundaries

- Do not commit secrets or credentials.
- Do not hand-edit generated or derived surfaces; edit the source and regenerate.
- Do not bypass hooks or verification gates to force a change through.
- Do not assume Webpresso-specific paths, tools, or runtimes exist unless this
  repo documents them.
- Surface conflicts between this file and deeper repo instructions instead of
  silently ignoring either.

## Durable planning surface

- PRDs: `{{DURABLE_PLANNING_ROOT}}/plans/prd-<slug>.md`
- Test specs: `{{DURABLE_PLANNING_ROOT}}/plans/test-spec-<slug>.md`
- Boundary contracts: `{{DURABLE_PLANNING_ROOT}}/contracts/*.md`
- Lifecycle state: `{{DURABLE_PLANNING_ROOT}}/state/lifecycle/<slug>.json`
- Session notes: `{{DURABLE_PLANNING_ROOT}}/notepad.md`
- Project memory: `{{DURABLE_PLANNING_ROOT}}/project-memory.json`

If work changes workspace ownership, build boundaries, or cross-package
consumption mode, update the relevant boundary contract before claiming the plan
is ready.

## Repository map

{{REPOSITORY_MAP}}

## Tech stack

{{TECH_STACK}}

## Escalation map

{{ESCALATION_MAP}}
