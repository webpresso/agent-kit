/**
 * `ak worktree` subcommand dispatch.
 *
 * Handles: new, list, remove
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { scaffoldAgent } from '#cli/commands/init/scaffold-agent';
import { resolveCatalogDir } from '#cli/commands/init/index';
import { runUnifiedSync } from '#symlinker/unified-sync';
import { getProjectRoot } from '#cli/utils';
export function parseWorktreePorcelain(raw) {
    const entries = [];
    const blocks = raw.trim().split(/\n\n+/);
    for (const block of blocks) {
        if (!block.trim())
            continue;
        const lines = block.split('\n');
        let path = '';
        let head = '';
        let branch = null;
        let bare = false;
        for (const line of lines) {
            if (line.startsWith('worktree '))
                path = line.slice('worktree '.length);
            else if (line.startsWith('HEAD '))
                head = line.slice('HEAD '.length);
            else if (line.startsWith('branch '))
                branch = line.slice('branch '.length);
            else if (line === 'bare')
                bare = true;
        }
        if (path)
            entries.push({ path, head, branch, bare });
    }
    return entries;
}
export function sanitizeWorktreeSegment(value, fallback = 'agent') {
    const sanitized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return sanitized || fallback;
}
function formatTimestamp(now) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}-${hour}${minute}`;
}
function defaultRandomSuffix() {
    return Math.random().toString(36).slice(2, 5).padEnd(3, '0');
}
function defaultWorktreePath(repoRoot, branch) {
    const pathSegment = sanitizeWorktreeSegment(branch);
    return join(dirname(repoRoot), `${basename(repoRoot)}-${pathSegment}`);
}
function collides(branch, path, entries, branchExists, pathExists) {
    return branchExists(branch) || entries.some((e) => e.path === path) || pathExists(path);
}
export function resolveNewWorktreeTarget(input) {
    const branch = input.branch?.trim();
    const name = input.name?.trim();
    if (branch && name) {
        throw new Error('Use either <branch> or --name, not both.');
    }
    if (branch) {
        return {
            branch,
            path: input.explicitPath ?? defaultWorktreePath(input.repoRoot, branch),
            generated: false,
        };
    }
    const prefix = sanitizeWorktreeSegment(input.prefix ?? 'agent');
    const now = input.now ?? new Date();
    const randomSuffix = input.randomSuffix ?? defaultRandomSuffix;
    const entries = input.existingEntries ?? [];
    const branchExists = input.branchExists ?? (() => false);
    const pathExists = input.pathExists ?? (() => false);
    const baseSlug = name ? sanitizeWorktreeSegment(name) : formatTimestamp(now);
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const suffix = name && attempt === 0 ? '' : `-${sanitizeWorktreeSegment(randomSuffix(), 'x')}`;
        const candidateBranch = `${prefix}/${baseSlug}${suffix}`;
        const candidatePath = input.explicitPath ?? defaultWorktreePath(input.repoRoot, candidateBranch);
        if (!collides(candidateBranch, candidatePath, entries, branchExists, pathExists)) {
            return { branch: candidateBranch, path: candidatePath, generated: true };
        }
    }
    throw new Error('Could not generate a collision-free worktree branch/path after 20 attempts.');
}
export function resolveWorktreePath(nameOrPath, entries) {
    const match = entries.find((e) => e.path === nameOrPath ||
        basename(e.path) === nameOrPath ||
        e.branch === nameOrPath ||
        e.branch === `refs/heads/${nameOrPath}` ||
        e.branch?.replace('refs/heads/', '') === nameOrPath);
    if (!match) {
        throw new Error(`No worktree matching "${nameOrPath}". Run \`ak worktree list\` to see available worktrees.`);
    }
    return match.path;
}
function gitBranchExists(repoRoot, branch) {
    const result = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
        cwd: repoRoot,
    });
    return result.status === 0;
}
function listEntries(repoRoot) {
    const raw = execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: repoRoot,
        encoding: 'utf-8',
    });
    return parseWorktreePorcelain(raw);
}
export function formatWorktreeList(entries, currentWorktreePath) {
    if (entries.length === 0)
        return ['No worktrees found.'];
    const pathWidth = Math.max(...entries.map((e) => e.path.length), 4);
    const branchLabels = entries.map((e) => e.branch?.replace('refs/heads/', '') ?? '(detached)');
    const branchWidth = Math.max(...branchLabels.map((b) => b.length), 6);
    const rows = [
        `  ${'PATH'.padEnd(pathWidth)}  ${'BRANCH'.padEnd(branchWidth)}  HEAD`,
        `  ${'-'.repeat(pathWidth)}  ${'-'.repeat(branchWidth)}  -------`,
    ];
    for (const [index, e] of entries.entries()) {
        const marker = e.path === currentWorktreePath ? '* ' : '  ';
        const branchShort = branchLabels[index] ?? '(detached)';
        const headShort = e.head.slice(0, 7);
        rows.push(`${marker}${e.path.padEnd(pathWidth)}  ${branchShort.padEnd(branchWidth)}  ${headShort}`);
    }
    return rows;
}
async function handleNew(branch, opts) {
    const cwd = opts.cwd ?? process.cwd();
    const repoRoot = getProjectRoot({ startDir: cwd });
    const existingEntries = listEntries(repoRoot);
    const target = resolveNewWorktreeTarget({
        branch,
        name: opts.name,
        prefix: opts.prefix,
        explicitPath: opts.path,
        repoRoot,
        existingEntries,
        branchExists: (candidate) => gitBranchExists(repoRoot, candidate),
        pathExists: existsSync,
    });
    if (opts.dryRun) {
        console.log('[dry-run] Would create worktree:');
        console.log(`  branch: ${target.branch}`);
        console.log(`  path:   ${target.path}`);
        console.log(`  base:   ${opts.base ?? 'HEAD'}`);
        return;
    }
    const gitArgs = ['worktree', 'add', '-b', target.branch, target.path];
    if (opts.base)
        gitArgs.push(opts.base);
    const addResult = spawnSync('git', gitArgs, { cwd: repoRoot, stdio: 'inherit' });
    if (addResult.status !== 0) {
        throw new Error('git worktree add failed');
    }
    const catalogDir = resolveCatalogDir();
    scaffoldAgent({ catalogDir, repoRoot: target.path, options: {} });
    runUnifiedSync({ catalogDir, consumerRoot: target.path });
    console.log(`\nWorktree ready: ${target.path}`);
    console.log(`  branch: ${target.branch}`);
    console.log(`  cd ${target.path}`);
}
function handleList(opts) {
    const cwd = opts.cwd ?? process.cwd();
    const repoRoot = getProjectRoot({ startDir: cwd });
    const entries = listEntries(repoRoot);
    console.log(formatWorktreeList(entries, repoRoot).join('\n'));
}
function handleRemove(nameOrPath, opts) {
    const cwd = opts.cwd ?? process.cwd();
    const repoRoot = getProjectRoot({ startDir: cwd });
    const entries = listEntries(repoRoot);
    const resolved = resolveWorktreePath(nameOrPath, entries);
    const gitArgs = ['worktree', 'remove', resolved];
    if (opts.force)
        gitArgs.push('--force');
    const result = spawnSync('git', gitArgs, { cwd: repoRoot, stdio: 'inherit' });
    if (result.status !== 0) {
        throw new Error('git worktree remove failed');
    }
}
export async function executeWorktreeSubcommand(subcommand, args, opts) {
    switch (subcommand) {
        case 'new': {
            const branch = args[0];
            await handleNew(branch ?? '', opts);
            return;
        }
        case 'list': {
            handleList(opts);
            return;
        }
        case 'remove':
        case 'rm': {
            const nameOrPath = args[0];
            if (!nameOrPath) {
                throw new Error('Usage: ak worktree remove <branch-or-path> [--force]');
            }
            handleRemove(nameOrPath, opts);
            return;
        }
        default: {
            throw new Error(`Unknown worktree subcommand: "${subcommand}"\n\nUse one of: new, list, remove`);
        }
    }
}
//# sourceMappingURL=router-dispatch.js.map