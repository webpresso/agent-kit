# Contributing to `@webpresso/agent-kit`

## Local development

### Agent Kit source checkout

Inside this source repo, use the checked-in launcher and the source/JIT lane:

```bash
direnv allow          # exports WP_FORCE_SOURCE=1 from .envrc
./bin/wp blueprint show <slug>
./bin/wp audit blueprint-lifecycle
./bin/wp sync
./bin/wp tech-debt new "<title>" --severity low --category documentation
```

Do not shell out to `node ./dist/esm/cli/cli.js …`: that path is an
implementation detail. Do not recreate the old symlinked plugin-cache or
`dev:link` workflows; source execution is selected only by `WP_FORCE_SOURCE=1`
from this checkout.

### Consumer repos

Consumer repos must pin `@webpresso/agent-kit` with a published semver range,
install dependencies with Vite+, and run the global `wp` installed by Vite+:

```bash
vp install -g @webpresso/agent-kit
vp install
wp setup
```

Consumers must not execute `node_modules/.bin/wp`, `vp run wp`, `pnpm run wp`,
`bun run wp`, or any `file:` / `link:` / `workspace:` Agent Kit pin. Edit skills,
commands, and workflow sources in the Agent Kit catalog, publish, then consume
the published package.

See [`AGENTS.md`](./AGENTS.md) for the full operating contract.

## Releases

`agent-kit` ships as both an npm package and a Claude Code plugin distributed via
a marketplace (`.claude-plugin/marketplace.json`). Plugin install is a `git clone`
of this repo at the marketplace ref, so the `dist/` build output **must** be
present at any ref consumers install from — otherwise hook bins and the MCP
server will fail to start with "file not found" errors.

`dist/` is in `.gitignore` on `main`, which keeps day-to-day diffs clean. Releases
are driven by [Changesets](https://github.com/changesets/changesets): contributors
describe their changes in a changeset file, CI opens a **Version Packages** PR to
bump versions, and merging that PR publishes to the public npm registry and creates a
`release/v<version>` branch where `dist/` is committed for marketplace consumers.

### Describing a change (contributors)

On your feature branch, after your code change:

```bash
pnpm changeset
```

Follow the prompts to select the bump type (`patch` / `minor` / `major`) and write
a human-readable summary. This creates a `.changeset/<random-name>.md` file — commit
it alongside your code change.

### How releases happen (CI-driven)

1. Your PR (including the `.changeset/*.md` file) is merged to `main`.
2. The `Release` CI workflow detects pending changesets and opens/updates a
   **"Version Packages"** PR that bumps `package.json#version` and updates
   `CHANGELOG.md`.
3. A maintainer reviews and merges the Version PR.
4. CI publishes via `pnpm run release:publish`, which wraps
   `npm publish --provenance --access public` and treats the
   already-published rerun path as idempotent success.
5. CI verifies the `v<version>` tag on the mainline version-bump commit and
   creates a `release/v<version>` compatibility branch with `dist/` committed
   for marketplace consumers.
6. GitHub Release objects are disabled in the initial rollout.

### Checking pending changeset status

```bash
pnpm changeset:status
```

### Why `dist/` is not on `main`

Committing build output on `main` would:

- pollute every PR diff with regenerated bundles,
- guarantee merge conflicts in feature branches,
- split developers between "rebuild and recommit" and "trust CI".

The `release/v<version>` branch sidesteps all three: the day-to-day branch graph
stays clean and only release branches carry the artifacts that marketplace
consumers need.

### Marketplace consumers: always pin to a release branch

When adding `webpresso/agent-kit` to a marketplace consumer, pin to a
`release/v<version>` branch — never to `main`. `main` does not contain `dist/`
and the plugin will not function from there.

```jsonc
// in the consumer's marketplace.json
{
  "source": {
    "source": "github",
    "repo": "webpresso/agent-kit",
    "ref": "release/v0.2.0"  // <-- a release branch, not "main"
  }
}
```
