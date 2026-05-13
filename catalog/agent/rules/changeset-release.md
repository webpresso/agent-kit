---
type: rule
slug: changeset-release
title: Changesets Release Workflow
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-12'
paths: 
  - '.changeset/**'
  - '.github/workflows/*.yml'
  - 'package.json'
  - 'CHANGELOG.md'
  - 'src/**'
---

# Changesets Release Workflow

All webpresso public packages use **Changesets** for version management and
publishing. The legacy tag-push + `release-package.yml` pattern is retired.

## Never do these

- **Never** push `v*` tags manually for release purposes.
- **Never** bump `package.json#version` by hand.
- **Never** run `git tag v<X.Y.Z>` to trigger a publish.
- **Never** run `pnpm changeset publish` (or `changeset version`) without
  committing the results first. `changeset version` modifies `package.json`,
  `CHANGELOG.md`, and `.changeset/` — all three must be committed before
  publishing. Unpublished version bumps in the working tree produce a valid
  tarball but leave git history incoherent.
- **Never** publish from a dirty working tree. Run `git status` first; commit
  or stash everything before `changeset publish`.
- **Never** call `pnpm publish` directly — always go through the CI workflow
  so the Changesets lifecycle and dual-publish step are both honoured.

## Commit sequence — mandatory every release

```
1. Implement changes + commit code
2. pnpm changeset          # creates .changeset/<slug>.md
3. git add .changeset/<slug>.md && git commit -m "chore: add changeset"
4. Merge to main           # CI runs version bump + both publish steps automatically
```

Steps 2-3 happen on the feature branch alongside the code change. There is
no manual `pnpm changeset version` or `pnpm changeset publish` step for
established repos — CI owns those entirely.

## How releases work (CI-driven, direct-publish on push to main)

**This repo uses a direct-publish flow — there is no "Version Packages" PR.**

When a feature branch with a `.changeset/<slug>.md` file merges to `main`,
`release.yml` runs the following sequence automatically:

1. `pnpm run version` — runs `changeset version &&
   pnpm run sync-marketplace-version`. This bumps `package.json`, updates
   `CHANGELOG.md`, removes the consumed `.changeset/<slug>.md` files, and
   syncs `.claude-plugin/marketplace.json` to match the new version.
2. `git push` — commits the version bump directly to `main`.
3. `pnpm changeset publish` — publishes `@webpresso/agent-kit` to GitHub
   Packages (legacy source package, frozen after the `webpresso` rename).
4. `bun scripts/publish-webpresso.ts` — publishes `webpresso` to public
   npmjs.org (see Dual-publish pattern below).
5. CI creates a `release/v<version>` branch with compiled `dist/` committed
   for Claude Code marketplace consumers.

The workflow supports a manual dry-run trigger:
```bash
gh workflow run release.yml -f dry-run=true
```

## Dual-publish pattern

`@webpresso/agent-kit` (GitHub Packages) and `webpresso` (public npmjs.org)
carry the same version and the same code. Consumers should install
`webpresso` and use its `webpresso/*` subpath exports for folded agent config
helpers instead of adding retired split agent config packages.
Changesets has no native dual-registry support, so the second publish is driven by
`scripts/publish-webpresso.ts`:

1. Reads the just-bumped `package.json#version`.
2. Builds a staging directory at `dist-publish/` containing a swapped
   `package.json`:
   - `name: "webpresso"`
   - `publishConfig: { registry: "https://registry.npmjs.org", access: "public" }`
   - `bin: { wp, webpresso, ak, ...hook bins }`
   - `preferGlobal: true`
   — plus copies of `dist/`, `src/`, `catalog/`, `just/`, `docs/`,
   `skills/`, `commands/`, `.claude-plugin/`, and `README.md`.
3. Writes a temporary `.npmrc` in the staging directory authenticated via
   `NPM_TOKEN`.
4. Runs `pnpm publish dist-publish --no-git-checks --access public`.
5. Cleans up the staging directory in a `try/finally` block — cleanup runs
   on both success and failure.

`package.json#name` remains `@webpresso/agent-kit` throughout; the staging
directory is an ephemeral build artifact, never committed.

After the `webpresso` rename ships, the `pnpm changeset publish` step (step 3
above) will be removed in a follow-up PR, leaving `publish-webpresso.ts` as
the sole publish step.

## First-time setup — new extracted repos

For a freshly bootstrapped repo that has never been published:

```bash
# 1. Ensure @changesets/cli is in devDependencies
grep -q '@changesets/cli' package.json || pnpm add -D @changesets/cli

# 2. Initialise changeset
pnpm changeset init                  # creates .changeset/config.json + README

# 3. Enter prerelease mode (for alpha/beta dist-tags)
pnpm changeset pre enter alpha       # creates .changeset/pre.json

# 4. Create the initial changeset and commit it
cat > .changeset/initial-release.md << 'EOF'
---
"@webpresso/<name>": minor
---

Initial public extraction from Webpresso monorepo.
EOF
git add .changeset/ && git commit -m "chore: add initial changeset"

# 5. Merge to main — CI runs version bump + publish automatically
```

**Do NOT run `pnpm changeset version` or `pnpm changeset publish` manually**
for established repos — CI owns both steps. Manual execution bypasses the
`sync-marketplace-version` script and the dual-publish step.

## Release workflow (self-contained Changesets)

The active pattern for the three public repos (`webpresso/framework/`,
`webpresso/ui-kit/`, `webpresso/agent-kit/`) is a **self-contained
`release.yml`** that calls the Changesets CLI directly — **not** the legacy
`release-package.yml@main` reusable workflow from a previous era.
Copy `webpresso/agent-kit/.github/workflows/release.yml` verbatim when
bootstrapping a new public repo.

## Required repo files

Every webpresso public package must have:
```
.npmrc               # @webpresso:registry=https://npm.pkg.github.com + auth token env-var
.changeset/config.json   # access: "restricted", baseBranch: "main"
@changesets/cli      # in devDependencies
```

Without `.npmrc`, CI publish fails auth. Without `@changesets/cli` in
`devDependencies`, `pnpm changeset` is unavailable in CI.

## Changeset config

`.changeset/config.json` in each repo:
- `access: "restricted"` — GitHub Packages private registry.
- `baseBranch: "main"`.
- `updateInternalDependencies: "patch"`.
- `webpresso/webpresso` additionally uses `fixed: [all 8 packages]` for
  lockstep versioning across the framework umbrella.

## agent-kit marketplace specifics

After publishing, CI creates a `release/v<version>` branch with `dist/`
committed. Claude Code marketplace consumers **must** pin to
`release/v<version>` — never to `main`, which has no `dist/`.

```jsonc
// marketplace.json consumer reference
{ "source": { "repo": "webpresso/agent-kit", "ref": "release/v0.2.0" } }
```

### marketplace.json version sync (automated)

`.claude-plugin/marketplace.json` must always mirror `package.json#version`.
This is automated: the `version` npm script runs `changeset version &&
pnpm run sync-marketplace-version`, so the version bump that CI commits to
`main` already includes the updated manifest.

**Never manually edit `marketplace.json#version`** — let the release script
do it. If you see a drift (e.g. after a hotfix that bypasses the script), run:

```bash
bun scripts/sync-marketplace-version.ts
```

The drift gate in `src/build/validate-marketplace.test.ts` catches any
desync during the regular test run.
