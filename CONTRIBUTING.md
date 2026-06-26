# Contributing to `@webpresso/agent-kit`

Agent Kit is public and source-available under Elastic License 2.0. Contributions
should make the repo easier for agents and humans to verify.

## Local development

Inside this source repo, use the checked-in launcher and source/JIT lane:

```bash
direnv allow          # exports WP_FORCE_SOURCE=1 from .envrc
./bin/wp hooks doctor
./bin/wp audit guardrails
./bin/wp sync --check
```

Do not shell out to `node ./dist/esm/cli/cli.js ...`: that path is an
implementation detail. Source execution is selected by `WP_FORCE_SOURCE=1` from
this checkout.

## Consumer repos

Consumer repos should install the published package globally and keep only the
config preset locally:

```bash
vp install -g @webpresso/agent-kit
vp install
wp setup
```

Consumers must not execute `node_modules/.bin/wp`, `vp run wp`, `pnpm run wp`,
`bun run wp`, or any `file:` / `link:` / `workspace:` Agent Kit pin. Edit skills,
commands, and workflow sources in this repo, publish, then consume the published
package.

## Change guidelines

- Keep diffs small, reviewable, and reversible.
- Prefer deletion or reuse over new layers.
- Do not hand-edit generated/runtime surfaces such as `.agent/`, `.codex/`,
  `.claude/skills/`, `.cursor/`, `.opencode/`, or `.omx/`.
- Edit catalog/source files, then run `./bin/wp sync` when generated surfaces
  must be refreshed.
- Do not commit secrets or secret-bearing files.
- Do not make public numeric benchmark claims without a checked-in result card.
- Delete obsolete docs instead of preserving stale guidance.
- Treat canonical `blueprints/**` as planning records; do not rewrite them in a
  broad docs refresh unless the change explicitly updates a blueprint.

## Verification

For docs-only changes:

```bash
./bin/docs-check-internal-links.js
./bin/docs-check-refs.js
./bin/docs-check-stale.js
./bin/docs-lint.js
./bin/wp audit docs-frontmatter --json
vp run format --check
```

For code or shipped behavior changes, add the narrow relevant tests plus:

```bash
vp run typecheck
vp run lint
vp run format --check
```

Run `./bin/wp sync --check` after template, catalog, or generated-surface source
changes.

## Changesets

Most publishable changes need a Changeset:

```bash
vp run changeset
```

Commit the generated `.changeset/*.md` file with your change. Docs-only changes
that do not affect the shipped package may be Changeset-exempt when the PR says
why.

Check pending release status with:

```bash
vp run changeset:status
```

## Release flow

Agent Kit ships as an npm package and as Claude/Codex plugin artifacts.
Maintainers release through CI:

1. Merge a PR with any required `.changeset/*.md` file.
2. CI opens or updates the **Version Packages** PR.
3. A maintainer reviews and merges that PR.
4. CI publishes with provenance and creates the release branch/tag artifacts.

Do not manually bump `package.json#version`, push `v*` tags, or publish from a
local machine.

## Marketplace note

Marketplace consumers should pin to a release ref that includes built artifacts.
`main` keeps day-to-day diffs clean and may not include generated `dist/` output.
