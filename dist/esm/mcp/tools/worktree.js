/**
 * `wp_worktree` MCP tool.
 *
 * Stateful, execute-gated worktree lifecycle operations for agent-kit managed
 * git worktrees. Read actions are safe by default; mutating actions require an
 * explicit `{ execute: true }` contract and return structured failure before
 * side effects when safety checks fail.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import { getProjectRoot } from '#cli/utils';
import { gitBranchExists, listEntries, resolveNewWorktreeTarget, resolveWorktreePath, } from '#cli/commands/worktree/router-dispatch';
import { deriveRepoNamespace, resolveWorktreeRoot } from '#worktrees/location.js';
import { readRepoOriginUrl, repoManagedRoot } from '#worktrees/manager.js';
import { readWorktreeRegistry, removeWorktreeRegistryEntries, upsertWorktreeRegistryEntry, } from '#worktrees/registry.js';
const ACTIONS = ['list', 'root', 'new', 'remove', 'prune', 'refresh'];
const MUTATING_ACTIONS = new Set(['new', 'remove', 'prune', 'refresh']);
const MAX_RETURNED_WORKTREES = 100;
const inputSchema = z
    .object({
    cwd: z.string().optional(),
    action: z.enum(ACTIONS),
    name: z.string().optional(),
    branch: z.string().optional(),
    baseRef: z.string().optional(),
    path: z.string().optional(),
    execute: z.boolean().optional(),
    force: z.boolean().optional(),
})
    .strict();
const worktreeOutputEntry = z.object({
    path: z.string(),
    branch: z.string().optional(),
    head: z.string().optional(),
    locked: z.boolean().optional(),
    prunable: z.boolean().optional(),
});
const outputSchema = z.object({
    passed: z.boolean(),
    summary: z.string(),
    action: z.enum(ACTIONS),
    executed: z.boolean(),
    worktrees: z.array(worktreeOutputEntry).optional(),
    created: z
        .object({ path: z.string(), branch: z.string(), baseRef: z.string() })
        .optional(),
    removed: z.object({ path: z.string(), branch: z.string().optional() }).optional(),
    root: z.string().optional(),
    warnings: z.array(z.string()),
    nextAction: z.string().optional(),
});
function result(payload, isError = !payload.passed) {
    return {
        content: [{ type: 'text', text: payload.summary }],
        structuredContent: payload,
        ...(isError ? { isError: true } : {}),
    };
}
function toOutputEntry(entry) {
    return {
        path: entry.path,
        ...(entry.branch ? { branch: entry.branch.replace('refs/heads/', '') } : {}),
        ...(entry.head ? { head: entry.head } : {}),
        ...(entry.locked ? { locked: true } : {}),
        ...(entry.prunable ? { prunable: true } : {}),
    };
}
function mutationGate(input) {
    if (!MUTATING_ACTIONS.has(input.action) || input.execute === true)
        return null;
    return {
        passed: false,
        summary: `wp_worktree ${input.action} requires execute:true before side effects`,
        action: input.action,
        executed: false,
        warnings: ['execute_required'],
        nextAction: `Re-run wp_worktree with action:${input.action} and execute:true after reviewing the requested mutation.`,
    };
}
function discoverDefaultBaseRef(repoRoot) {
    const originHead = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    const discovered = typeof originHead.stdout === 'string' ? originHead.stdout.trim() : '';
    if (originHead.status === 0 && discovered.length > 0)
        return discovered;
    return 'origin/main';
}
function isDirty(path) {
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: path, encoding: 'utf8' });
    if (status.status !== 0)
        return true;
    return String(status.stdout ?? '').trim().length > 0;
}
function managedContext(repoRoot) {
    const originUrl = readRepoOriginUrl(repoRoot);
    const repoNamespace = deriveRepoNamespace({ repoRoot, originUrl });
    const managedRoot = resolveWorktreeRoot(repoRoot, { originUrl });
    return { repoNamespace, repoRoot, originUrl, managedRoot };
}
function isPathInside(parent, child) {
    const rel = relative(resolve(parent), resolve(child));
    return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel));
}
function isRegisteredManagedWorktree(resolvedPath, context) {
    return readWorktreeRegistry().entries.some((entry) => entry.repoNamespace === context.repoNamespace &&
        entry.repoRoot === context.repoRoot &&
        resolve(entry.path) === resolve(resolvedPath));
}
function refreshManagedEntries(repoRoot) {
    const { originUrl, repoNamespace, managedRoot } = managedContext(repoRoot);
    let updated = 0;
    for (const entry of listEntries(repoRoot)) {
        if (!isPathInside(managedRoot, entry.path))
            continue;
        upsertWorktreeRegistryEntry({
            id: `git-${repoNamespace}-${basename(entry.path)}`,
            repoNamespace,
            repoRoot,
            ...(originUrl ? { repoOriginUrl: originUrl } : {}),
            kind: entry.path.includes('/.scratch/') ? 'scratch' : 'owner',
            path: entry.path,
            ...(entry.branch ? { branch: entry.branch.replace('refs/heads/', '') } : {}),
            detached: entry.branch === null,
            lastSeenAt: new Date().toISOString(),
        });
        updated += 1;
    }
    return updated;
}
function handleNew(input, repoRoot) {
    const entries = listEntries(repoRoot);
    let target;
    try {
        target = resolveNewWorktreeTarget({
            branch: input.branch,
            name: input.name,
            explicitPath: input.path,
            repoRoot,
            existingEntries: entries,
            branchExists: (candidate) => gitBranchExists(repoRoot, candidate),
            pathExists: existsSync,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            passed: false,
            summary: `wp_worktree new refused: ${message}`,
            action: input.action,
            executed: false,
            warnings: ['collision_or_invalid_target'],
            nextAction: 'Choose a branch/name that does not collide with an existing branch or path.',
        };
    }
    const baseRef = input.baseRef?.trim() || discoverDefaultBaseRef(repoRoot);
    const addResult = spawnSync('git', ['worktree', 'add', '-b', target.branch, target.path, baseRef], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    if (addResult.status !== 0) {
        return {
            passed: false,
            summary: `wp_worktree new failed: ${String(addResult.stderr || addResult.stdout).trim() || 'git worktree add failed'}`,
            action: input.action,
            executed: false,
            warnings: ['git_worktree_add_failed'],
            nextAction: 'Verify baseRef exists and the target branch/path are available, then retry.',
        };
    }
    const warnings = [];
    try {
        refreshManagedEntries(repoRoot);
    }
    catch {
        warnings.push('registry_refresh_failed');
    }
    return {
        passed: true,
        summary: `Created worktree ${target.path} on ${target.branch}`,
        action: input.action,
        executed: true,
        created: { path: target.path, branch: target.branch, baseRef },
        warnings,
        nextAction: warnings.includes('registry_refresh_failed')
            ? `cd ${target.path}; run wp_worktree refresh with execute:true to repair registry metadata`
            : `cd ${target.path}`,
    };
}
function handleRemove(input, repoRoot) {
    if (input.force) {
        return {
            passed: false,
            summary: 'wp_worktree remove refused: force removal is not supported by the MCP safety contract',
            action: input.action,
            executed: false,
            warnings: ['force_not_supported'],
            nextAction: 'Clean the worktree and remove any git worktree lock before retrying without force.',
        };
    }
    const nameOrPath = input.path ?? input.name ?? input.branch;
    if (!nameOrPath) {
        return {
            passed: false,
            summary: 'wp_worktree remove requires path, name, or branch',
            action: input.action,
            executed: false,
            warnings: ['missing_target'],
            nextAction: 'Pass the worktree path, basename, or branch to remove.',
        };
    }
    const entries = listEntries(repoRoot);
    let resolved;
    try {
        resolved = resolveWorktreePath(nameOrPath, entries);
    }
    catch (error) {
        return {
            passed: false,
            summary: error instanceof Error ? error.message : String(error),
            action: input.action,
            executed: false,
            warnings: ['worktree_not_found'],
            nextAction: 'Run wp_worktree list to inspect available worktrees.',
        };
    }
    const entry = entries.find((candidate) => candidate.path === resolved);
    const context = managedContext(repoRoot);
    if (resolved === repoRoot) {
        return {
            passed: false,
            summary: 'wp_worktree remove refused: cannot remove the current/main checkout',
            action: input.action,
            executed: false,
            warnings: ['main_checkout_protected'],
        };
    }
    if (!isRegisteredManagedWorktree(resolved, context)) {
        return {
            passed: false,
            summary: `wp_worktree remove refused: ${resolved} is not a registered managed worktree for this repository`,
            action: input.action,
            executed: false,
            warnings: ['unmanaged_worktree_protected'],
            nextAction: 'Run wp_worktree refresh with execute:true to register managed worktrees, or use git worktree directly after manual review.',
        };
    }
    if (entry?.locked) {
        return {
            passed: false,
            summary: `wp_worktree remove refused: ${resolved} is locked`,
            action: input.action,
            executed: false,
            warnings: ['locked_worktree'],
            nextAction: 'Unlock the worktree explicitly with git after confirming it is safe, then retry.',
        };
    }
    if (isDirty(resolved)) {
        return {
            passed: false,
            summary: `wp_worktree remove refused: ${resolved} has uncommitted changes`,
            action: input.action,
            executed: false,
            warnings: ['dirty_worktree'],
            nextAction: 'Commit, stash, or discard the changes in the target worktree before retrying.',
        };
    }
    const removeResult = spawnSync('git', ['worktree', 'remove', resolved], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    if (removeResult.status !== 0) {
        return {
            passed: false,
            summary: `wp_worktree remove failed: ${String(removeResult.stderr || removeResult.stdout).trim() || 'git worktree remove failed'}`,
            action: input.action,
            executed: false,
            warnings: ['git_worktree_remove_failed'],
        };
    }
    const warnings = [];
    try {
        removeWorktreeRegistryEntries((candidate) => candidate.path === resolved);
    }
    catch {
        warnings.push('registry_cleanup_failed');
    }
    return {
        passed: true,
        summary: `Removed worktree ${resolved}`,
        action: input.action,
        executed: true,
        removed: {
            path: resolved,
            ...(entry?.branch ? { branch: entry.branch.replace('refs/heads/', '') } : {}),
        },
        warnings,
        ...(warnings.includes('registry_cleanup_failed')
            ? { nextAction: 'Run wp_worktree prune with execute:true to repair stale registry metadata.' }
            : {}),
    };
}
const tool = {
    name: 'wp_worktree',
    description: 'Safely list, create, remove, refresh, and prune agent-kit managed git worktrees. Mutating actions require execute:true and protect dirty/locked worktrees.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'Worktree',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
    },
    handler: async (raw) => {
        const input = inputSchema.parse(raw ?? {});
        try {
            const cwd = input.cwd ?? process.cwd();
            const repoRoot = getProjectRoot({ startDir: cwd });
            if (input.action === 'root') {
                const root = repoManagedRoot(repoRoot);
                return result({
                    passed: true,
                    summary: `Managed worktree root: ${root}`,
                    action: input.action,
                    executed: false,
                    root,
                    warnings: [],
                }, false);
            }
            if (input.action === 'list') {
                const entries = listEntries(repoRoot);
                const worktrees = entries.slice(0, MAX_RETURNED_WORKTREES).map(toOutputEntry);
                const warnings = entries.length > MAX_RETURNED_WORKTREES
                    ? [`worktree_output_truncated:${MAX_RETURNED_WORKTREES}`]
                    : [];
                return result({
                    passed: true,
                    summary: `Found ${entries.length} git worktree${entries.length === 1 ? '' : 's'}`,
                    action: input.action,
                    executed: false,
                    worktrees,
                    warnings,
                }, false);
            }
            const gated = mutationGate(input);
            if (gated)
                return result(gated);
            if (input.action === 'new')
                return result(handleNew(input, repoRoot));
            if (input.action === 'remove')
                return result(handleRemove(input, repoRoot));
            if (input.action === 'refresh') {
                const updated = refreshManagedEntries(repoRoot);
                return result({
                    passed: true,
                    summary: `Refreshed ${updated} managed worktree entr${updated === 1 ? 'y' : 'ies'}`,
                    action: input.action,
                    executed: true,
                    warnings: [],
                }, false);
            }
            const context = managedContext(repoRoot);
            const pruned = removeWorktreeRegistryEntries((entry) => entry.repoNamespace === context.repoNamespace &&
                entry.repoRoot === context.repoRoot &&
                !existsSync(entry.path));
            return result({
                passed: true,
                summary: `Pruned ${pruned.length} stale managed registry entr${pruned.length === 1 ? 'y' : 'ies'}`,
                action: input.action,
                executed: true,
                warnings: [],
            }, false);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return result({
                passed: false,
                summary: `wp_worktree ${input.action} failed: ${message}`,
                action: input.action,
                executed: false,
                warnings: ['unexpected_failure'],
                nextAction: 'No cleanup was attempted automatically; inspect the repository/worktree state and retry the bounded action.',
            });
        }
    },
};
export default tool;
//# sourceMappingURL=worktree.js.map