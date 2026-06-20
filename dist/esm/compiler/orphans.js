import { existsSync, readdirSync, readlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const GENERATED_SKILL_DIRS = ['.claude/skills', '.agents/skills'];
/**
 * Skill dirs agent-kit projects (by symlink) for specific hosts. When a host
 * moves to plugin-based delivery (Claude, Codex) or is no longer selected, its
 * skill dir stops being an active projection target and any leftover symlinks
 * from a previous `wp setup` must be pruned so skills are not double-shown.
 */
const PRUNABLE_SKILL_DIRS = ['.claude/skills', '.agents/skills', '.opencode/skills'];
function listDirEntries(dir) {
    if (!existsSync(dir))
        return [];
    try {
        return readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isDirectory() || e.isSymbolicLink())
            .map((e) => e.name);
    }
    catch {
        return [];
    }
}
function listCanonicalSkills(cwd) {
    const canonicalDir = join(cwd, '.agent', 'skills');
    if (!existsSync(canonicalDir))
        return new Set();
    try {
        return new Set(readdirSync(canonicalDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() || e.isSymbolicLink())
            .map((e) => e.name));
    }
    catch {
        return new Set();
    }
}
export function findOrphanedSkills(cwd) {
    const canonical = listCanonicalSkills(cwd);
    const orphans = [];
    for (const runtimeDir of GENERATED_SKILL_DIRS) {
        const absDir = join(cwd, runtimeDir);
        for (const name of listDirEntries(absDir)) {
            if (!canonical.has(name)) {
                orphans.push({
                    name,
                    path: join(absDir, name),
                    runtimeDir,
                });
            }
        }
    }
    return orphans;
}
/**
 * Prune leftover agent-kit skill symlinks from skill dirs that are no longer
 * active projection targets for the selected hosts. Only symlinks whose target
 * resolves into a skills source are removed — real (user-authored) directories,
 * the canonical `.agent/` SSOT, and non-skill symlinks are never touched.
 *
 * Returns the repo-relative-ish absolute paths removed (or that would be removed
 * in `dryRun`).
 */
export function pruneInactiveSkillDirs(cwd, activeSkillDirs, dryRun) {
    const removed = [];
    for (const rel of PRUNABLE_SKILL_DIRS) {
        if (activeSkillDirs.has(rel))
            continue;
        const absDir = join(cwd, rel);
        if (!existsSync(absDir))
            continue;
        let entries;
        try {
            entries = readdirSync(absDir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            // Only prune symlinks: agent-kit always projects these dirs as symlinks,
            // so a real directory here is user-authored and must be preserved.
            if (!entry.isSymbolicLink())
                continue;
            const linkPath = join(absDir, entry.name);
            let target;
            try {
                target = readlinkSync(linkPath, 'utf8');
            }
            catch {
                continue;
            }
            // Guard: only remove links that point at a skills source.
            if (!target.includes('skills'))
                continue;
            if (!dryRun)
                rmSync(linkPath, { force: true });
            removed.push(linkPath);
        }
    }
    return removed;
}
export async function removeOrphanedSkills(orphans, dryRun) {
    const canonicalPrefix = '.agent/';
    for (const orphan of orphans) {
        // Safety guard: never remove anything under .agent/
        if (orphan.path.includes(`${canonicalPrefix}skills`)) {
            throw new Error(`removeOrphanedSkills: refusing to remove canonical source path: ${orphan.path}`);
        }
        if (!dryRun) {
            rmSync(orphan.path, { recursive: true, force: true });
        }
    }
}
//# sourceMappingURL=orphans.js.map