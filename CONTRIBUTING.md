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

`dist/` is in `.gitignore` on `main` (see [F1 in the marketplace blueprint](./blueprints/in-progress/agent-kit-claude-plugin-marketplace/_overview.md)),
which keeps day-to-day diffs clean. To bridge that, releases happen on a
dedicated `release/v<version>` branch where `dist/` **is** committed and
tagged. Marketplace consumers must pin to a release tag, not to `main`.

### Cutting a release

1. Make sure `main` is green and your working tree is clean (commit, stash,
   or discard everything first — the script aborts if anything is dirty).
2. Bump `package.json#version` in a normal commit on `main`.
3. Dry-run the release first (this is the safe default — no remote is contacted):

   ```bash
   pnpm release
   # equivalent to: pnpm release --dry-run
   ```

   The script will:

   - verify the working tree is clean,
   - run `pnpm build`,
   - read the version from `package.json`,
   - create a `release/v<version>` branch from `HEAD`,
   - force-add `dist/` (overriding `.gitignore`),
   - commit and annotate-tag the commit `v<version>`,
   - print "[dry-run] would push …" instead of pushing,
   - restore your original branch.

   Inspect the local branch and tag (`git log release/v<version>`,
   `git show v<version>`) and confirm `dist/` is present at the tag.

4. When the dry-run looks correct, push for real:

   ```bash
   pnpm release --no-dry-run
   ```

   This re-runs the same sequence and additionally pushes the tag and the
   `release/v<version>` branch to `origin`. The script always restores you
   to the branch you started on.

   If the dry-run already created the local branch and tag, delete them
   first (`git branch -D release/v<version>` and `git tag -d v<version>`)
   before re-running, or the second invocation will fail on the already-existing refs.

5. Update `.claude-plugin/marketplace.json` (if it pins a specific ref) so
   that consumers picking up the marketplace pull the new tag.

### Why `dist/` is not on `main`

Committing build output on `main` would:

- pollute every PR diff with regenerated bundles,
- guarantee merge conflicts in feature branches,
- split developers between "rebuild and recommit" and "trust CI".

Tag-only `dist/` commits sidestep all three: the day-to-day branch graph
stays clean and only release tags carry the artifacts that marketplace
install consumers need.

### Marketplace consumers: always pin to a tag

When adding `webpresso/agent-kit` to a marketplace consumer, pin to a
release tag — never to `main`. `main` does not contain `dist/` and the
plugin will not function from there.

```jsonc
// in the consumer's marketplace.json
{
  "source": {
    "source": "github",
    "repo": "webpresso/agent-kit",
    "ref": "v0.1.0"  // <-- a release tag, not "main"
  }
}
```
