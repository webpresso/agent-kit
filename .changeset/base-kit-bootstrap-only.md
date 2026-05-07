---
'@webpresso/agent-kit': patch
---

Stop `ak setup --overwrite` from clobbering consumer-owned `.gitignore`
and `pnpm-workspace.yaml`.

Both files are now treated as **bootstrap-only** by the base-kit
scaffolder: written from the catalog template only when absent, never
overwritten once they exist (not even under `--overwrite`).

These are consumer-owned config that grow with project-specific content
the generic template can't reproduce — catalog entries referenced by
`pnpm.overrides`, monorepo-specific ignore patterns for generated
artifacts, etc. Re-templating them on every postinstall silently
deletes that content.

Verified failure mode (webpresso/monorepo, 2026-05-07):
`ak setup --overwrite` running as 0.7.x postinstall reduced
`pnpm-workspace.yaml` from 221 lines (full catalog) to 34 lines
(generic template), removing every catalog entry referenced by
`pnpm.overrides` and making the next `pnpm install` fail with
`ERR_PNPM_CATALOG_IN_OVERRIDES`. The same overwrite stripped
monorepo-specific `.gitignore` rules and unmasked 23k+ generated
artifacts to git status.

The other base-kit templates (`.husky/*`, `.editorconfig`,
`.secretlintrc.json`, `commitlint.config.ts`,
`.github/workflows/ci.webpresso.yml`) keep their existing
`writeFileMerged` behavior — they're agent-kit-versioned configs where
overwrite-on-update is the right semantic.
