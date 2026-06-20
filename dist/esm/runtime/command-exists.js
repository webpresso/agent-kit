import { accessSync, constants, statSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';
function pathModuleForPlatform(platform) {
    return platform === 'win32' ? win32 : posix;
}
function pathDelimiterForPlatform(platform) {
    return platform === 'win32' ? ';' : ':';
}
function commandNameVariants(command, platform, pathExtEnv) {
    // Only win32 appends extensions, and only when the command has none already.
    if (platform !== 'win32' || /\.[^./\\]+$/u.test(command))
        return [command];
    const extensions = typeof pathExtEnv === 'string' && pathExtEnv.length > 0
        ? pathExtEnv
            .split(';')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
            .map((entry) => entry.toLowerCase())
        : ['.exe', '.cmd', '.bat'];
    return [command, ...extensions.map((extension) => `${command}${extension}`)];
}
/**
 * Enumerate every candidate filesystem path for `command` across all `PATH` entries,
 * cross-platform (win32 PATHEXT-aware). Pure — no filesystem or subprocess access.
 * Both the platform-specific join and the host-default join are emitted so a win32
 * simulation still resolves real fixtures on a posix test filesystem.
 */
export function pathCandidates(command, options = {}) {
    if (command.length === 0)
        return [];
    const platform = options.platform ?? process.platform;
    const pathEnv = options.pathEnv ?? process.env.PATH;
    if (typeof pathEnv !== 'string' || pathEnv.length === 0)
        return [];
    const pathExtEnv = options.pathExtEnv ?? process.env.PATHEXT;
    const pathModule = pathModuleForPlatform(platform);
    const variants = commandNameVariants(command, platform, pathExtEnv);
    const candidates = [];
    for (const entry of pathEnv.split(pathDelimiterForPlatform(platform))) {
        if (entry.length === 0)
            continue;
        for (const variant of variants) {
            for (const candidate of new Set([pathModule.join(entry, variant), join(entry, variant)])) {
                candidates.push(candidate);
            }
        }
    }
    return candidates;
}
function isRunnableFile(path, platform) {
    let stat;
    try {
        stat = statSync(path);
    }
    catch {
        return false;
    }
    if (!stat.isFile())
        return false;
    // Windows has no executable bit; presence of the right-extension file is enough.
    if (platform === 'win32')
        return true;
    try {
        accessSync(path, constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Cross-platform check for whether `command` resolves to a runnable executable on
 * `PATH`. Never spawns a subprocess. See the module doc for the predicate contract.
 */
export function commandExists(command, options = {}) {
    const platform = options.platform ?? process.platform;
    for (const candidate of pathCandidates(command, options)) {
        if (isRunnableFile(candidate, platform))
            return true;
    }
    return false;
}
//# sourceMappingURL=command-exists.js.map