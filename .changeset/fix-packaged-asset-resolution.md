---
"@webpresso/agent-kit": patch
---

Fix packaged-asset resolution that worked in a source checkout but broke in the published package.

- `wp audit tph` / `tph-e2e` (and the `wp_audit` MCP tool) resolved the Bun audit script to a `src/audit/*.ts` path the npm tarball never ships (`files` lists `dist`, not `src`), so the audit failed with `bun: Module not found`. A shared, tested resolver now anchors on the caller's module URL and prefers the dev `.ts`, falling back to the compiled `dist/esm/audit/*.js` the build emits.
- `wp blueprint new` and template listing resolved `docs/templates/blueprint.md`, which is also not shipped (only `catalog/docs/templates/` is). A new `resolvePackageAssetPreferred` prefers the source `docs/templates/` and falls back to the shipped `catalog/docs/templates/` — the fallback `router.ts` already documented but never implemented.
- `docs/templates/` (canonical) and `catalog/docs/templates/` (the shipped + `wp init`-scaffolded mirror) had silently diverged across 9 files. The mirror is now regenerated from the canonical at `postbuild` and guarded by a drift test.
