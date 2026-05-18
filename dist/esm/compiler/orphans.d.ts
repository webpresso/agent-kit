export interface OrphanedSkill {
    readonly name: string;
    readonly path: string;
    readonly runtimeDir: string;
}
export declare function findOrphanedSkills(cwd: string): OrphanedSkill[];
export declare function removeOrphanedSkills(orphans: readonly OrphanedSkill[], dryRun: boolean): Promise<void>;
//# sourceMappingURL=orphans.d.ts.map