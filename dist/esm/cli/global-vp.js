import { accessSync, constants, existsSync, realpathSync, statSync } from "node:fs";
import { delimiter, sep } from "node:path";
import { pathCandidates } from "#runtime/command-exists.js";
export function appendGlobalCapableVpArgs(vpCommand, args) {
    if (typeof vpCommand === "string")
        return [vpCommand, ...args];
    return [vpCommand.command, ...vpCommand.argsPrefix, ...args];
}
function splitPathSegments(value) {
    const normalized = value.replace(/\\/g, sep);
    const stripped = normalized.startsWith(sep) ? normalized.slice(sep.length) : normalized;
    return stripped.split(sep).filter((segment) => segment.length > 0 && segment !== delimiter);
}
function hasSegmentPair(segments, left, right) {
    return segments.some((segment, index) => segment === left && segments[index + 1] === right);
}
function isProjectNodeModulesCandidate(value) {
    const segments = splitPathSegments(value);
    return segments.includes("node_modules") && !segments.includes(".vite-plus");
}
function isRuntimeLocalVitePlusCandidate(value) {
    return hasSegmentPair(splitPathSegments(value), ".vite-plus", "js_runtime");
}
function isRejectedVpCandidate(candidatePath, realpath) {
    return (isProjectNodeModulesCandidate(candidatePath) ||
        isProjectNodeModulesCandidate(realpath) ||
        isRuntimeLocalVitePlusCandidate(candidatePath) ||
        isRuntimeLocalVitePlusCandidate(realpath));
}
function executableRealpath(candidate, platformValue) {
    try {
        if (!existsSync(candidate))
            return null;
        const stat = statSync(candidate);
        if (!stat.isFile())
            return null;
        if (platformValue !== "win32")
            accessSync(candidate, constants.X_OK);
        return realpathSync(candidate);
    }
    catch {
        return null;
    }
}
function isWindowsCommandScript(path) {
    return /\.(?:cmd|bat)$/iu.test(path);
}
function commandForRealpath(realpath, platformValue, env) {
    if (platformValue === "win32" && isWindowsCommandScript(realpath)) {
        return {
            command: env["ComSpec"] ?? env["COMSPEC"] ?? "cmd.exe",
            argsPrefix: ["/d", "/s", "/c", realpath],
            executable: realpath,
        };
    }
    return { command: realpath, argsPrefix: [], executable: realpath };
}
export function resolveGlobalCapableVpCommand(pathValue = process.env.PATH ?? "", platformValue = process.platform, env = process.env) {
    for (const candidate of pathCandidates("vp", { pathEnv: pathValue, platform: platformValue })) {
        const realpath = executableRealpath(candidate, platformValue);
        if (realpath === null)
            continue;
        if (isRejectedVpCandidate(candidate, realpath))
            continue;
        return commandForRealpath(realpath, platformValue, env);
    }
    return null;
}
export function resolveGlobalCapableVp(pathValue = process.env.PATH ?? "", platformValue = process.platform) {
    return resolveGlobalCapableVpCommand(pathValue, platformValue)?.executable ?? null;
}
//# sourceMappingURL=global-vp.js.map