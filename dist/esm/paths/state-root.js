import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import envPaths from 'env-paths';
import lockfile from 'proper-lockfile';
export class NotInGitRepoError extends Error {
    cwd;
    constructor(cwd, cause) {
        super(`Not inside a git repository (cwd=${cwd})`);
        this.name = 'NotInGitRepoError';
        this.cwd = cwd;
        if (cause !== undefined) {
            ;
            this.cause = cause;
        }
    }
}
let cachedStateRoot = null;
let cachedRepoKey = null;
let cachedWorktreeKey = null;
const cachedRepoKeyByCwd = new Map();
const cachedWorktreeKeyByCwd = new Map();
function resolveCwd() {
    return process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}
function runGit(args, cwd) {
    if (!hasGitMarker(cwd))
        throw new NotInGitRepoError(cwd);
    try {
        const out = execFileSync('git', [...args], {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return out.trim();
    }
    catch (error) {
        throw new NotInGitRepoError(cwd, error);
    }
}
function hasGitMarker(cwd) {
    let current;
    try {
        current = realpathSync(cwd);
    }
    catch {
        return process.env['VITEST'] === 'true';
    }
    while (true) {
        if (existsSync(join(current, '.git')))
            return true;
        const parent = dirname(current);
        if (parent === current)
            return false;
        current = parent;
    }
}
function normalizeCwdForCache(cwd) {
    try {
        return realpathSync(cwd);
    }
    catch {
        return cwd;
    }
}
function sha256Hex(value) {
    return createHash('sha256').update(value).digest('hex');
}
export function getStateRoot() {
    if (cachedStateRoot !== null)
        return cachedStateRoot;
    const override = process.env.WP_STATE_ROOT;
    if (override && override.trim().length > 0) {
        cachedStateRoot = override;
        return override;
    }
    const paths = envPaths('webpresso', { suffix: '' });
    const root = paths.data;
    cachedStateRoot = root;
    return root;
}
export function getRepoKey() {
    if (cachedRepoKey !== null)
        return cachedRepoKey;
    const cwd = resolveCwd();
    const commonDir = runGit(['rev-parse', '--git-common-dir'], cwd);
    const absolute = realpathSync(commonDir.startsWith('/') ? commonDir : join(cwd, commonDir));
    cachedRepoKey = sha256Hex(absolute).slice(0, 16);
    return cachedRepoKey;
}
export function getWorktreeKey() {
    if (cachedWorktreeKey !== null)
        return cachedWorktreeKey;
    const cwd = resolveCwd();
    const topLevel = runGit(['rev-parse', '--show-toplevel'], cwd);
    const absolute = realpathSync(topLevel);
    cachedWorktreeKey = sha256Hex(absolute).slice(0, 8);
    return cachedWorktreeKey;
}
function computeRepoKey(cwd) {
    const absoluteCwd = normalizeCwdForCache(cwd);
    const cached = cachedRepoKeyByCwd.get(absoluteCwd);
    if (cached !== undefined)
        return cached;
    const commonDir = runGit(['rev-parse', '--git-common-dir'], absoluteCwd);
    const absolute = realpathSync(commonDir.startsWith('/') ? commonDir : join(absoluteCwd, commonDir));
    const key = sha256Hex(absolute).slice(0, 16);
    cachedRepoKeyByCwd.set(absoluteCwd, key);
    return key;
}
function computeWorktreeKey(cwd) {
    const absoluteCwd = normalizeCwdForCache(cwd);
    const cached = cachedWorktreeKeyByCwd.get(absoluteCwd);
    if (cached !== undefined)
        return cached;
    const topLevel = runGit(['rev-parse', '--show-toplevel'], absoluteCwd);
    const absolute = realpathSync(topLevel);
    const key = sha256Hex(absolute).slice(0, 8);
    cachedWorktreeKeyByCwd.set(absoluteCwd, key);
    return key;
}
/**
 * Resolve the on-disk path for a named state surface.
 *
 * @param cwd  Optional project directory. When provided, git context is
 *             derived from that directory instead of process.cwd()/
 *             CLAUDE_PROJECT_DIR. Callers that receive a `cwd` parameter
 *             (e.g. coldStartIfNeeded, auditMemoryRotation) should forward
 *             it here so each project's state lands under its own key.
 *             If `cwd` is not a git repo, NotInGitRepoError is thrown and
 *             the caller falls back to the cwd-relative legacy path.
 */
export function getSurfacePath(name, scope, cwd) {
    const root = getStateRoot();
    if (scope === 'user') {
        return join(root, name);
    }
    const repoKey = cwd !== undefined ? computeRepoKey(cwd) : getRepoKey();
    if (scope === 'worktree') {
        const wtKey = cwd !== undefined ? computeWorktreeKey(cwd) : getWorktreeKey();
        return join(root, repoKey, 'worktree', wtKey, name);
    }
    return join(root, repoKey, name);
}
export async function withLock(scope, fn) {
    if (scope === 'user') {
        throw new Error('withLock does not support user-global scope; use repo or worktree');
    }
    const lockTarget = getSurfacePath('.lock', scope);
    const release = await lockfile.lock(lockTarget, {
        realpath: false,
        retries: { retries: 5, minTimeout: 50, maxTimeout: 500, factor: 2 },
    });
    try {
        return await fn();
    }
    finally {
        await release();
    }
}
export function _clearCacheForTests() {
    cachedStateRoot = null;
    cachedRepoKey = null;
    cachedWorktreeKey = null;
    cachedRepoKeyByCwd.clear();
    cachedWorktreeKeyByCwd.clear();
}
//# sourceMappingURL=state-root.js.map