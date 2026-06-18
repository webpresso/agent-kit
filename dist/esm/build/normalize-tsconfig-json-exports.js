import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const TSCONFIG_EXPORT_PREFIX = './tsconfig/';
export function normalizeTsconfigJsonExports(manifest) {
    if (!manifest.exports)
        return manifest;
    let changed = false;
    const normalizedExports = { ...manifest.exports };
    for (const [subpath, entry] of Object.entries(manifest.exports)) {
        if (!subpath.startsWith(TSCONFIG_EXPORT_PREFIX) || !subpath.endsWith('.json'))
            continue;
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            continue;
        const importDefault = typeof entry.import === 'string'
            ? entry.import
            : entry.import && typeof entry.import === 'object'
                ? entry.import.default
                : undefined;
        const nextDefault = typeof entry.default === 'string' ? entry.default : importDefault;
        if (typeof nextDefault !== 'string')
            continue;
        const nextImport = typeof entry.import === 'string'
            ? entry.import
            : entry.import && typeof entry.import === 'object'
                ? entry.import.default
                    ? { default: entry.import.default }
                    : undefined
                : undefined;
        const nextEntry = {
            ...entry,
            ...(nextImport === undefined ? {} : { import: nextImport }),
            default: nextDefault,
        };
        if (JSON.stringify(nextEntry) === JSON.stringify(entry))
            continue;
        normalizedExports[subpath] = nextEntry;
        changed = true;
    }
    return changed ? { ...manifest, exports: normalizedExports } : manifest;
}
/**
 * Write `content` to `destPath` atomically via a temp file + rename so
 * concurrent readers (e.g. bun resolving #-subpath imports) never see a
 * truncated or empty intermediate state.
 */
export function atomicWriteFile(destPath, content) {
    const tmpPath = `${destPath}.writing`;
    writeFileSync(tmpPath, content, 'utf8');
    renameSync(tmpPath, destPath);
}
if (import.meta.main) {
    const packageJsonPath = join(process.cwd(), 'package.json');
    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const normalized = normalizeTsconfigJsonExports(manifest);
    if (normalized !== manifest) {
        atomicWriteFile(packageJsonPath, `${JSON.stringify(normalized, null, 2)}\n`);
    }
}
//# sourceMappingURL=normalize-tsconfig-json-exports.js.map