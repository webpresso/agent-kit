# Contributing to `@webpresso/agent-kit`

## Local development

Run the CLI as **`pnpm exec ak <subcommand>`** (or bare `ak <subcommand>` from
inside any pnpm script — pnpm prepends `node_modules/.bin` to `PATH`). Don't
shell out to `node ./dist/esm/cli/cli.js …`: that path is an implementation
detail; the bin is the contract.

```bash
pnpm exec ak blueprint show <slug>
pnpm exec ak blueprint task complete <slug> <task-id>
pnpm exec ak audit blueprint-lifecycle
pnpm exec ak symlink sync
pnpm exec ak tech-debt new "<title>" --severity low --category documentation
```

This works because `prepare` (run automatically on every `pnpm install`) chains
`pnpm run link-self-bins`, which symlinks every entry in `package.json#bin`
into `node_modules/.bin/`. pnpm itself does **not** self-link the package's
own bin during dev — it only links bins of dependencies — so this script
fills the gap for in-repo development. Adding a new bin entry to
`package.json` is a single source of truth: the link script reads it and
extends automatically.

In a consumer repo (e.g. `ozby/ingest-lens`) that has installed
`@webpresso/agent-kit`, the `ak` binary is on `node_modules/.bin/ak`
directly via pnpm's normal dependency-bin linking — no extra step needed
there. **The link-self-bins script is only relevant when working inside this
repo.** Consumers don't have the gap because pnpm symlinks the bins of
every dependency automatically.

If a future webpresso package adds its own `bin` field and wants the same
dev-time `pnpm exec` ergonomics, copy `scripts/link-self-bins.ts` verbatim —
it's generic (reads `package.json#bin`, hardcodes nothing).

See [`AGENTS.md`](./AGENTS.md) for the full operating contract.

## Releases

`agent-kit` ships as both an npm package and a Claude Code plugin distributed via
a marketplace (`.claude-plugin/marketplace.json`). Plugin install is a `git clone`
of this repo at the marketplace ref, so the `dist/` build output **must** be
present at any ref consumers install from — otherwise hook bins and the MCP
server will fail to start with "file not found" errors.

`dist/` is in `.gitignore` on `main`, which keeps day-to-day diffs clean. Releases
are driven by [Changesets](https://github.com/changesets/changesets): contributors
describe their changes in a changeset file, CI opens a "Version Packages" PR to
bump versions, and merging that PR publishes to GitHub Packages and creates a
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
4. CI detects no pending changesets and runs:
   - `pnpm changeset publish` → builds, publishes to GitHub Packages, creates a
     `v<version>` GitHub Release with the changeset summary as release notes.
   - Creates a `release/v<version>` branch with `dist/` committed for marketplace
     consumers.

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
