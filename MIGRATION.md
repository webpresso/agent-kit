---
type: guide
title: Migrating to webpresso
last_updated: '2026-05-12'
---

# Migrating from `@webpresso/agent-kit` to `webpresso`

The package has been renamed from `@webpresso/agent-kit` (GitHub Packages,
scoped) to `webpresso` (public npmjs.org, unscoped). The CLI gains two new
primary bin aliases — `wp` and `webpresso` — while `ak` continues to work.

---

## Why this change

`@webpresso/agent-kit` was published to GitHub Packages, which requires `.npmrc`
authentication setup before a single `pnpm add` can succeed. For a globally
installed developer tool, that friction blocks the first-run experience.

`webpresso` on public npmjs.org removes that barrier: `npm install -g webpresso`
works with zero `.npmrc` configuration. It is the same code, same version, same
bins — just a different registry and package name.

`@webpresso/agent-kit` is frozen after this release. No future changes will be
published to it.

---

## Prerequisites

**Bun is required.** The CLI bins ship as TypeScript source with
`#!/usr/bin/env bun` shebangs. Install bun globally before running any `wp`
or `ak` command:

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify:

```bash
bun --version   # should print 1.x or higher
```

---

## Install

### Global install (recommended)

```bash
# npm
npm install -g webpresso

# pnpm
pnpm add -g webpresso

# yarn
yarn global add webpresso

# bun
bun add -g webpresso
```

### Verify the install

All three aliases resolve to the same binary:

```bash
wp --version
webpresso --version
ak --version
```

All three should print the same version string.

---

## Uninstall the old package

### If you had a previous global install of `@webpresso/agent-kit`

```bash
npm uninstall -g @webpresso/agent-kit
# or:
pnpm remove -g @webpresso/agent-kit
```

### If you had `@webpresso/agent-kit` as a devDependency in a repo

```bash
pnpm remove @webpresso/agent-kit
pnpm add -D webpresso
```

Update any `npx ak` invocations in scripts and CI to `wp` (or keep `ak` —
both work).

---

## State files

Existing `.agent/.blueprints.db` and other `.agent/` state files are harmless
orphans after migration. You do not need to delete them manually.

The `webpresso` package (v0.15+) stores runtime state under
`~/.local/state/webpresso/<repo-id>/` (XDG state dir, keyed by git common
dir). The first `wp` command in a repo cold-starts the blueprint DB by
projecting the `blueprints/` markdown files it finds — no manual migration
step is required.

---

## Hook bins

The hook entry-point binary names are unchanged:

- `ak-pretool-guard`
- `ak-post-tool`
- `ak-stop-qa`
- `ak-guard-switch`
- `ak-sessionstart-routing`

Existing `.claude/settings.json` and `.codex/hooks.json` wired to these names
do not need to be updated.

---

## Plugin marketplace

No change needed. Claude Code marketplace consumers reference the repo and
branch, not the npm package name:

```jsonc
// marketplace.json consumer reference — unchanged
{ "source": { "repo": "webpresso/agent-kit", "ref": "release/v0.15.0" } }
```

---

## Opt-outs

| Env var | Effect |
| --- | --- |
| `AK_SKIP_UPDATE_CHECK=1` | Suppress the auto-update notifier on startup |
| `AK_SKIP_AUTO_INSTALL=1` | Skip automatic background install when an update is detected |

---

## Troubleshooting

**`bun: command not found`** — bun is not on your PATH. Install it:
```bash
curl -fsSL https://bun.sh/install | bash
```
Then open a new terminal session so the PATH change takes effect.

**`wp: command not found` after global install** — your global npm/pnpm bin
directory may not be on PATH. Check `npm bin -g` or `pnpm bin -g` and add it
to your shell's `PATH`.

**Old `@webpresso/agent-kit` still runs when I type `ak`** — you have the old
package in a local `node_modules/.bin/ak`. Uninstall it from the repo's
devDependencies (`pnpm remove @webpresso/agent-kit`) and re-run `pnpm install`.
