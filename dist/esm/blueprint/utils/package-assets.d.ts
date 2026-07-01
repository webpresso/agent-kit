interface FindPackageAssetOptions {
    readonly moduleUrl?: string;
    readonly cwd?: string;
    readonly execPath?: string;
    readonly argv0?: string;
    readonly argv1?: string;
}
/**
 * Walk up from this file's location looking for `relativeFromRoot`. Returns the
 * first existing match, or `null` if none is found within the ancestor budget.
 */
export declare function findPackageAsset(relativeFromRoot: string, options?: FindPackageAssetOptions): string | null;
/**
 * Walk up from this file's location until the given path (relative to the
 * package root) is found. Works whether running from src/ or dist/esm/.
 */
export declare function resolvePackageAsset(relativeFromRoot: string): string;
/**
 * Resolve the first existing candidate, in priority order. Use when an asset
 * lives at one path in the source checkout but a different path in the
 * published tarball — e.g. templates authored under repo-root `docs/templates/`
 * but shipped under `catalog/docs/templates/` because the npm `files` list
 * includes `catalog/` and not `docs/`. Prefers the dev/source location and
 * falls back to the shipped one, mirroring `bin/_run.js`'s source→built path
 * translation. Falls back to cwd-relative on the first candidate when none
 * exist, matching `resolvePackageAsset`'s last-resort behavior.
 */
export declare function resolvePackageAssetPreferred(candidates: readonly string[]): string;
export {};
//# sourceMappingURL=package-assets.d.ts.map