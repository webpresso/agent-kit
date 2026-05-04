---
paths:
  - '.changeset/**'
  - '.github/workflows/*.yml'
  - 'package.json'
  - 'CHANGELOG.md'
---

# Changesets Release Workflow

All webpresso public packages use **Changesets** for version management and
publishing. The legacy tag-push + `release-package.yml` pattern is retired.

## Never do these

- **Never** push `v*` tags manually for release purposes.
- **Never** bump `package.json#version` by hand.
- **Never** run `git tag v<X.Y.Z>` to trigger a publish.

## How releases work (CI-driven)

1. Write your code change on a feature branch.
2. Run `pnpm changeset` — follow the prompts to select bump type
   (`patch` / `minor` / `major`) and write a human-readable summary.
3. Commit the generated `.changeset/<random-slug>.md` alongside your code.
4. Merge your PR to `main`. CI (`release.yml`) opens/updates a
   **"Version Packages"** PR that bumps `version` and updates `CHANGELOG.md`.
5. A maintainer merges the Version PR. CI publishes to GitHub Packages and
   creates a `v<version>` GitHub Release.

## Local commands

```bash
pnpm changeset           # describe a change interactively
pnpm changeset:status    # list pending (unpublished) changesets
```

## Workflow mechanics

The `release.yml` uses `changesets/action@v1.7.0`:

- **Changeset files present** → action creates/updates the Version PR (no publish).
- **No changeset files** (after Version PR merge) → action runs
  `pnpm changeset publish` which triggers `prepublishOnly` (builds) then
  publishes to `npm.pkg.github.com`.
- Auth: `GH_PACKAGES_TOKEN` env var consumed by the repo's `.npmrc`.

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
