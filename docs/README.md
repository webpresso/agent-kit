---
type: docs-index
last_updated: '2026-06-13'
---

# webpresso docs

Start here:

- Install from the public npm registry with Node.js 24+:
  `npm install -g @webpresso/agent-kit && wp setup`
- `wp` bundles the package/task facade it needs; a separate global `vp` install is not required.
- [Getting started](./getting-started.md)
- [Is webpresso for me?](./is-agent-kit-for-me.md)
- [Add-ons](./add-ons.md)

Core references:

- [Blueprint format](./blueprint-format.md)
- [Lifecycle](./lifecycle.md)
- [Skills catalog](./skills-catalog.md)
- [Package references](./markdown-fact-check.md)
- [`wp` extension runtime](./wp-extension-runtime.md)

Maintainer release gate:

- Run `vp run public:readiness` for the package-release gate.
- Run `vp run public:readiness -- --require-repo-visibility` only when the
  history/public-visibility strategy has also been executed.

The product surface should stay simple: install the package, run `wp setup`, and
let the repo own one shared agent contract.
