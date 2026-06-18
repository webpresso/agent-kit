import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js';
export const TOOLING_OWNERSHIP_FILENAME = 'tooling-ownership.json';
export const MANAGED_TOOL_NAMES = ['omx', 'omc', 'gstack'];
function normalizeProjects(value) {
    if (!Array.isArray(value))
        return undefined;
    const projects = [...new Set(value.filter((item) => typeof item === 'string'))];
    return projects.length > 0 ? projects : undefined;
}
function normalizeEntry(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const raw = value;
    const user = raw.user?.managedBy === 'wp' ? { managedBy: 'wp' } : undefined;
    const projects = normalizeProjects(raw.projects);
    if (!user && !projects)
        return undefined;
    return {
        ...(user ? { user } : {}),
        ...(projects ? { projects } : {}),
    };
}
export function defaultToolingOwnershipState() {
    return { version: 1, tools: {} };
}
export function normalizeToolingOwnershipState(parsed) {
    if (parsed === null || typeof parsed !== 'object')
        return defaultToolingOwnershipState();
    const raw = parsed;
    if (raw.version !== 1 || raw.tools === null || typeof raw.tools !== 'object') {
        return defaultToolingOwnershipState();
    }
    const tools = Object.fromEntries(MANAGED_TOOL_NAMES.flatMap((tool) => {
        const normalized = normalizeEntry(raw.tools?.[tool]);
        return normalized ? [[tool, normalized]] : [];
    }));
    return { version: 1, tools };
}
export function defaultToolingOwnershipPath() {
    return getSurfacePath(TOOLING_OWNERSHIP_FILENAME, 'user');
}
export function readToolingOwnershipState(path = defaultToolingOwnershipPath()) {
    try {
        return normalizeToolingOwnershipState(JSON.parse(readFileSync(path, 'utf8')));
    }
    catch {
        return defaultToolingOwnershipState();
    }
}
export function writeToolingOwnershipState(state, path = defaultToolingOwnershipPath()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
function nextEntry(existing, update) {
    const projects = update.projects ?? existing?.projects;
    const user = update.user ?? existing?.user;
    if (!user && (!projects || projects.length === 0))
        return undefined;
    return {
        ...(user ? { user } : {}),
        ...(projects && projects.length > 0 ? { projects } : {}),
    };
}
export function claimUserOwnedTool(state, tool) {
    return {
        ...state,
        tools: {
            ...state.tools,
            [tool]: nextEntry(state.tools[tool], { user: { managedBy: 'wp' } }),
        },
    };
}
export function claimProjectOwnedTool(state, tool, repoKey) {
    const projects = [...new Set([...(state.tools[tool]?.projects ?? []), repoKey])].toSorted();
    return {
        ...state,
        tools: {
            ...state.tools,
            [tool]: nextEntry(state.tools[tool], { projects }),
        },
    };
}
export function clearProjectOwnedTool(state, tool, repoKey) {
    const projects = (state.tools[tool]?.projects ?? []).filter((entry) => entry !== repoKey);
    const next = nextEntry(state.tools[tool], { projects });
    const tools = { ...state.tools };
    if (next)
        tools[tool] = next;
    else
        delete tools[tool];
    return { ...state, tools };
}
export function isUserOwnedTool(state, tool) {
    return state.tools[tool]?.user?.managedBy === 'wp';
}
export function isProjectOwnedTool(state, tool, repoKey) {
    if (!repoKey)
        return false;
    return (state.tools[tool]?.projects ?? []).includes(repoKey);
}
export function hasAnyOwnership(state, tool) {
    const entry = state.tools[tool];
    return Boolean(entry?.user || (entry?.projects?.length ?? 0) > 0);
}
export function tryReadRepoKey(cwd, getSurfaceRepoPath = getSurfacePath) {
    try {
        const repoPath = getSurfaceRepoPath('.probe', 'repo', cwd);
        return repoPath.split('/').at(-2) ?? null;
    }
    catch (error) {
        if (error instanceof NotInGitRepoError)
            return null;
        throw error;
    }
}
export function toolingOwnershipFileExists(path = defaultToolingOwnershipPath()) {
    return existsSync(path);
}
//# sourceMappingURL=tooling-ownership.js.map