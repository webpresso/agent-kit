import { normalize } from 'node:path';
import { MANAGED_OMX_GLOBAL_HOOK_BASENAME, extractManagedLauncherBasename, } from './codex-global-normalize.js';
export function isPresetOwnedGlobalCodexHook(metadata, expectedSourcePaths) {
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
    return isOmxCodexCommand(candidate.command);
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
function isOmxCodexCommand(command) {
    const launcherBasename = extractManagedLauncherBasename(command);
    if (launcherBasename === MANAGED_OMX_GLOBAL_HOOK_BASENAME)
        return true;
    return false;
}
//# sourceMappingURL=codex-global-ownership.js.map