import { normalize } from 'node:path';
import { WP_HOOK_BIN_NAMES } from './ir.js';
import { stripSingleShellQuotePair } from './shell-identity.js';
// Derived from the WP_HOOK_BIN_NAMES single source of truth (ir.ts) so codex
// ownership detection cannot drift from the emitted/installed wp-* hook set.
export const KNOWN_WEBPRESSO_CODEX_BINS = WP_HOOK_BIN_NAMES;
const KNOWN_WEBPRESSO_CODEX_BIN_SET = new Set(KNOWN_WEBPRESSO_CODEX_BINS);
// `.codex/managed-hooks`-only launcher forms (narrower than the cross-vendor
// managed-launcher patterns in shell-identity.ts).
const MANAGED_LAUNCHER_PATTERN = /^(?:["']?)((?:\.\/|\/.*\/)?\.codex\/managed-hooks\/(wp-[\w-]+)\.sh)(?:["']?)$/u;
const GUARDED_MANAGED_LAUNCHER_PATTERN = /^\[ -x (["']?)((?:\.\/|\/.*\/)?\.codex\/managed-hooks\/(wp-[\w-]+)\.sh)\1 \] && \1\2\1 \|\| (?:true|printf .+)$/u;
const IF_GUARDED_MANAGED_LAUNCHER_PATTERN = /^if \[ -x (["']?)((?:\.\/|\/.*\/)?\.codex\/managed-hooks\/(wp-[\w-]+)\.sh)\1 \]; then \1\2\1; else (?:true|printf .+); fi$/u;
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
    const binName = extractDirectNodeModulesBin(candidate.command);
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
function extractDirectNodeModulesBin(command) {
    const normalizedCommand = stripSingleShellQuotePair(command.trim());
    const managedLauncherMatch = MANAGED_LAUNCHER_PATTERN.exec(normalizedCommand);
    if (managedLauncherMatch?.[2])
        return managedLauncherMatch[2];
    const guardedManagedLauncherMatch = GUARDED_MANAGED_LAUNCHER_PATTERN.exec(command.trim());
    if (guardedManagedLauncherMatch?.[3])
        return guardedManagedLauncherMatch[3];
    const ifGuardedManagedLauncherMatch = IF_GUARDED_MANAGED_LAUNCHER_PATTERN.exec(command.trim());
    return ifGuardedManagedLauncherMatch?.[3] ?? null;
}
//# sourceMappingURL=codex-ownership.js.map