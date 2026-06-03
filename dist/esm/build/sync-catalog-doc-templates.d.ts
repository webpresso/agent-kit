#!/usr/bin/env bun
/**
 * sync-catalog-doc-templates.ts
 *
 * `docs/templates/` (repo root) is the editable source of truth for the
 * blueprint / doc templates. `catalog/docs/templates/` is the published +
 * scaffolded mirror: the npm `files` list ships `catalog/` but NOT repo-root
 * `docs/` (which holds internal docs that must stay private), and `wp init`
 * scaffolds templates into a consumer from `catalog/docs/templates/`.
 *
 * The two MUST stay byte-identical. Nothing synced them before, so they
 * drifted — this script regenerates the mirror from the source and is wired
 * into the build. The colocated drift test fails CI if they ever diverge.
 *
 * Default: regenerate the mirror from the source.
 * `--check`: exit non-zero and list drift without writing (CI / pre-publish).
 */
/**
 * Names that are out of sync between source and mirror: content mismatch,
 * missing from the mirror, or orphaned in the mirror.
 */
export declare function diffDocTemplateMirror(): string[];
//# sourceMappingURL=sync-catalog-doc-templates.d.ts.map