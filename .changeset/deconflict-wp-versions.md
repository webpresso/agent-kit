---
"@webpresso/agent-kit": minor
---

Add version-skew warning: emit a stderr notice at `wp` startup when the running global wp version differs from the repo-pinned `@webpresso/agent-kit` in `pnpm-workspace.yaml` catalog. Detection only — no update flow changes.
