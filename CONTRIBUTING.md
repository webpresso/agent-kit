# Contributing to `@webpresso/agent-kit`

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
