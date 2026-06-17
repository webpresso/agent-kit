export interface OrphanedSkill {
    readonly name: string;
    readonly path: string;
    readonly runtimeDir: string;
}
export declare function findOrphanedSkills(cwd: string): OrphanedSkill[];
/**
 * Prune leftover agent-kit skill symlinks from skill dirs that are no longer
 * active projection targets for the selected hosts. Only symlinks whose target
 * resolves into a skills source are removed — real (user-authored) directories,
 * the canonical `.agent/` SSOT, and non-skill symlinks are never touched.
 *
 * Returns the repo-relative-ish absolute paths removed (or that would be removed
 * in `dryRun`).
 */
export declare function pruneInactiveSkillDirs(cwd: string, activeSkillDirs: ReadonlySet<string>, dryRun: boolean): string[];
export declare function removeOrphanedSkills(orphans: readonly OrphanedSkill[], dryRun: boolean): Promise<void>;
//# sourceMappingURL=orphans.d.ts.map