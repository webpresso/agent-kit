import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const GENERATED_SKILL_DIRS = [
    '.claude/skills',
    '.codex/skills',
    '.cursor/skills',
    '.windsurf/skills',
    '.gemini/skills',
    '.agents/skills',
    '.opencode/skills',
];
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