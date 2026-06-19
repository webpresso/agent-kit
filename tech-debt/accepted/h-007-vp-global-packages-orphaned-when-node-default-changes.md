---
type: tech-debt
status: accepted
severity: medium
category: dependency
review_cadence: monthly
last_reviewed: '2026-06-19'
created: '2026-06-19'
linked_blueprints: []
affected_modules: []
---

# vp global packages orphaned when Node default changes

## Context

`wp` is distributed as a **vite-plus global package** (`@webpresso/agent-kit`), which carries
native ABI-locked bindings (`@webpresso/agent-kit-runtime-darwin-*`, `better-sqlite3`). vp
installs globals against one Node version (recorded in `~/.vite-plus/bins/<bin>.json`).

When vp's active/default Node version changes, the global is **not** rebuilt for the new
runtime, so `wp` stops resolving:

```
vp: Binary 'wp' not found: Package @webpresso/agent-kit not found
```

The common trigger is that vp tracks **latest LTS** unless a default is pinned, so it
auto-advances (e.g. 24.15 → 24.16 → 24.17) on its own and orphans every global. Observed
twice for one user on 2026-06-19.

## Gotcha (important)

`vp update -g` and `vp update -g --reinstall-node-mismatch` do **not** repair this. The
failure leaves metadata claiming "installed @ current Node" while the on-disk store is gone;
update commands trust the metadata and report *"All global packages are up to date"* while
`wp` stays broken. Only `vp install -g @webpresso/agent-kit --node <ver>` rebuilds the store.

## Mitigation

- Pin the Node default so vp stops auto-advancing: `vp env default <ver>`.
- Repair when broken: `vp install -g @webpresso/agent-kit --node <ver>`.

## Why this is debt

Root cause is upstream in **vite-plus** (globals should survive a runtime change, or
`vp update -g` should detect a missing store and rebuild). agent-kit only inherits the
breakage because it ships as a native-binding vp global. Until vp fixes it, every consumer who
lets vp auto-advance Node will hit "Package not found".

## Watch points (review every cadence)

- vite-plus release notes / `vp update -g` behavior — does a newer vp reinstall globals across
  a Node default change, or detect a missing store?
- Whether `wp setup`/postinstall should pin the vp Node default or self-check the store.
