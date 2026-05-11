---
'@webpresso/agent-vitest': minor
---

Add `@webpresso/source` to vitest's resolve `conditions` in `nodeConfig`,
`webpressoNodeConfig`, `createNodeProjects`, and `createWebpressoNodeProjects`.

Monorepo consumers can now ship workspace packages whose `exports` map a
`@webpresso/source` condition at `./src/*.ts` (with `default` still pointing
at dist for publishability contracts). With this condition wired into the
shared vitest config, fresh-clone test runs resolve workspace-internal
dependencies to source files automatically — no per-package `vitest.config`
drift, no requirement to build dependents before testing.
