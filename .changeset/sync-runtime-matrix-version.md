---
"@webpresso/agent-kit": patch
---

Keep the native runtime `optionalDependencies` wired to the package version on every release. The `version` script now runs `sync-runtime-matrix-version` (alongside `sync-marketplace-version`), which derives the `@webpresso/agent-kit-runtime-*` optional deps from `bin/runtime-manifest.json` and pins them to the root version. Previously `changeset version` bumped the root but left the optional deps stale, failing `wp audit package-surface` — as happened for 0.30.0 (root `0.30.0`, optionals stuck at `0.29.3`).
