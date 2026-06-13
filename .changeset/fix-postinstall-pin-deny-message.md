---
"@webpresso/agent-kit": patch
---

Fix wp-pretool-guard deny message and add postinstall-pin scaffolder.

`wp setup` now adds `"postinstall": "wp setup"` to consumer `package.json`
so managed hooks are regenerated on every `pnpm install` after an upgrade.

The pretool-guard deny message no longer misleads with "Run vp install" —
it now says "Install @webpresso/agent-kit globally and re-run wp setup."
