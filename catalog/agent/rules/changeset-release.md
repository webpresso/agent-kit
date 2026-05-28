---
type: rule
slug: changeset-release
title: Changesets Release Workflow
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-28'
paths: 
  - '.changeset/**'
  - '.github/workflows/*.yml'
  - 'package.json'
  - 'CHANGELOG.md'
  - 'src/**'
---

# Changesets Release Workflow

This repository uses **Changesets** for version management and publishing.
The active package identity here is `@webpresso/agent-kit` and the publish
target is the public npm registry (`https://registry.npmjs.org/`).

## Never do these

- **Never** push `v*` tags manually for release purposes.
- **Never** bump `package.json#version` by hand.
- **Never** run `git tag v<X.Y.Z>` to trigger a publish.
- **Never** run `vp run changeset publish` (or `changeset version`) without
  committing the results first. `changeset version` modifies `package.json`,
  `CHANGELOG.md`, and `.changeset/` — all three must be committed before
  publishing. Unpublished version bumps in the working tree produce a valid
  tarball but leave git history incoherent.
- **Never** publish from a dirty working tree. Run `git status` first; commit
  or stash everything before `changeset publish`.
- **Never** treat `webpresso` (unscoped) as this repo's canonical release
  package. This repo ships `@webpresso/agent-kit`.

## Commit sequence — mandatory every release

```
1. Implement changes + commit code
2. vp run changeset          # creates .changeset/<slug>.md
3. git add .changeset/<slug>.md && git commit -m "chore: add changeset"
4. Merge to main           # CI runs version bump + public npm publish automatically
```

Steps 2-3 happen on the feature branch alongside the code change. There is
no manual `vp run changeset version` or `vp run changeset publish` step in the
normal path — CI owns those for this repository.

## How releases work (CI-driven, direct-publish on push to `main`)

**This repo uses a direct-publish flow — there is no \"Version Packages\" PR.**

When a feature branch with a `.changeset/<slug>.md` file merges to `main`,
`release.yml` runs the following sequence automatically:

1. `vp run version` — runs `changeset version &&
   vp run sync-marketplace-version`. This bumps `package.json`, updates
   `CHANGELOG.md`, removes the consumed `.changeset/<slug>.md` files, and
   syncs `.claude-plugin/marketplace.json` to match the new version.
2. `npm publish --provenance --access public` — publishes
   `@webpresso/agent-kit` to the public npm registry using the workflow-owned
   publish path.
3. `git push` — commits the version bump back to `main` only after publish
   succeeds or the version is already published.
4. CI creates a `release/v<version>` branch with compiled `dist/` committed
   for Claude Code marketplace consumers.

The workflow supports a manual dry-run trigger:
```bash
gh workflow run release.yml -f dry-run=true
```

## First-time setup — new extracted repos

For a freshly bootstrapped repo that has never been published:

```bash
# 1. Ensure @changesets/cli is in devDependencies
grep -q '@changesets/cli' package.json || vp install -D @changesets/cli

# 2. Initialise changeset
vp run changeset init                  # creates .changeset/config.json + README

# 3. Enter prerelease mode (for alpha/beta dist-tags)
vp run changeset pre enter alpha       # creates .changeset/pre.json

# 4. Create the initial changeset and commit it
cat > .changeset/initial-release.md << 'EOF'
---
"@webpresso/agent-kit": minor
---

Initial release for @webpresso/agent-kit.
EOF
git add .changeset/ && git commit -m "chore: add initial changeset"

# 5. Merge to main — CI runs version bump + publish automatically
```

**Do NOT run `vp run changeset version` or `vp run changeset publish` manually**
for established repos — CI owns both steps. Manual execution bypasses the
`sync-marketplace-version` script and the release branch flow.

## Release workflow (self-contained Changesets)

The active pattern is a self-contained `release.yml` in this repository that
handles versioning and publish end-to-end. Do not reintroduce legacy
reusable-release workflow templates here.

## Required repo files

This repository must have:
```
.npmrc               # public npm registry defaults only; no GitHub Packages remap
.changeset/config.json   # baseBranch: "main"
@changesets/cli      # in devDependencies
```

Without `@changesets/cli` in `devDependencies`, `vp run changeset` is
unavailable in CI.

## Changeset config

`.changeset/config.json` in each repo:
- `baseBranch: "main"`.
- `updateInternalDependencies: "patch"`.

For the first scoped public npm release, the effective publish path must set
public visibility (for example via `package.json#publishConfig.access` or an
explicit workflow flag). Do not leave the release contract depending on a
restricted/private default.

## Marketplace specifics

After publishing, CI creates a `release/v<version>` branch with `dist/`
committed. Claude Code marketplace consumers **must** pin to
`release/v<version>` — never to `main`, which has no `dist/`.

```jsonc
// marketplace.json consumer reference
{ "source": { "repo": "OWNER/REPO", "ref": "release/v0.2.0" } }
```

### marketplace.json version sync (automated)

`.claude-plugin/marketplace.json` must always mirror `package.json#version`.
This is automated: the `version` npm script runs `changeset version &&
vp run sync-marketplace-version`, so the version bump that CI commits to
`main` already includes the updated manifest.

**Never manually edit `marketplace.json#version`** — let the release script
do it. If you see a drift (e.g. after a hotfix that bypasses the script), run:

```bash
bun scripts/sync-marketplace-version.ts
```

The drift gate in `src/build/validate-marketplace.test.ts` catches any
desync during the regular test run.
