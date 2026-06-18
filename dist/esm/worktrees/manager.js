import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { deriveRepoNamespace, resolveManagedWorktreeRoot, resolveOwnerWorktreePath, resolveScratchWorktreePath, resolveWorktreeRoot, } from './location.js';
import { findWorktreeRegistryEntry, readWorktreeRegistry, removeWorktreeRegistryEntries, upsertWorktreeRegistryEntry, } from './registry.js';
function shortHash(value) {
    return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
export function readRepoOriginUrl(repoRoot) {
    try {
        return (execFileSync('git', ['config', '--get', 'remote.origin.url'], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || null);
    }
    catch {
        return null;
    }
}
export function ownerWorktreeId(repoNamespace, slug) {
    return `owner-${shortHash(`${repoNamespace}:${slug}`)}`;
}
export function scratchWorktreeId(repoNamespace, slug, lane, id) {
    return `scratch-${shortHash(`${repoNamespace}:${slug}:${lane}:${id}`)}`;
}
export function resolveOwnerBinding(repoRoot, slug) {
    const repoOriginUrl = readRepoOriginUrl(repoRoot);
    const repoNamespace = deriveRepoNamespace({ repoRoot, originUrl: repoOriginUrl });
    return {
        id: ownerWorktreeId(repoNamespace, slug),
        branch: `bp/${slug}`,
        path: resolveOwnerWorktreePath(repoRoot, slug, { originUrl: repoOriginUrl }),
        repoNamespace,
        ...(repoOriginUrl && { repoOriginUrl }),
    };
}
function gitBranchExists(repoRoot, branch) {
    const result = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
        cwd: repoRoot,
    });
    return result.status === 0;
}
function registerOwner(repoRoot, slug, binding, options = {}) {
    return upsertWorktreeRegistryEntry({
        id: binding.id,
        repoNamespace: binding.repoNamespace,
        repoRoot,
        ...(binding.repoOriginUrl && { repoOriginUrl: binding.repoOriginUrl }),
        kind: 'owner',
        path: binding.path,
        branch: binding.branch,
        detached: false,
        blueprintSlug: slug,
        lastSeenAt: options.now?.() ?? new Date().toISOString(),
    }, options);
}
export function ensureBlueprintOwnerWorktree(repoRoot, slug, options = {}) {
    const binding = resolveOwnerBinding(repoRoot, slug);
    if (!existsSync(binding.path) && !options.dryRun) {
        mkdirSync(dirname(binding.path), { recursive: true });
        const args = gitBranchExists(repoRoot, binding.branch)
            ? ['worktree', 'add', binding.path, binding.branch]
            : ['worktree', 'add', '-b', binding.branch, binding.path];
        const result = spawnSync('git', args, { cwd: repoRoot, stdio: 'inherit' });
        if (result.status !== 0)
            throw new Error(`git worktree add failed for ${binding.path}`);
    }
    registerOwner(repoRoot, slug, binding, options);
    return binding;
}
export function adoptBlueprintOwnerWorktree(repoRoot, slug, worktreePath, options = {}) {
    const binding = { ...resolveOwnerBinding(repoRoot, slug), path: worktreePath };
    registerOwner(repoRoot, slug, binding, options);
    return binding;
}
export function clearBlueprintWorktreeOwnership(repoRoot, slug, options = {}) {
    const binding = resolveOwnerBinding(repoRoot, slug);
    return removeWorktreeRegistryEntries((entry) => entry.repoNamespace === binding.repoNamespace &&
        entry.blueprintSlug === slug &&
        (entry.kind === 'owner' || entry.kind === 'scratch'), options);
}
export function createScratchWorktreeEntry(repoRoot, slug, lane, id, options = {}) {
    const repoOriginUrl = readRepoOriginUrl(repoRoot);
    const repoNamespace = deriveRepoNamespace({ repoRoot, originUrl: repoOriginUrl });
    const path = resolveScratchWorktreePath(repoRoot, slug, lane, id, { originUrl: repoOriginUrl });
    return upsertWorktreeRegistryEntry({
        id: scratchWorktreeId(repoNamespace, slug, lane, id),
        repoNamespace,
        repoRoot,
        ...(repoOriginUrl && { repoOriginUrl }),
        kind: 'scratch',
        path,
        detached: true,
        blueprintSlug: slug,
        lastSeenAt: options.now?.() ?? new Date().toISOString(),
    }, options);
}
function registryOptionsForRuntime() {
    return process.env['WP_AGENT_KIT_TEST_WORKTREE_ROOT']
        ? { root: process.env['WP_AGENT_KIT_TEST_WORKTREE_ROOT'] }
        : {};
}
export function findResolvableOwnerBinding(ownerId) {
    const entry = findWorktreeRegistryEntry(ownerId, registryOptionsForRuntime());
    if (!entry || entry.kind !== 'owner')
        return null;
    if (!existsSync(entry.path))
        return null;
    return entry;
}
export function managedRoot() {
    return resolveManagedWorktreeRoot();
}
export function repoManagedRoot(repoRoot) {
    const repoOriginUrl = readRepoOriginUrl(repoRoot);
    return resolveWorktreeRoot(repoRoot, { originUrl: repoOriginUrl });
}
export function listRegisteredWorktrees() {
    return readWorktreeRegistry().entries;
}
//# sourceMappingURL=manager.js.map