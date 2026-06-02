import { normalize } from 'node:path';
export const KNOWN_WEBPRESSO_CODEX_BINS = [
    'wp-sessionstart-routing',
    'wp-check-dev-link',
    'wp-pretool-guard',
    'wp-post-tool',
    'wp-guard-switch',
    'wp-stop-qa',
];
const KNOWN_WEBPRESSO_CODEX_BIN_SET = new Set(KNOWN_WEBPRESSO_CODEX_BINS);
const NODE_MODULES_BIN_PATTERN = /^(?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+)$/u;
const GUARDED_NODE_MODULES_BIN_PATTERN = /^\[ -x (["']?)((?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+))\1 \] && \1\2\1 \|\| (?:true|printf .+)$/u;
const MANAGED_LAUNCHER_PATTERN = /^(?:["']?)((?:\.\/|\/.*\/)?\.codex\/managed-hooks\/((?:wp|ak)-[\w-]+)\.sh)(?:["']?)$/u;
const GUARDED_MANAGED_LAUNCHER_PATTERN = /^\[ -x (["']?)((?:\.\/|\/.*\/)?\.codex\/managed-hooks\/((?:wp|ak)-[\w-]+)\.sh)\1 \] && \1\2\1 \|\| (?:true|printf .+)$/u;
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
    const match = NODE_MODULES_BIN_PATTERN.exec(normalizedCommand);
    if (match?.[1])
        return match[1];
    const managedLauncherMatch = MANAGED_LAUNCHER_PATTERN.exec(normalizedCommand);
    if (managedLauncherMatch?.[2])
        return managedLauncherMatch[2];
    const guardedMatch = GUARDED_NODE_MODULES_BIN_PATTERN.exec(command.trim());
    if (guardedMatch?.[3])
        return guardedMatch[3];
    const guardedManagedLauncherMatch = GUARDED_MANAGED_LAUNCHER_PATTERN.exec(command.trim());
    return guardedManagedLauncherMatch?.[3] ?? null;
}
function stripSingleShellQuotePair(value) {
    if (value.length < 2)
        return value;
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return value.slice(1, -1);
    }
    return value;
}
//# sourceMappingURL=codex-ownership.js.map