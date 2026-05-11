---
type: rule
slug: changeset-release
title: Changesets Release Workflow
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-07'
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
- **Never** call `pnpm publish` directly — always go through
  `pnpm changeset publish` so the Changesets lifecycle is honoured.

## Commit sequence — mandatory every release

```
1. Implement changes + commit code
2. pnpm changeset          # creates .changeset/<slug>.md
3. git add .changeset/<slug>.md && git commit -m "chore: add changeset"
4. pnpm changeset version  # bumps version, generates CHANGELOG, removes slug
5. git add package.json CHANGELOG.md .changeset/ && git commit -m "chore(release): @pkg@X.Y.Z"
6. pnpm build              # ensure dist is fresh
7. pnpm changeset publish  # publishes to GitHub Packages, creates git tag
```

Steps 2-3 and 4-5 must each be separate commits. Publishing without the
version-bump commit means the git tag points at the wrong tree.

## How releases work (CI-driven — established repos)

For repos that already have CI (`release.yml` wired to `changesets/action`):

1. Write code on a feature branch.
2. `pnpm changeset` → commit the `.changeset/<slug>.md` with your code.
3. Merge to `main`. CI opens a **"Version Packages"** PR (bumps version +
   updates CHANGELOG).
4. Merge the Version PR → CI runs `pnpm changeset publish`, publishes to
   GitHub Packages, creates a `v<version>` GitHub Release.

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

# 5. Version bump + commit
pnpm changeset version
git add package.json CHANGELOG.md .changeset/ && git commit -m "chore(release): @webpresso/<name>@<version>"

# 6. Build + publish
pnpm build
pnpm changeset publish
```

**Do NOT skip steps 4-5.** Publishing without the committed version bump leaves
the git history without a release commit — the package is on the registry but
there is no corresponding tag or CHANGELOG commit.

## Release workflow (self-contained Changesets)

The active pattern for the three public repos (`webpresso/framework/`,
`webpresso/ui-kit/`, `webpresso/agent-kit/`) is a **self-contained
`release.yml`** using `changesets/action` directly — **not** the legacy
`release-package.yml@main` reusable workflow from a previous era.
Copy `webpresso/framework/.github/workflows/release.yml` verbatim when
bootstrapping a new public repo. (The pre-consolidation siblings
`webpresso/runtime/`, `webpresso/i18n/`, `webpresso/utils/`,
`webpresso/db-branching/`, `webpresso/tooling/`, and
`webpresso/workers-test-kit/` were absorbed into framework/ui-kit/agent-kit
and archived in the consolidate-11-public-... cycle; their packages now
live in those three repos.)

The `release.yml` mechanics:
- **Changeset files present** → action opens/updates a "Version Packages" PR.
- **No changeset files** (after Version PR merge) → action runs
  `pnpm changeset publish`.
- Auth: `GH_PACKAGES_TOKEN` env var consumed by `.npmrc`.

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
pnpm run sync-marketplace-version`, so the "Version Packages" PR opened by CI
already includes the updated manifest.

**Never manually edit `marketplace.json#version`** — let the release script
do it. If you see a drift (e.g. after a hotfix that bypasses the script), run:

```bash
bun scripts/sync-marketplace-version.ts
```

The drift gate in `src/build/validate-marketplace.test.ts` catches any
desync during the regular test run.
