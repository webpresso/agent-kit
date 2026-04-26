<!--
  AGENTS.md template.

  `ak setup` renders this file with:
  - Single-package project: `@webpresso/agent-kit` (root: `/Users/ozby/repos/webpresso/agent-kit`).: bulleted list of workspace packages inferred from
    pnpm-workspace.yaml / package.json workspaces.
  - - TypeScript
- Vitest
- Zod: short description generated from package.json + detected
    frameworks (React, Hono, Drizzle, etc.).
  - {{TODO: populate escalation map — who to ping for which subsystem.}}: user-edited section. Left as a TODO placeholder if
    not specified.
  - .agent/planning/: defaults to `.agent/planning/`. Override via
    .agent-kitrc.json.

  After rendering, this file belongs to the consumer repo. Agent Kit does not
  rewrite it on re-runs unless `ak setup --overwrite` is used.
-->

# Operating Contract

This is the shared working agreement for contributors and coding agents in this
repo. Prefer repo-local instructions when they are more specific than this
starter template, and keep changes small, reviewable, and verified.

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

### Invoking the `ak` CLI in this repo

Run the CLI as **`pnpm exec ak <subcommand>`** (or bare `ak <subcommand>`
inside any pnpm script — pnpm prepends `node_modules/.bin` to PATH there).
Do **not** invoke `node ./dist/esm/cli/cli.js …` directly: the path is an
implementation detail; the bin is the contract.

```bash
pnpm exec ak blueprint show <slug>
pnpm exec ak blueprint task complete <slug> <task-id>
pnpm exec ak audit blueprint-lifecycle
pnpm exec ak symlink sync
pnpm exec ak tech-debt new "<title>" --severity low --category documentation
```

This works because `prepare` (run automatically on every `pnpm install`)
chains `pnpm run link-self-bins`, which symlinks every entry in
`package.json#bin` into `node_modules/.bin/`. pnpm itself does not self-link
the package's own bin — it only links bins of dependencies — so this script
fills the dev-loop gap. Adding a new bin entry to `package.json` is a
single source of truth: the link script reads it and extends automatically.

In a consumer repo that has installed `@webpresso/agent-kit`, the `ak`
binary is on `node_modules/.bin/ak` directly via pnpm's normal dep-bin
linking — no extra step needed. Catalog docs, blueprint specs, and skill
files all use `ak <subcommand>` (the post-install form), and `pnpm exec ak`
is the dev-time-in-this-repo equivalent.

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

- PRDs: `.agent/planning//plans/prd-<slug>.md`
- Test specs: `.agent/planning//plans/test-spec-<slug>.md`
- Boundary contracts: `.agent/planning//contracts/*.md`
- Lifecycle state: `.agent/planning//state/lifecycle/<slug>.json`
- Session notes: `.agent/planning//notepad.md`
- Project memory: `.agent/planning//project-memory.json`

If work changes workspace ownership, build boundaries, or cross-package
consumption mode, update the relevant boundary contract before claiming the plan
is ready.

## Repository map

Single-package project: `@webpresso/agent-kit` (root: `/Users/ozby/repos/webpresso/agent-kit`).

## Tech stack

- TypeScript
- Vitest
- Zod

## Escalation map

{{TODO: populate escalation map — who to ping for which subsystem.}}
