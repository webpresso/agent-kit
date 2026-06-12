# Contributing to `@webpresso/agent-kit`

## Local development

Run the CLI as **`./bin/wp <subcommand>`** inside this source repo. Don't shell
out to `node ./dist/esm/cli/cli.js …`: that path is an implementation detail;
the bin wrapper is the contract.

```bash
./bin/wp blueprint show <slug>
./bin/wp blueprint task complete <slug> <task-id>
./bin/wp audit blueprint-lifecycle
./bin/wp sync
./bin/wp tech-debt new "<title>" --severity low --category documentation
```

In consumer repos, pin `@webpresso/agent-kit` with a published semver range
and run global `wp`. Consumers must not execute `node_modules/.bin/wp` or
package-manager wrapper forms.

### Edge-local plugin link (hot-reload hooks from source)

By default, the Claude Code plugin install resolves to a frozen
`~/.claude/plugins/cache/agent-kit/agent-kit/<version>/` snapshot. Iterating
on hooks then requires a Changesets release + plugin reinstall every time —
high friction.

`pnpm dev:link` does two things:

1. Installs `~/.claude/plugins/cache/agent-kit/agent-kit/edge-local` as a
   symlink to **this** working copy.
2. Mirrors every top-level repo entry (`.claude-plugin/`, `src/`,
   `catalog/`, `dist/`, `commands/`, `skills/`, …) into the plugin root
   as symlinks, so `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` and
   `${CLAUDE_PLUGIN_ROOT}/src/mcp/cli.ts` resolve into the live tree even
   though the marketplace install only knows about `<version>.bak.<ts>/`.

```bash
pnpm dev:link
# → ~/.claude/plugins/cache/agent-kit/agent-kit/edge-local
#       → /Users/<you>/repos/webpresso/agent-kit
# → ~/.claude/plugins/cache/agent-kit/agent-kit/{src,.claude-plugin,…}
#       → /Users/<you>/repos/webpresso/agent-kit/{src,.claude-plugin,…}
```

After linking, every hook + MCP invocation fires from live source via
`bun ${CLAUDE_PLUGIN_ROOT}/src/...` — edit `src/hooks/**` or `src/mcp/**`
and the next call uses the change. No `pnpm build`, no Changesets, no
reinstall.

Restart your Claude Code session once after first linking (plugin manifests
are read at session boot).

The script is idempotent: re-running it is a no-op when symlinks are
already correct, and it backs up any non-symlink directory it finds at
the target before replacing it. Run it again any time a marketplace
update overwrites the symlinks.

To go back to a real release install, remove the mirrored symlinks
under `~/.claude/plugins/cache/agent-kit/agent-kit/` and
`/plugin install agent-kit@webpresso` (or restore one of the `*.bak.*`
backups if present).

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
