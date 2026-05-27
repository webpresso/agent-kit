---
'@webpresso/agent-kit': minor
---

Hard-cut `@webpresso/agent-kit` to its generic reusable core:

- keep `wp` as the only canonical CLI surface
- remove the `webpresso` bin from the package contract
- remove branded preset exports (`vitest/webpresso/*`, `tsconfig/webpresso*`, `stryker/webpresso`)
- preserve the generic canonical presets (`vitest/node`, `vitest/react`, `vitest/react-router`, `vitest/workers`, `stryker`, `workers-test`, generic `tsconfig/*`)
- make package-import rules generic by default while keeping a Webpresso-specific profile as explicit opt-in behavior
- update docs and package-surface checks to match the hard-cut contract

This is a breaking contract change for consumers that still relied on the removed branded preset exports or the removed `webpresso` bin.
