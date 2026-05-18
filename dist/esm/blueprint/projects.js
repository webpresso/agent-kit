/**
 * Project / worktree discovery for the structured-blueprint MCP surface.
 *
 * Owns one reusable, lazy, injectable resolver that returns
 * `BlueprintProjectRef[]` aggregated across five sources, in priority order:
 *
 *   1. Current project (`cwd`, `CLAUDE_PROJECT_DIR`, upward marker walk via
 *      the shared `resolveProjectRoot`).
 *   2. MCP client roots via `Server.listRoots()` — gracefully handles the
 *      `assertClientCapability` throw when the client did not advertise the
 *      roots capability.
 *   3. Static workspace config from `~/.agent/workspace.yaml` (read via the
 *      existing `getWorkspaceRepos` helper).
 *   4. Git worktrees parsed by the already-exported `parseWorktreePorcelain`
 *      from `#cli/commands/worktree/router-dispatch.ts` (do NOT duplicate).
 *   5. Bounded recursive scan (only when explicit roots are supplied) capped
 *      at `depth ≤ 3`, `count ≤ 200`, `timeoutMs 2000`, ignoring well-known
 *      build/cache directories and dotfiles other than `.agent`.
 *
 * No persistent registry, daemon, or background indexer. All filesystem and
 * git access is funnelled through an injectable `GitProbe` so tests run with
 * deterministic stubs and never spawn real git.
 *
 * **`project_id_v1` spec (F14):**
 *   `project_id = sha256(realpath(worktree) + '\0' + (repo_common_dir ?? '') + '\0' + os.platform()).hex().slice(0, 16)`
 *
 * - `realpath` may case-fold on macOS APFS — accepted and documented.
 * - Moving a worktree changes the id (by design).
 * - Recreating a worktree at the same path reuses the id — clients must use
 *   `branch` + HEAD commit as the freshness signal.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { platform as osPlatform } from 'node:os';
import { basename, join } from 'node:path';
import { parseWorktreePorcelain } from '#cli/commands/worktree/router-dispatch';
import { resolveBlueprintProjectionDbPath } from '#db/paths.js';
import { getWorkspaceRepos } from '#db/workspace-config.js';
import { resolveProjectRoot } from '#mcp/tools/_shared/project-root.js';
import { resolveBlueprintRoot } from '#utils/blueprint-root.js';
// Re-export the porcelain parser path so callers can verify (in tests) that
// this module imports from `router-dispatch.ts` rather than re-implementing
// the porcelain parser. (Acceptance criterion.)
export { parseWorktreePorcelain } from '#cli/commands/worktree/router-dispatch';
export const PROJECT_SOURCES = {
    current: 'current',
    mcp_roots: 'mcp_roots',
    workspace_config: 'workspace_config',
    git_worktree: 'git_worktree',
    recursive_scan: 'recursive_scan',
};
export const RECURSIVE_SCAN_LIMITS = {
    depth: 3,
    count: 200,
    timeoutMs: 2000,
};
export const RECURSIVE_SCAN_IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'target',
    '.cache',
    '.turbo',
    '.pnpm-store',
]);
// ---------------------------------------------------------------------------
// project_id_v1 — pure hashing helper
// ---------------------------------------------------------------------------
/**
 * Pinned `project_id_v1` formula.
 *
 * Inputs are taken at the `realpath` boundary by the caller, not inside the
 * hasher; that keeps the hash a pure function of its arguments and lets tests
 * exercise platform-folding behavior without touching the filesystem.
 */
export function projectIdV1(worktreePath, repoCommonDir, platformValue) {
    const h = createHash('sha256');
    h.update(worktreePath);
    h.update('\0');
    h.update(repoCommonDir ?? '');
    h.update('\0');
    h.update(platformValue);
    return h.digest('hex').slice(0, 16);
}
// ---------------------------------------------------------------------------
// Top-level resolver
// ---------------------------------------------------------------------------
export async function resolveBlueprintProjects(options = {}) {
    const git = options.git ?? defaultGitProbe();
    const caps = options.caps ?? RECURSIVE_SCAN_LIMITS;
    const now = options.now ?? Date.now;
    const env = options.env ?? process.env;
    const seen = new Map();
    const order = [];
    function record(ref) {
        if (!ref)
            return;
        if (seen.has(ref.worktree_path))
            return;
        seen.set(ref.worktree_path, ref);
        order.push(ref.worktree_path);
    }
    // 1. Current project ------------------------------------------------------
    const currentRoot = resolveCurrentRoot(options.cwd, env);
    if (currentRoot) {
        record(buildRef(currentRoot, PROJECT_SOURCES.current, git));
    }
    // 2. MCP roots ------------------------------------------------------------
    if (options.rootsProvider) {
        const rootDirs = await safeListRoots(options.rootsProvider);
        for (const dir of rootDirs) {
            record(buildRef(dir, PROJECT_SOURCES.mcp_roots, git));
        }
    }
    // 3. Workspace config -----------------------------------------------------
    const workspaceRepos = options.workspaceRepos ?? safeLoadWorkspaceRepos();
    for (const repo of workspaceRepos) {
        record(buildRef(repo, PROJECT_SOURCES.workspace_config, git));
    }
    // 4. Git worktrees for every git-rooted ref we have so far ----------------
    const gitRoots = new Set();
    for (const path of order) {
        const ref = seen.get(path);
        if (ref && git.isGitRepo(ref.worktree_path)) {
            gitRoots.add(ref.repo_path);
        }
    }
    for (const repoRoot of gitRoots) {
        for (const wt of listWorktrees(repoRoot, git)) {
            const wtRef = buildRef(wt.path, PROJECT_SOURCES.git_worktree, git, {
                branch: wt.branch ?? undefined,
                repoPathOverride: repoRoot,
            });
            record(wtRef);
        }
    }
    // 5. Recursive scan (only when explicit roots are supplied) ---------------
    if (options.recursiveScanRoots && options.recursiveScanRoots.length > 0) {
        const scanned = recursiveScan(options.recursiveScanRoots, caps, now);
        for (const dir of scanned) {
            record(buildRef(dir, PROJECT_SOURCES.recursive_scan, git));
        }
    }
    return order.map((p) => {
        const ref = seen.get(p);
        if (!ref)
            throw new Error('internal: project ref missing from cache');
        return ref;
    });
}
// ---------------------------------------------------------------------------
// Source helpers
// ---------------------------------------------------------------------------
function resolveCurrentRoot(cwd, env) {
    try {
        return resolveProjectRoot({ cwd: cwd ?? process.cwd(), env });
    }
    catch {
        return null;
    }
}
async function safeListRoots(provider) {
    try {
        const result = await provider();
        return result.roots.map((r) => fileUriToPath(r.uri)).filter((p) => p !== null);
    }
    catch {
        // assertClientCapability throws when the client did not advertise roots
        // support — graceful fallback: act as if no roots were returned.
        return [];
    }
}
function safeLoadWorkspaceRepos() {
    try {
        return getWorkspaceRepos();
    }
    catch {
        return [];
    }
}
function listWorktrees(repoRoot, git) {
    try {
        const raw = git.listWorktreesPorcelain(repoRoot);
        if (!raw)
            return [];
        return parseWorktreePorcelain(raw).map((e) => ({
            path: e.path,
            branch: stripRefsHeads(e.branch),
        }));
    }
    catch {
        return [];
    }
}
function stripRefsHeads(branch) {
    if (!branch)
        return null;
    return branch.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : branch;
}
function fileUriToPath(uri) {
    if (uri.startsWith('file://'))
        return uri.slice('file://'.length);
    if (uri.startsWith('/'))
        return uri;
    return null;
}
// ---------------------------------------------------------------------------
// Recursive scan with bounded depth, count, timeout, and ignore-list
// ---------------------------------------------------------------------------
function recursiveScan(roots, caps, now) {
    const found = [];
    const deadline = now() + caps.timeoutMs;
    for (const root of roots) {
        if (caps.timeoutMs > 0 && now() >= deadline)
            break;
        walk(root, 0, caps, found, deadline, now);
        if (found.length >= caps.count)
            break;
    }
    return found;
}
function walk(dir, depth, caps, acc, deadline, now) {
    if (depth > caps.depth)
        return;
    if (acc.length >= caps.count)
        return;
    if (caps.timeoutMs > 0 && now() >= deadline)
        return;
    if (looksLikeProject(dir))
        acc.push(dir);
    if (acc.length >= caps.count)
        return;
    const entries = safeReaddir(dir);
    for (const name of entries) {
        if (shouldSkipChild(name))
            continue;
        const child = join(dir, name);
        if (!isDirectorySafe(child))
            continue;
        walk(child, depth + 1, caps, acc, deadline, now);
        if (acc.length >= caps.count)
            return;
        if (caps.timeoutMs > 0 && now() >= deadline)
            return;
    }
}
function shouldSkipChild(name) {
    if (RECURSIVE_SCAN_IGNORED_DIRS.has(name))
        return true;
    if (name.startsWith('.') && name !== '.agent')
        return true;
    return false;
}
function looksLikeProject(dir) {
    return existsSync(join(dir, '.git')) || existsSync(join(dir, 'package.json'));
}
function safeReaddir(dir) {
    try {
        return readdirSync(dir);
    }
    catch {
        return [];
    }
}
function isDirectorySafe(path) {
    try {
        return statSync(path).isDirectory();
    }
    catch {
        return false;
    }
}
function buildRef(rawPath, source, git, overrides = {}) {
    const realPath = safeRealpath(rawPath);
    if (!realPath)
        return null;
    const repoCommonDir = overrides.repoPathOverride
        ? (safeRealpath(join(overrides.repoPathOverride, '.git')) ??
            join(overrides.repoPathOverride, '.git'))
        : (git.repoCommonDir(realPath) ?? undefined);
    const platform = git.platform();
    const project_id = projectIdV1(realPath, repoCommonDir, platform);
    const repoPath = overrides.repoPathOverride
        ? (safeRealpath(overrides.repoPathOverride) ?? overrides.repoPathOverride)
        : (git.repoToplevel(realPath) ?? realPath);
    const branch = overrides.branch ?? git.headBranch(realPath) ?? undefined;
    return {
        project_id,
        label: basename(realPath),
        repo_path: repoPath,
        worktree_path: realPath,
        source,
        branch,
        has_blueprints: detectBlueprints(realPath),
        db_path: resolveDbPathFor(realPath),
    };
}
function detectBlueprints(worktreePath) {
    const dir = resolveBlueprintRoot(worktreePath);
    if (!existsSync(dir))
        return false;
    return hasMarkdownAnywhere(dir, 0);
}
function hasMarkdownAnywhere(dir, depth) {
    if (depth > 2)
        return false;
    const entries = safeReaddir(dir);
    for (const name of entries) {
        const child = join(dir, name);
        if (name.endsWith('.md'))
            return true;
        if (!isDirectorySafe(child))
            continue;
        if (hasMarkdownAnywhere(child, depth + 1))
            return true;
    }
    return false;
}
function resolveDbPathFor(worktreePath) {
    return resolveBlueprintProjectionDbPath(worktreePath);
}
function safeRealpath(path) {
    try {
        return realpathSync(path);
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// Default GitProbe (lazy spawn)
// ---------------------------------------------------------------------------
function defaultGitProbe() {
    return {
        isGitRepo: (cwd) => runGit(cwd, ['rev-parse', '--is-inside-work-tree']) !== null,
        repoToplevel: (cwd) => runGit(cwd, ['rev-parse', '--show-toplevel']),
        repoCommonDir: (cwd) => runGit(cwd, ['rev-parse', '--git-common-dir']),
        listWorktreesPorcelain: (cwd) => runGit(cwd, ['worktree', 'list', '--porcelain']) ?? '',
        headBranch: (cwd) => {
            const head = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
            return head === 'HEAD' || head === null ? null : head;
        },
        platform: () => osPlatform(),
    };
}
function runGit(cwd, args) {
    try {
        const out = execFileSync('git', [...args], {
            cwd,
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
        });
        return typeof out === 'string' ? out.trim() : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=projects.js.map