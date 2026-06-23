import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
const PACKAGE_NAME = '@webpresso/agent-kit';
function findWorkspaceFile(startDir) {
    let current = startDir;
    for (;;) {
        const candidate = join(current, 'pnpm-workspace.yaml');
        if (existsSync(candidate))
            return candidate;
        const parent = dirname(current);
        if (parent === current)
            return null;
        current = parent;
    }
}
function extractPinnedVersion(workspaceFile) {
    try {
        const content = readFileSync(workspaceFile, 'utf-8');
        const parsed = yaml.load(content);
        if (parsed === null || typeof parsed !== 'object')
            return null;
        if (!('catalog' in parsed))
            return null;
        const catalog = parsed['catalog'];
        if (catalog === null || typeof catalog !== 'object')
            return null;
        const pin = catalog[PACKAGE_NAME];
        if (typeof pin !== 'string' || pin.length === 0)
            return null;
        // Strip semver range operators (^, ~, >=, >, <=, <, =, v)
        return pin.replace(/^[~^>=<v]+/, '').trim();
    }
    catch {
        return null;
    }
}
/**
 * Returns a warning string when the running global wp version differs from the
 * repo-pinned @webpresso/agent-kit catalog entry.
 * Returns null when aligned or no pin can be resolved.
 */
export function checkVersionSkew(runningVersion, cwd = process.cwd()) {
    const workspaceFile = findWorkspaceFile(cwd);
    if (workspaceFile === null)
        return null;
    const pinnedVersion = extractPinnedVersion(workspaceFile);
    if (pinnedVersion === null)
        return null;
    if (runningVersion === pinnedVersion)
        return null;
    return (`[wp] Version skew: global wp is ${runningVersion} but this repo expects ` +
        `@webpresso/agent-kit@${pinnedVersion} for the shared wp runtime. ` +
        `Run \`vp install -g @webpresso/agent-kit@${pinnedVersion}\` to align the global CLI.`);
}
//# sourceMappingURL=version-skew.js.map