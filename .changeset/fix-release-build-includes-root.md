---
"@webpresso/agent-kit": patch
---

fix(release): include workspace root in pnpm -r build step

`pnpm -r run build` excluded the workspace root (agent-kit itself), so
`dist/` was never built before `changeset publish` ran. The published
tarball contained zero dist files, breaking all compiled subpath exports
(e.g. `@webpresso/agent-kit/vitest/node`).

Fix: add `--include-workspace-root` to the Build step in release.yml so
the root package's tshy-driven `dist/esm/` output is present when the
tarball is packed.
