import { normalize } from 'node:path';
import { WP_HOOK_BIN_NAMES } from './ir.js';
// Derived from the WP_HOOK_BIN_NAMES single source of truth (ir.ts) so Codex
// ownership detection cannot drift from the emitted direct `wp hook <name>` set.
export const KNOWN_WEBPRESSO_CODEX_BINS = WP_HOOK_BIN_NAMES;
const KNOWN_WEBPRESSO_CODEX_BIN_SET = new Set(KNOWN_WEBPRESSO_CODEX_BINS);
export function isWebpressoOwnedCodexHook(metadata, expectedSourcePaths) {
    if (!isObject(metadata))
        return false;
    const candidate = metadata;
    if (candidate.isManaged !== false)
        return false;
    if (candidate.handlerType !== 'command')
        return false;
    if (candidate.pluginId !== null)
        return false;
    if (typeof candidate.sourcePath !== 'string')
        return false;
    if (typeof candidate.command !== 'string' || candidate.command.trim() === '')
        return false;
    if (!isExpectedSourcePath(candidate.sourcePath, expectedSourcePaths))
        return false;
    const binName = extractDirectWpHookBin(candidate.command);
    return binName !== null && isKnownWebpressoCodexBin(binName);
}
function isObject(value) {
    return typeof value === 'object' && value !== null;
}
function isExpectedSourcePath(sourcePath, expectedSourcePaths) {
    if (expectedSourcePaths.length === 0)
        return false;
    const normalizedSourcePath = normalize(sourcePath);
    return expectedSourcePaths.some((expectedPath) => normalize(expectedPath) === normalizedSourcePath);
}
function isKnownWebpressoCodexBin(binName) {
    return KNOWN_WEBPRESSO_CODEX_BIN_SET.has(binName);
}
function extractDirectWpHookBin(command) {
    const match = /\bwp["']?\s+hook\s+([a-z0-9-]+)/u.exec(command);
    const hookName = match?.[1];
    if (!hookName)
        return null;
    const binName = `wp-${hookName}`;
    return isKnownWebpressoCodexBin(binName) ? binName : null;
}
//# sourceMappingURL=codex-ownership.js.map