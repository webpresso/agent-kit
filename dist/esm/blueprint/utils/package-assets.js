import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
function isBunVirtualPath(filePath) {
    return filePath === '/$bunfs/root' || filePath.startsWith('/$bunfs/root/');
}
function modulePathFromUrl(moduleUrl) {
    try {
        return fileURLToPath(moduleUrl);
    }
    catch {
        return null;
    }
}
function isUsableStartPath(filePath) {
    return typeof filePath === 'string' && filePath.length > 0 && !isBunVirtualPath(filePath);
}
function findFromStartPath(startPath, relativeFromRoot) {
    let dir = path.dirname(startPath);
    for (let i = 0; i < 8; i++) {
        const candidate = path.join(dir, relativeFromRoot);
        if (existsSync(candidate))
            return candidate;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
}
/**
 * Walk up from this file's location looking for `relativeFromRoot`. Returns the
 * first existing match, or `null` if none is found within the ancestor budget.
 */
export function findPackageAsset(relativeFromRoot, options = {}) {
    const starts = [
        modulePathFromUrl(options.moduleUrl ?? import.meta.url),
        options.argv1 ?? process.argv[1],
        options.execPath ?? process.execPath,
        options.argv0 ?? process.argv[0],
        path.join(options.cwd ?? process.cwd(), 'package.json'),
    ];
    for (const start of starts) {
        if (!isUsableStartPath(start))
            continue;
        const found = findFromStartPath(start, relativeFromRoot);
        if (found)
            return found;
    }
    return null;
}
/**
 * Walk up from this file's location until the given path (relative to the
 * package root) is found. Works whether running from src/ or dist/esm/.
 */
export function resolvePackageAsset(relativeFromRoot) {
    return findPackageAsset(relativeFromRoot) ?? path.join(process.cwd(), relativeFromRoot);
}
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
export function resolvePackageAssetPreferred(candidates) {
    for (const relativeFromRoot of candidates) {
        const found = findPackageAsset(relativeFromRoot);
        if (found)
            return found;
    }
    const primary = candidates[0];
    if (primary === undefined) {
        throw new Error('resolvePackageAssetPreferred requires at least one candidate path');
    }
    return path.join(process.cwd(), primary);
}
//# sourceMappingURL=package-assets.js.map