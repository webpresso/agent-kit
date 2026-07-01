/**
 * `wp worktree` subcommand dispatch.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { scaffoldAgent } from "#cli/commands/init/scaffold-agent";
import { shortId } from "#shared-utils/short-id.js";
import { readConfig } from "#cli/commands/init/config";
import { resolveCatalogDir } from "#cli/commands/init/index";
import { getProjectRoot } from "#cli/utils";
import { runUnifiedSync } from "#symlinker/unified-sync";
import { deriveRepoNamespace, resolveGeneratedWorktreePath, resolveManagedWorktreeRoot, resolveWorktreeRoot, } from "#worktrees/location.js";
import { adoptBlueprintOwnerWorktree, ensureBlueprintOwnerWorktree, readRepoOriginUrl, repoManagedRoot, } from "#worktrees/manager.js";
import { pruneStaleWorktreeRegistryEntries, readWorktreeRegistry, removeWorktreeRegistryEntries, upsertWorktreeRegistryEntry, } from "#worktrees/registry.js";
export function parseWorktreePorcelain(raw) {
    const entries = [];
    const blocks = raw.trim().split(/\n\n+/);
    for (const block of blocks) {
        if (!block.trim())
            continue;
        const lines = block.split("\n");
        let path = "";
        let head = "";
        let branch = null;
        let bare = false;
        let locked = false;
        let prunable = false;
        for (const line of lines) {
            if (line.startsWith("worktree "))
                path = line.slice("worktree ".length);
            else if (line.startsWith("HEAD "))
                head = line.slice("HEAD ".length);
            else if (line.startsWith("branch "))
                branch = line.slice("branch ".length);
            else if (line === "bare")
                bare = true;
            else if (line === "locked" || line.startsWith("locked "))
                locked = true;
            else if (line === "prunable" || line.startsWith("prunable "))
                prunable = true;
        }
        if (path) {
            entries.push({
                path,
                head,
                branch,
                bare,
                ...(locked ? { locked } : {}),
                ...(prunable ? { prunable } : {}),
            });
        }
    }
    return entries;
}
export function sanitizeWorktreeSegment(value, fallback = "agent") {
    const sanitized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]+/gi, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    return sanitized || fallback;
}
function formatTimestamp(now) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}-${hour}${minute}`;
}
function defaultRandomSuffix() {
    return shortId(3);
}
function defaultWorktreePath(repoRoot, branch) {
    const pathSegment = sanitizeWorktreeSegment(branch);
    const originUrl = readRepoOriginUrl(repoRoot);
    return resolveGeneratedWorktreePath(resolveWorktreeRoot(repoRoot, { originUrl }), pathSegment);
}
function collides(branch, path, entries, branchExists, pathExists) {
    return branchExists(branch) || entries.some((e) => e.path === path) || pathExists(path);
}
export function resolveNewWorktreeTarget(input) {
    if (input.explicitPath) {
        throw new Error("Managed worktrees do not support custom creation paths; use wp worktree adopt or rebind instead.");
    }
    const branch = input.branch?.trim();
    const name = input.name?.trim();
    if (branch && name) {
        throw new Error("Use either <branch> or --name, not both.");
    }
    if (branch) {
        const path = defaultWorktreePath(input.repoRoot, branch);
        const entries = input.existingEntries ?? [];
        const branchExists = input.branchExists ?? (() => false);
        const pathExists = input.pathExists ?? (() => false);
        if (collides(branch, path, entries, branchExists, pathExists)) {
            throw new Error(`Worktree branch/path collision for ${branch} at ${path}`);
        }
        return {
            branch,
            path,
            generated: false,
        };
    }
    const prefix = sanitizeWorktreeSegment(input.prefix ?? "agent");
    const now = input.now ?? new Date();
    const randomSuffix = input.randomSuffix ?? defaultRandomSuffix;
    const entries = input.existingEntries ?? [];
    const branchExists = input.branchExists ?? (() => false);
    const pathExists = input.pathExists ?? (() => false);
    const baseSlug = name ? sanitizeWorktreeSegment(name) : formatTimestamp(now);
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const suffix = name && attempt === 0 ? "" : `-${sanitizeWorktreeSegment(randomSuffix(), "x")}`;
        const candidateBranch = `${prefix}/${baseSlug}${suffix}`;
        const candidatePath = defaultWorktreePath(input.repoRoot, candidateBranch);
        if (!collides(candidateBranch, candidatePath, entries, branchExists, pathExists)) {
            return { branch: candidateBranch, path: candidatePath, generated: true };
        }
    }
    throw new Error("Could not generate a collision-free worktree branch/path after 20 attempts.");
}
export function resolveWorktreePath(nameOrPath, entries) {
    const match = entries.find((e) => e.path === nameOrPath ||
        basename(e.path) === nameOrPath ||
        e.branch === nameOrPath ||
        e.branch === `refs/heads/${nameOrPath}` ||
        e.branch?.replace("refs/heads/", "") === nameOrPath);
    if (!match) {
        throw new Error(`No worktree matching "${nameOrPath}". Run \`wp worktree list\` to see available worktrees.`);
    }
    return match.path;
}
export function expectedPrimaryBranchForBaseRef(baseRef) {
    const trimmed = baseRef.trim();
    if (trimmed.startsWith("origin/"))
        return trimmed.slice("origin/".length);
    if (trimmed.startsWith("refs/remotes/origin/"))
        return trimmed.slice("refs/remotes/origin/".length);
    return trimmed;
}
export function planMergeCleanup(targetPath, baseRef) {
    const expectedPrimaryBranch = expectedPrimaryBranchForBaseRef(baseRef);
    return {
        targetPath,
        baseRef,
        expectedPrimaryBranch,
        removeArgs: ["worktree", "remove", targetPath],
        fetchArgs: ["fetch", "--prune", "origin"],
        mergeArgs: ["merge", "--ff-only", baseRef],
    };
}
export function decideMergeCleanup(input) {
    const entry = input.entries.find((candidate) => candidate.path === input.targetPath);
    const plan = planMergeCleanup(input.targetPath, input.baseRef);
    if (input.targetPath === input.repoRoot) {
        throw new Error("wp worktree merge-cleanup refused: cannot remove the current/main checkout");
    }
    if (!input.registryEntries.some((candidate) => candidate.repoRoot === input.repoRoot && candidate.path === input.targetPath)) {
        throw new Error(`wp worktree merge-cleanup refused: ${input.targetPath} is not a registered managed worktree for this repository`);
    }
    if (entry?.locked) {
        throw new Error(`wp worktree merge-cleanup refused: ${input.targetPath} is locked`);
    }
    if (input.targetDirty) {
        throw new Error(`wp worktree merge-cleanup refused: ${input.targetPath} has uncommitted changes`);
    }
    if (input.repoDirty) {
        throw new Error(`wp worktree merge-cleanup refused: primary checkout ${input.repoRoot} has uncommitted changes`);
    }
    if (input.currentBranch !== plan.expectedPrimaryBranch) {
        throw new Error(`wp worktree merge-cleanup refused: primary checkout must be on ${plan.expectedPrimaryBranch} before fast-forward sync (current: ${input.currentBranch || "(detached)"})`);
    }
    return plan;
}
export function gitBranchExists(repoRoot, branch) {
    const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
        cwd: repoRoot,
    });
    return result.status === 0;
}
export function listEntries(repoRoot) {
    const raw = execFileSync("git", ["worktree", "list", "--porcelain"], {
        cwd: repoRoot,
        encoding: "utf-8",
    });
    return parseWorktreePorcelain(raw);
}
export function formatWorktreeList(entries, currentWorktreePath) {
    if (entries.length === 0)
        return ["No worktrees found."];
    const pathWidth = Math.max(...entries.map((e) => e.path.length), 4);
    const branchLabels = entries.map((e) => e.branch?.replace("refs/heads/", "") ?? "(detached)");
    const branchWidth = Math.max(...branchLabels.map((b) => b.length), 6);
    const rows = [
        `  ${"PATH".padEnd(pathWidth)}  ${"BRANCH".padEnd(branchWidth)}  HEAD`,
        `  ${"-".repeat(pathWidth)}  ${"-".repeat(branchWidth)}  -------`,
    ];
    for (const [index, e] of entries.entries()) {
        const marker = e.path === currentWorktreePath ? "* " : "  ";
        const branchShort = branchLabels[index] ?? "(detached)";
        const headShort = e.head.slice(0, 7);
        rows.push(`${marker}${e.path.padEnd(pathWidth)}  ${branchShort.padEnd(branchWidth)}  ${headShort}`);
    }
    return rows;
}
export function formatManagedWorktreeList(entries) {
    if (entries.length === 0)
        return ["No managed worktrees registered. Run `wp worktree refresh`."];
    const pathWidth = Math.max(...entries.map((entry) => entry.path.length), 4);
    const kindWidth = Math.max(...entries.map((entry) => entry.kind.length), 4);
    const rows = [
        `${"KIND".padEnd(kindWidth)}  ${"BLUEPRINT".padEnd(18)}  ${"BRANCH".padEnd(18)}  PATH`,
        `${"-".repeat(kindWidth)}  ${"-".repeat(18)}  ${"-".repeat(18)}  ${"-".repeat(pathWidth)}`,
    ];
    for (const entry of entries) {
        rows.push(`${entry.kind.padEnd(kindWidth)}  ${(entry.blueprintSlug ?? "-").padEnd(18)}  ${(entry.branch ?? (entry.detached ? "(detached)" : "-")).padEnd(18)}  ${entry.path}`);
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
        console.log("[dry-run] Would create managed worktree:");
        console.log(`  branch: ${target.branch}`);
        console.log(`  path:   ${target.path}`);
        console.log(`  base:   ${opts.base ?? "HEAD"}`);
        return;
    }
    const gitArgs = ["worktree", "add", "-b", target.branch, target.path];
    if (opts.base)
        gitArgs.push(opts.base);
    const addResult = spawnSync("git", gitArgs, { cwd: repoRoot, stdio: "inherit" });
    if (addResult.status !== 0) {
        throw new Error("git worktree add failed");
    }
    const catalogDir = resolveCatalogDir();
    scaffoldAgent({ catalogDir, repoRoot: target.path, options: {} });
    // The worktree inherits the repo's host selection (tracked .webpressorc.json),
    // so skill-dir projection is gated the same way as in the main checkout.
    const worktreeHosts = (readConfig(target.path) ?? readConfig(repoRoot))?.hosts?.selected;
    runUnifiedSync({
        catalogDir,
        consumerRoot: target.path,
        ...(worktreeHosts ? { hosts: worktreeHosts } : {}),
    });
    console.log(`\nWorktree ready: ${target.path}`);
    console.log(`  branch: ${target.branch}`);
    console.log(`  cd ${target.path}`);
}
function handleList(opts) {
    if (opts.all) {
        console.log(formatManagedWorktreeList(readWorktreeRegistry().entries).join("\n"));
        return;
    }
    const cwd = opts.cwd ?? process.cwd();
    const repoRoot = getProjectRoot({ startDir: cwd });
    const entries = listEntries(repoRoot);
    console.log(formatWorktreeList(entries, repoRoot).join("\n"));
}
function handleRoot(opts) {
    const cwd = opts.repo ?? opts.cwd ?? process.cwd();
    if (opts.all)
        console.log(resolveManagedWorktreeRoot());
    else
        console.log(repoManagedRoot(getProjectRoot({ startDir: cwd })));
}
function handleRefresh(opts) {
    if (opts.all) {
        const registry = readWorktreeRegistry();
        console.log(`Managed registry entries: ${registry.entries.length}`);
        console.log("Use `wp worktree refresh --repo <path>` to live-probe a specific repository.");
        return;
    }
    const repoRoot = getProjectRoot({ startDir: opts.repo ?? opts.cwd ?? process.cwd() });
    const originUrl = readRepoOriginUrl(repoRoot);
    const repoNamespace = deriveRepoNamespace({ repoRoot, originUrl });
    const entries = listEntries(repoRoot);
    const managedRoot = resolveWorktreeRoot(repoRoot, { originUrl });
    let updated = 0;
    for (const entry of entries) {
        if (!entry.path.startsWith(`${managedRoot}/`))
            continue;
        upsertWorktreeRegistryEntry({
            id: `git-${repoNamespace}-${basename(entry.path)}`,
            repoNamespace,
            repoRoot,
            ...(originUrl && { repoOriginUrl: originUrl }),
            kind: entry.path.includes("/.scratch/") ? "scratch" : "owner",
            path: entry.path,
            ...(entry.branch && { branch: entry.branch.replace("refs/heads/", "") }),
            detached: entry.branch === null,
            lastSeenAt: new Date().toISOString(),
        });
        updated += 1;
    }
    console.log(`Refreshed ${updated} managed worktree entr${updated === 1 ? "y" : "ies"} for ${repoRoot}.`);
}
function handlePrune(opts) {
    if (!opts.all)
        throw new Error("Usage: wp worktree prune --all");
    const result = pruneStaleWorktreeRegistryEntries();
    console.log(`Pruned ${result.removed.length} stale managed registry entr${result.removed.length === 1 ? "y" : "ies"}.`);
}
function handleMigrate(opts) {
    const repoRoot = getProjectRoot({ startDir: opts.repo ?? opts.cwd ?? process.cwd() });
    const legacyRoot = join(dirname(repoRoot), `${basename(repoRoot)}_worktrees`);
    if (!existsSync(legacyRoot)) {
        console.log(`No legacy sibling worktree root found: ${legacyRoot}`);
        return;
    }
    const targetRoot = repoManagedRoot(repoRoot);
    const legacyEntries = listEntries(repoRoot).filter((entry) => entry.path === legacyRoot || entry.path.startsWith(`${legacyRoot}/`));
    if (legacyEntries.length === 0) {
        console.log(`No git-registered worktrees found below ${legacyRoot}; manual migration required.`);
        return;
    }
    let moved = 0;
    const manual = [];
    for (const entry of legacyEntries) {
        const targetPath = join(targetRoot, relative(legacyRoot, entry.path));
        if (opts.dryRun) {
            console.log(`[dry-run] Would move ${entry.path} -> ${targetPath}`);
            continue;
        }
        mkdirSync(dirname(targetPath), { recursive: true });
        const result = spawnSync("git", ["worktree", "move", entry.path, targetPath], {
            cwd: repoRoot,
            stdio: "inherit",
        });
        if (result.status === 0)
            moved += 1;
        else
            manual.push(entry.path);
    }
    if (!opts.dryRun)
        handleRefresh({ ...opts, repo: repoRoot });
    console.log(`Migrated ${moved} legacy worktree${moved === 1 ? "" : "s"} to ${targetRoot}.`);
    if (manual.length > 0) {
        console.log(`Manual follow-up required for locked/unmoved worktrees: ${manual.join(", ")}`);
    }
}
function handleAdopt(args, opts) {
    const [slug, worktreePath] = args;
    if (!slug || !worktreePath)
        throw new Error("Usage: wp worktree adopt <blueprint-slug> <path>");
    const repoRoot = getProjectRoot({ startDir: opts.repo ?? opts.cwd ?? process.cwd() });
    const binding = adoptBlueprintOwnerWorktree(repoRoot, slug, worktreePath);
    console.log(`Adopted ${worktreePath} as owner for ${slug}`);
    console.log(`  worktree_owner_id: ${binding.id}`);
    console.log(`  worktree_owner_branch: ${binding.branch}`);
}
function handleRebind(args, opts) {
    const slug = args[0];
    if (!slug)
        throw new Error("Usage: wp worktree rebind <blueprint-slug> [--path <path>]");
    const repoRoot = getProjectRoot({ startDir: opts.repo ?? opts.cwd ?? process.cwd() });
    const binding = opts.path
        ? adoptBlueprintOwnerWorktree(repoRoot, slug, opts.path)
        : ensureBlueprintOwnerWorktree(repoRoot, slug, { dryRun: opts.dryRun });
    console.log(`Rebound owner for ${slug}`);
    console.log(`  worktree_owner_id: ${binding.id}`);
    console.log(`  worktree_owner_branch: ${binding.branch}`);
    console.log(`  path: ${binding.path}`);
}
function handleRemove(nameOrPath, opts) {
    const cwd = opts.cwd ?? process.cwd();
    const repoRoot = getProjectRoot({ startDir: cwd });
    const entries = listEntries(repoRoot);
    const resolved = resolveWorktreePath(nameOrPath, entries);
    const gitArgs = ["worktree", "remove", resolved];
    if (opts.force)
        gitArgs.push("--force");
    const result = spawnSync("git", gitArgs, { cwd: repoRoot, stdio: "inherit" });
    if (result.status !== 0) {
        throw new Error("git worktree remove failed");
    }
}
function isDirty(path) {
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: path, encoding: "utf8" });
    if (status.status !== 0)
        return true;
    return String(status.stdout ?? "").trim().length > 0;
}
function currentBranch(repoRoot) {
    const result = spawnSync("git", ["branch", "--show-current"], {
        cwd: repoRoot,
        encoding: "utf8",
    });
    return result.status === 0 ? String(result.stdout ?? "").trim() : "";
}
function handleMergeCleanup(nameOrPath, opts) {
    const cwd = opts.cwd ?? process.cwd();
    const repoRoot = getProjectRoot({ startDir: cwd });
    const entries = listEntries(repoRoot);
    const resolved = resolveWorktreePath(nameOrPath, entries);
    const baseRef = opts.base?.trim() || "origin/main";
    const plan = decideMergeCleanup({
        repoRoot,
        targetPath: resolved,
        baseRef,
        entries,
        registryEntries: readWorktreeRegistry().entries,
        currentBranch: currentBranch(repoRoot),
        repoDirty: isDirty(repoRoot),
        targetDirty: isDirty(resolved),
    });
    if (opts.dryRun) {
        console.log("[dry-run] Would run merge cleanup:");
        console.log(`  remove: git ${plan.removeArgs.join(" ")}`);
        console.log(`  fetch:  git ${plan.fetchArgs.join(" ")}`);
        console.log(`  sync:   git ${plan.mergeArgs.join(" ")}`);
        return;
    }
    const removeResult = spawnSync("git", [...plan.removeArgs], { cwd: repoRoot, stdio: "inherit" });
    if (removeResult.status !== 0) {
        throw new Error("git worktree remove failed");
    }
    removeWorktreeRegistryEntries((candidate) => candidate.repoRoot === repoRoot && candidate.path === resolved);
    const fetchResult = spawnSync("git", [...plan.fetchArgs], { cwd: repoRoot, stdio: "inherit" });
    if (fetchResult.status !== 0) {
        throw new Error("git fetch --prune origin failed");
    }
    const mergeResult = spawnSync("git", [...plan.mergeArgs], { cwd: repoRoot, stdio: "inherit" });
    if (mergeResult.status !== 0) {
        throw new Error(`git merge --ff-only ${baseRef} failed`);
    }
    console.log(`Removed worktree ${resolved} and fast-forwarded ${repoRoot} to ${baseRef}.`);
}
export async function executeWorktreeSubcommand(subcommand, args, opts) {
    switch (subcommand) {
        case "root":
            handleRoot(opts);
            return;
        case "new": {
            const branch = args[0];
            await handleNew(branch ?? "", opts);
            return;
        }
        case "list": {
            handleList(opts);
            return;
        }
        case "refresh":
            handleRefresh(opts);
            return;
        case "prune":
            handlePrune(opts);
            return;
        case "migrate":
            handleMigrate(opts);
            return;
        case "adopt":
            handleAdopt(args, opts);
            return;
        case "rebind":
            handleRebind(args, opts);
            return;
        case "remove":
        case "rm": {
            const nameOrPath = args[0];
            if (!nameOrPath) {
                throw new Error("Usage: wp worktree remove <branch-or-path> [--force]");
            }
            handleRemove(nameOrPath, opts);
            return;
        }
        case "merge-cleanup": {
            const nameOrPath = args[0];
            if (!nameOrPath) {
                throw new Error("Usage: wp worktree merge-cleanup <branch-or-path> [--base <ref>] [--dry-run]");
            }
            handleMergeCleanup(nameOrPath, opts);
            return;
        }
        default: {
            throw new Error(`Unknown worktree subcommand: "${subcommand}"\n\nUse one of: root, new, list, refresh, prune, migrate, adopt, rebind, remove, merge-cleanup`);
        }
    }
}
//# sourceMappingURL=router-dispatch.js.map