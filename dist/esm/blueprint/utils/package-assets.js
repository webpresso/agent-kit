import { existsSync } from 'node:fs';
import path from 'node:path';
/**
 * Walk up from this file's location until the given path (relative to the
 * package root) is found. Works whether running from src/ or dist/esm/.
 */
export function resolvePackageAsset(relativeFromRoot) {
    let dir = path.dirname(new URL(import.meta.url).pathname);
    for (let i = 0; i < 8; i++) {
        const candidate = path.join(dir, relativeFromRoot);
        if (existsSync(candidate))
            return candidate;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return path.join(process.cwd(), relativeFromRoot);
}
//# sourceMappingURL=package-assets.js.map