---
"@webpresso/agent-kit": patch
---

Fix the native-runtime-matrix release deadlock. The `@webpresso/agent-kit-runtime-*` optionalDependencies are added to the published tarball at the package version by `createPackedManifest` at pack time, and the runtime matrix is published before the root package — so the committed `package.json` must NOT carry them. Committing them (via the previous `sync-runtime-matrix-version` step) pinned `pnpm-lock.yaml` to a runtime version that only exists *after* the release publishes it, deadlocking every CI job's `pnpm install --frozen-lockfile`. This removes the committed runtime optionals and the sync step, and validates the wiring against the **packed** manifest in `wp audit package-surface` instead of the raw committed manifest.
