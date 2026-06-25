---
type: rule
slug: changeset-release
title: Changesets Release Workflow
status: active
scope: repo
applies_to: [agents]
related: []
created: "2026-05-07"
last_reviewed: "2026-05-28"
paths:
  - ".changeset/**"
  - ".github/workflows/*.yml"
  - "package.json"
  - "CHANGELOG.md"
  - "src/**"
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

## How releases work (CI-driven Version PR + publish on merge)

When a feature branch with a `.changeset/<slug>.md` file merges to `main`,
`release.yml` runs the following sequence automatically:

1. `changesets/action` opens or updates a **Version Packages** PR.
2. The action runs `pnpm run version`, which preserves the canonical version
   path: `changeset version && vp run sync-marketplace-version`.
3. When the Version PR is merged, CI runs `pnpm run release:publish`, which
   calls `npm publish --provenance --access public`.
4. After publish, CI verifies the `v<version>` tag on the mainline version-bump
   commit and creates `release/v<version>` as the separate dist-carrying
   compatibility branch for marketplace consumers.
5. After publish, CI compiles the native `wp` runtime binaries for every
   target in `RUNTIME_TARGETS` (darwin/linux/windows × arm64/x64, cross-built
   with bun) and creates the `v<version>` **GitHub Release** with those
   binaries attached as downloadable assets. The `changesets/action` keeps
   `createGithubReleases: false`; the release object is created in a dedicated
   post-publish step so the custom binary assets can be attached (the action
   cannot attach them). This runs only in the real publish path, never in the
   changesets version-PR working tree.

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
for established repos — CI owns both steps through `changesets/action`. Manual
execution bypasses the Version PR flow, the release branch contract, and the
evidence gates.

## Release workflow (self-contained Changesets)

The active pattern is a self-contained `release.yml` in this repository that
handles versioning and publish end-to-end. Do not reintroduce legacy
reusable-release workflow templates here.

## First-time npm package creation for trusted publishing

npm trusted publishing can only be configured after the npm package record
exists. For any new package name that `release.yml` will later publish through
OIDC, create the package once from the CLI, then add the trusted publisher in
npmjs.

Why this exists:

- npm's trusted publisher UI is package-scoped; a package that has never been
  published has no package settings page.
- This repo intentionally does not use `NPM_TOKEN` or `NODE_AUTH_TOKEN`
  fallbacks, so the real release path cannot publish a brand-new package name
  until npm already trusts this repository/workflow/package tuple.
- The one-time CLI publish should create only the npm package record. The real
  release artifacts and provenance still come from GitHub Actions.

Use this flow for newly introduced package names, including generated platform
packages such as `@webpresso/agent-kit-session-memory-<target>`:

```bash
# 1. Build a minimal bootstrap package outside the repo working tree.
tmp="$(mktemp -d)"
pkg='@webpresso/agent-kit-session-memory-darwin-x64'
dir="$tmp/${pkg#@webpresso/}"
mkdir -p "$dir"
cat > "$dir/package.json" <<EOF
{
  "name": "$pkg",
  "version": "0.0.0",
  "description": "Bootstrap placeholder for npm trusted publishing setup. Do not install directly.",
  "license": "MIT",
  "type": "commonjs",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/webpresso/agent-kit.git"
  },
  "publishConfig": {
    "registry": "https://registry.npmjs.org/",
    "access": "public"
  },
  "files": ["README.md"]
}
EOF
printf '# %s\n\nBootstrap placeholder for npm trusted publishing setup.\n' "$pkg" > "$dir/README.md"

# 2. Confirm the package contents before creating the registry record.
npm pack --dry-run --json "$dir"

# 3. Publish the placeholder under a non-release dist-tag.
# npm auth-type should be "web"; run in a TTY so browser auth can complete.
npm publish "$dir" --access public --tag bootstrap --auth-type=web
```

After the package exists in npmjs, configure trusted publishing for that
package:

- **Package**: the exact package name, for example
  `@webpresso/agent-kit-session-memory-darwin-x64`
- **Repository owner/name**: `webpresso/agent-kit`
- **Workflow file**: `release.yml`
- **Environment**: leave unset/blank unless `.github/workflows/release.yml`
  later adds a job-level `environment:` value

Use `.github/workflows/release.yml` — not `ci.agent-kit.yml` and not the
artifact-only matrix job names — because the `release` job in `release.yml`
is the job that runs `pnpm run release:publish`, has `id-token: write`, and
invokes `npm publish --provenance --access public`.

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
