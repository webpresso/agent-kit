import { normalize } from 'node:path';
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
    return isContextModeCodexCommand(candidate.command) || isOmxCodexCommand(candidate.command);
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
function isContextModeCodexCommand(command) {
    return command.startsWith('context-mode hook codex ');
}
function isOmxCodexCommand(command) {
    return /codex-native-hook(?:\.js)?/u.test(command) || /oh-my-codex/u.test(command);
}
//# sourceMappingURL=codex-global-ownership.js.map