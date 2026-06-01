---
"@webpresso/agent-kit": patch
---

`wp test` and `wp typecheck` now resolve Vitest and tsc through structured package resolution (`resolveLocalPackageEntrypoint` → the installed `vitest.mjs` / `typescript/bin/tsc`, launched with the current Node runtime) and degrade deterministically to `vp exec <tool>` when the local entrypoint is absent. This removes the hardcoded `node_modules/.bin/vitest` launch assumption that broke MCP-driven test runs in workspaces where the `.bin` shim was not present, without introducing a silent fallback (both paths are explicitly `source: "managed"`).
